"use client";

/**
 * The outbox.
 *
 * Everything captured is written here first and posted afterwards, online or
 * not. One code path, no branch on connectivity — which is the point: the
 * moment capture can fail, you stop trusting it, and the moment you stop
 * trusting it you go back to holding things in your head.
 *
 * The service worker owns the same database and flushes it on `sync`; this
 * module is what the page uses.
 */

import { TABS } from "./nav";

const DB_NAME = "proyectos-offline";
const DB_VERSION = 1;

export interface OutboxItem {
  id?: number;
  collection: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts?: number;
  error?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(store: IDBObjectStore, req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  name: "outbox" | "meta",
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDB();
  const store = db.transaction(name, mode).objectStore(name);
  return run(store, fn(store));
}

/** Queue a record for a PocketBase collection. */
export async function queue(
  collection: string,
  payload: Record<string, unknown>
): Promise<void> {
  await withStore("outbox", "readwrite", (s) =>
    s.add({ collection, payload, createdAt: Date.now() } satisfies OutboxItem)
  );
}

export async function pending(): Promise<OutboxItem[]> {
  try {
    return await withStore("outbox", "readonly", (s) => s.getAll());
  } catch {
    return [];
  }
}

/**
 * The service worker needs the auth token to post on your behalf later, and it
 * cannot read document.cookie. Mirror it into IndexedDB.
 */
export async function syncToken(): Promise<void> {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith("pb_auth="))
    ?.slice("pb_auth=".length);
  if (!raw) return;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { token?: string };
    if (parsed.token) {
      await withStore("meta", "readwrite", (s) => s.put({ key: "token", value: parsed.token }));
    }
  } catch {
    // malformed cookie: nothing to mirror
  }
}

/**
 * Ask the worker to keep a current copy of the screens reachable from the bar.
 *
 * The list comes from here rather than from the worker so `lib/nav.ts` stays
 * the only place destinations are declared; the worker throttles the sweep, so
 * calling this on every load is cheap.
 */
export async function warmPages(): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  reg?.active?.postMessage({ type: "warm-pages", urls: TABS.map((t) => t.href) });
}

/** Ask the service worker to drain the queue; fall back to doing it here. */
export async function flush(): Promise<void> {
  await syncToken();

  const reg = await navigator.serviceWorker?.getRegistration();

  if (reg) {
    // Background Sync survives the tab being closed. Where it is unavailable
    // (Safari, Firefox) the postMessage path still runs while the tab lives.
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register(t: string): Promise<void> } })
      .sync;
    try {
      await sync?.register("flush-outbox");
    } catch {
      // not supported: the message below is the fallback
    }
    reg.active?.postMessage({ type: "flush-outbox" });
    return;
  }

  await flushHere();
}

/** Direct drain, for browsers without a controlling service worker. */
export async function flushHere(): Promise<void> {
  const items = await pending();
  if (!items.length) return;

  for (const item of items) {
    let res: Response;
    try {
      res = await fetch(`/api/collections/${item.collection}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(item.payload),
      });
    } catch {
      return; // still offline
    }
    if (res.ok && item.id != null) {
      await withStore("outbox", "readwrite", (s) => s.delete(item.id!));
    } else if (res.status === 401 || res.status === 403) {
      return;
    }
  }
}
