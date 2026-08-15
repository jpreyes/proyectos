/* Service worker — hand written, no build step, no dependency.
 *
 * The app is server-rendered, so it cannot *run* offline as a whole. But losing
 * the network should not feel like an outage: every page you open is kept as it
 * was rendered, so going offline keeps showing the app instead of an error
 * screen, and captures live in IndexedDB until they can be posted.
 *
 * Layers, in order of how much they can be trusted:
 *   - assets  — content-hashed build output, cache first, never stale.
 *   - pages   — the last rendered copy of each visited screen. Stale by
 *               definition; served only when the network is genuinely gone,
 *               and the UI says so passively (components/OfflineBadge).
 *   - shell   — /offline, the last resort for a screen never opened before.
 * API responses are never cached: wrong numbers are worse than no numbers.
 */

// v5: adds the `pages` cache, which is what removes the offline takeover
// screen for anything already visited. v4 evicted the /offline copy stored by
// v3 and earlier, which carried a bogus `content-encoding`.
const VERSION = "v5";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/icons/192", "/icons/512"];

/** At most one warm-up sweep of the tab bar destinations per this interval. */
const WARM_INTERVAL_MS = 10 * 60 * 1000;
/** How many rendered screens to keep. Re-putting a page refreshes its slot. */
const PAGE_LIMIT = 80;

/* ----------------------------------------------------------- lifecycle -- */

/**
 * Caching the offline HTML is not enough: without its own JavaScript the page
 * renders but never hydrates, so the capture box looks fine and silently does
 * nothing — the worst possible failure for the one screen that has to work.
 * So read the markup and cache whatever it asks for.
 */
/**
 * `res.text()` hands back the *decoded* body, but the headers still describe the
 * encoded one. Cloudflare brotli-compresses this route, so copying them verbatim
 * caches HTML labelled `content-encoding: br`; the browser then tries to brotli-
 * decode plain text and the page fails to load at all. Safari happens to tolerate
 * it, which is what kept this hidden. Content-Length lies the same way.
 */
function decodedHeaders(res) {
  const headers = new Headers(res.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return headers;
}

async function precacheOfflineShell(cache) {
  const res = await fetch(OFFLINE_URL, { cache: "reload" });
  const html = await res.text();
  await cache.put(OFFLINE_URL, new Response(html, { headers: decodedHeaders(res) }));

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
          keys
            .filter((k) => k !== SHELL && k !== ASSETS && k !== PAGES)
            .map((k) => caches.delete(k))
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
    event.respondWith(navigate(request));
  }
});

/**
 * One failed fetch is not the same thing as being offline, and treating it that
 * way is how you get the offline page on a phone with full signal. A handset
 * hands off between wifi and cellular, and iCloud Private Relay rotates its
 * egress node every few minutes; either drops the connection in flight. So a
 * navigation gets a second attempt on a fresh connection before we conclude
 * there is no server — the retry costs a moment of blank screen, and the wrong
 * answer costs the whole app.
 */
async function navigate(request) {
  let res = null;

  try {
    res = await fetch(request);
  } catch (_) {
    // A redeploy takes a few seconds to come back up, so give it a beat rather
    // than retrying into the same dead socket.
    await new Promise((resolve) => setTimeout(resolve, 400));

    try {
      // The request body is already consumed by the first attempt; navigations
      // are GETs, so a clone is unnecessary, but a fresh Request drops any
      // connection the failed attempt was pinned to.
      res = await fetch(request.url, {
        credentials: "include",
        headers: request.headers,
        redirect: "manual",
      });
    } catch (_) {
      res = null;
    }
  }

  if (res) {
    // Keep the copy, but do not make the user wait for the write.
    savePage(request.url, res.clone()).catch(() => undefined);
    return res;
  }

  const pages = await caches.open(PAGES);
  const hit = (await pages.match(request.url)) || (await caches.match(OFFLINE_URL));

  // respondWith(undefined) surfaces as a network error, which reads as a
  // browser crash rather than "you are offline". Never hand back nothing.
  return (
    hit ||
    new Response("<!doctype html><meta charset=utf-8><title>Sin conexión</title>", {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  );
}

/**
 * Store a rendered page so the same screen can be opened again with no network.
 *
 * The body is re-wrapped rather than stored as it arrived, for the reason in
 * `decodedHeaders`. Keys are plain URL strings on both sides — put and match —
 * so no `Vary` header can turn a hit into a miss.
 *
 * This holds signed-in HTML, the same way the browser's own back/forward cache
 * does; the app is single-user per device, so that is the whole exposure.
 */
async function savePage(url, res) {
  if (!res.ok || res.redirected || res.type === "opaqueredirect") return;
  if (!(res.headers.get("content-type") || "").includes("text/html")) return;

  const path = new URL(url).pathname;
  // A cached login form served after a session expires is a dead end, and
  // /offline already lives in the shell cache.
  if (path === "/login" || path === OFFLINE_URL) return;

  const body = await res.blob();
  const cache = await caches.open(PAGES);
  await cache.put(url, new Response(body, { status: 200, headers: decodedHeaders(res) }));

  // Every project, quote and entity you open is a screen; without a ceiling the
  // cache grows for as long as the app is installed. `keys()` is in insertion
  // order, so the oldest copies go first.
  const keys = await cache.keys();
  if (keys.length > PAGE_LIMIT) {
    await Promise.all(keys.slice(0, keys.length - PAGE_LIMIT).map((k) => cache.delete(k)));
  }
}

/**
 * Pull the tab bar destinations into the page cache while there is a network,
 * so the first offline tap lands on a real screen instead of a fallback. The
 * page sends the list (lib/nav.ts stays the single source of truth); the
 * throttle lives here because the worker outlives any one page load.
 */
async function warmPages(urls) {
  if (!Array.isArray(urls) || !urls.length) return;

  const db = await openDB();
  const last = await get(db, "meta", "lastWarm");
  const now = Date.now();
  if (last && now - last.value < WARM_INTERVAL_MS) return;
  await put(db, "meta", { key: "lastWarm", value: now });

  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: "include" });
      await savePage(new URL(url, self.location.origin).href, res);
    } catch (_) {
      break; // network went away mid-sweep; whatever was stored still counts
    }
  }
}

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
  if (!event.data) return;
  if (event.data.type === "flush-outbox") {
    event.waitUntil(flushOutbox());
  }
  if (event.data.type === "warm-pages") {
    event.waitUntil(warmPages(event.data.urls).catch(() => undefined));
  }
});
