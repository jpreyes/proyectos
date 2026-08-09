/* Service worker — hand written, no build step, no dependency.
 *
 * Scope is deliberately narrow. The app is server-rendered, so it cannot run
 * offline as a whole; what must never fail is *capture*. The whole premise of
 * the system is that writing something down costs less than holding it in your
 * head, and that breaks the moment the network does.
 *
 * So: the shell and static assets are cached, navigations fall back to a real
 * offline page that can still capture, and captures live in IndexedDB until
 * they can be posted.
 */

const VERSION = "v2";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/icons/192", "/icons/512"];

/* ----------------------------------------------------------- lifecycle -- */

/**
 * Caching the offline HTML is not enough: without its own JavaScript the page
 * renders but never hydrates, so the capture box looks fine and silently does
 * nothing — the worst possible failure for the one screen that has to work.
 * So read the markup and cache whatever it asks for.
 */
async function precacheOfflineShell(cache) {
  const res = await fetch(OFFLINE_URL, { cache: "reload" });
  const html = await res.text();
  await cache.put(OFFLINE_URL, new Response(html, { headers: res.headers }));

  const refs = new Set();
  const pattern = /(?:src|href)="(\/_next\/[^"]+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) refs.add(match[1]);

  await Promise.all(
    [...refs].map((url) => cache.add(url).catch(() => undefined))
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then(async (cache) => {
        await cache.addAll(PRECACHE);
        try {
          await precacheOfflineShell(cache);
        } catch (_) {
          // offline page unreachable at install time; the plain copy above
          // is still cached and will be refreshed on the next activation
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* --------------------------------------------------------------- fetch -- */

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never serve stale API data: wrong numbers are worse than no numbers.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_/")) return;

  // Immutable build output: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
    return;
  }

  // Pages: network first, offline page as the last resort.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((hit) => hit || caches.match(OFFLINE_URL))
      )
    );
  }
});

/* ------------------------------------------------------------ outbox ---- */
/* Mirrors web/src/lib/offline.ts — kept duplicated on purpose, a service
 * worker cannot share module code with the page without a bundler step. */

const DB_NAME = "proyectos-offline";
const DB_VERSION = 1;

function openDB() {
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

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function getAll(db, store) {
  return new Promise((resolve, reject) => {
    const req = tx(db, store, "readonly").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function get(db, store, key) {
  return new Promise((resolve, reject) => {
    const req = tx(db, store, "readonly").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function put(db, store, value) {
  return new Promise((resolve, reject) => {
    const req = tx(db, store, "readwrite").put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function del(db, store, key) {
  return new Promise((resolve, reject) => {
    const req = tx(db, store, "readwrite").delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function flushOutbox() {
  const db = await openDB();
  const items = await getAll(db, "outbox");
  if (!items.length) return { sent: 0, left: 0 };

  const auth = await get(db, "meta", "token");
  const token = auth && auth.value;
  if (!token) return { sent: 0, left: items.length };

  let sent = 0;

  for (const item of items) {
    let res;
    try {
      res = await fetch(`/api/collections/${item.collection}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify(item.payload),
      });
    } catch (_) {
      break; // still offline: stop, keep the rest queued
    }

    if (res.ok) {
      await del(db, "outbox", item.id);
      sent++;
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      // Session expired. Keep everything and let the page re-authenticate.
      break;
    }

    // Rejected for another reason: keep it, but record why so the UI can say so
    // instead of retrying forever in silence.
    item.error = `HTTP ${res.status}`;
    item.attempts = (item.attempts || 0) + 1;
    await put(db, "outbox", item);
  }

  const left = (await getAll(db, "outbox")).length;

  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: "outbox-flushed", sent, left });

  return { sent, left };
}

self.addEventListener("sync", (event) => {
  if (event.tag === "flush-outbox") event.waitUntil(flushOutbox());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "flush-outbox") {
    event.waitUntil(flushOutbox());
  }
});
