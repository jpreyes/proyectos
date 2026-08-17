/* Service worker — escrito a mano, sin build y sin dependencias.
 *
 * Desde que la app es local-first, el papel de este archivo cambió y se
 * simplificó. Antes tenía que guardar cada pantalla *renderizada*, porque el
 * HTML traía los datos; ahora el HTML es una cáscara vacía y los datos salen de
 * la réplica en IndexedDB. O sea:
 *
 *   - assets — salida de build con hash en el nombre, cache primero.
 *   - shells — **una** cáscara por forma de ruta, no una por URL. La de
 *              /w/:id sirve para cualquier proyecto, incluido uno que este
 *              dispositivo nunca abrió. Eso funciona porque las pantallas leen
 *              el id de la barra de direcciones (ver lib/local/route.ts) y no
 *              del árbol que mandó el servidor.
 *   - /offline — último recurso, para una forma de ruta nunca vista.
 *
 * Nada de /api se cachea: los datos ya están en la réplica, y una respuesta
 * vieja del servidor solo podría contradecirla.
 *
 * La otra mitad del trabajo es la cola de escrituras. La app la vacía mientras
 * está abierta; acá se vacía cuando ya la cerraste y la señal volvió después
 * —capturar algo en el ascensor y bloquear el teléfono— que es el único caso
 * que la pestaña no puede cubrir.
 */

// v6: cáscaras por forma de ruta en vez de copias por URL, y la cola pasa a
// llevar operaciones (crear/actualizar/borrar) en vez de solo capturas.
const VERSION = "v7";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const SHELLS = `shells-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/icons/192", "/icons/512"];

/** Como mucho un barrido de precalentamiento cada este intervalo. */
const WARM_INTERVAL_MS = 10 * 60 * 1000;

/* ------------------------------------------------------------- rutas ----- */

/**
 * La forma de una ruta: /w/abc123 -> /w/:id.
 *
 * Es la clave con la que se guarda y se busca una cáscara. La lista es corta y
 * explícita a propósito: adivinar qué segmento es un id a partir de su forma
 * confundiría /finanzas/nuevo con /finanzas/:id, y serviría el formulario de
 * edición en lugar del de creación.
 */
const ROUTE_SHAPES = [
  [/^\/w\/[^/]+\/editar$/, "/w/:id/editar"],
  [/^\/w\/nuevo$/, "/w/nuevo"],
  [/^\/w\/[^/]+$/, "/w/:id"],
  [/^\/finanzas\/nuevo$/, "/finanzas/nuevo"],
  [/^\/finanzas\/[^/]+$/, "/finanzas/:id"],
  [/^\/recurrentes\/nuevo$/, "/recurrentes/nuevo"],
  [/^\/recurrentes\/[^/]+$/, "/recurrentes/:id"],
  [/^\/presupuestos\/[^/]+\/imprimir$/, "/presupuestos/:id/imprimir"],
  [/^\/presupuestos\/[^/]+$/, "/presupuestos/:id"],
];

function routeShape(pathname) {
  for (const [pattern, shape] of ROUTE_SHAPES) {
    if (pattern.test(pathname)) return shape;
  }
  return pathname; // rutas fijas: /, /inbox, /calendario…
}

/** La clave de cache. Se usa una URL sintética porque Cache API exige una. */
function shellKey(pathname) {
  return `${self.location.origin}/__shell${routeShape(pathname)}`;
}

/* ----------------------------------------------------------- lifecycle -- */

/**
 * `res.text()` entrega el cuerpo ya decodificado, pero las cabeceras siguen
 * describiendo el comprimido. Cloudflare comprime con brotli, así que copiarlas
 * tal cual guarda un HTML rotulado `content-encoding: br`: el navegador intenta
 * descomprimir texto plano y la página no carga. Safari lo tolera, que es lo que
 * mantuvo esto escondido. Content-Length miente igual.
 */
function decodedHeaders(res) {
  const headers = new Headers(res.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return headers;
}

/**
 * Cachear solo el HTML de /offline no basta: sin su JavaScript la página se
 * dibuja pero nunca hidrata, así que el cuadro de captura se ve bien y no
 * guarda nada — el peor fallo posible justo en la pantalla que tiene que
 * funcionar. Se lee el marcado y se cachea lo que pida.
 */
async function precacheOfflineShell(cache) {
  const res = await fetch(OFFLINE_URL, { cache: "reload" });
  const html = await res.text();
  await cache.put(OFFLINE_URL, new Response(html, { headers: decodedHeaders(res) }));

  const refs = new Set();
  const pattern = /(?:src|href)="(\/_next\/[^"]+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) refs.add(match[1]);

  await Promise.all([...refs].map((url) => cache.add(url).catch(() => undefined)));
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
          // /offline inalcanzable al instalar; la copia simple de arriba queda
          // cacheada y se refresca en la próxima activación
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
            .filter((k) => k !== SHELL && k !== ASSETS && k !== SHELLS)
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

  // PocketBase nunca se cachea. La réplica local ya tiene los datos; una
  // respuesta guardada solo podría contradecirla, y el SSE de /api/realtime
  // no puede pasar por acá.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_/")) return;

  // Salida de build inmutable: cache primero.
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

  // Las peticiones RSC de la navegación interna se dejan pasar sin tocar: si
  // fallan, el enrutador de Next cae en una navegación completa, que sí entra
  // por acá y encuentra la cáscara.
  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
  }
});

/**
 * Un fetch fallido no es lo mismo que estar sin conexión, y tratarlo así es
 * como se termina viendo la pantalla de "sin conexión" en un teléfono con
 * señal completa. El aparato salta entre wifi y datos, y iCloud Private Relay
 * rota su nodo de salida cada pocos minutos; ambas cosas cortan la conexión en
 * vuelo. Va un segundo intento sobre una conexión nueva antes de concluir que
 * no hay servidor.
 */
async function navigate(request) {
  let res = null;

  try {
    res = await fetch(request);
  } catch (_) {
    // Un redespliegue tarda unos segundos en volver: mejor esperar un momento
    // que reintentar contra el mismo socket muerto.
    await new Promise((resolve) => setTimeout(resolve, 400));

    try {
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
    saveShell(request.url, res.clone()).catch(() => undefined);
    return res;
  }

  const shells = await caches.open(SHELLS);
  const hit =
    (await shells.match(shellKey(new URL(request.url).pathname))) ||
    (await caches.match(OFFLINE_URL));

  // respondWith(undefined) se ve como un error de red, que se lee como si el
  // navegador se hubiera caído. Nunca devolver nada vacío.
  return (
    hit ||
    new Response("<!doctype html><meta charset=utf-8><title>Sin conexión</title>", {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  );
}

/**
 * Guarda la cáscara de esta forma de ruta.
 *
 * Una por forma, no una por URL: como el HTML ya no trae datos, la de un
 * proyecto sirve para todos, y el cache deja de crecer con cada cosa que
 * abres. El cuerpo se reenvuelve en vez de guardarse tal como llegó, por lo
 * que explica `decodedHeaders`.
 */
async function saveShell(url, res) {
  if (!res.ok || res.redirected || res.type === "opaqueredirect") return;
  if (!(res.headers.get("content-type") || "").includes("text/html")) return;

  const path = new URL(url).pathname;
  // Un formulario de login cacheado y servido después de que caduca la sesión
  // es un callejón sin salida, y /offline ya vive en el cache de la cáscara.
  if (path === "/login" || path === OFFLINE_URL) return;

  const body = await res.blob();
  const cache = await caches.open(SHELLS);
  await cache.put(shellKey(path), new Response(body, { status: 200, headers: decodedHeaders(res) }));
}

/**
 * Trae las cáscaras de los destinos de la barra mientras hay red, para que el
 * primer toque sin conexión caiga en una pantalla real. La lista la manda la
 * página (lib/nav.ts sigue siendo la única fuente); el intervalo vive acá
 * porque el worker sobrevive a cualquier carga de página.
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
      await saveShell(new URL(url, self.location.origin).href, res);
    } catch (_) {
      break; // se fue la red a mitad del barrido; lo guardado igual cuenta
    }
  }
}

/* ------------------------------------------------------------ outbox ---- */
/* Espeja web/src/lib/local/db.ts — duplicado a propósito: un service worker no
 * puede compartir módulos con la app sin un paso de bundling. Cualquier cambio
 * de esquema va en los dos lados. */

const DB_NAME = "proyectos-offline";
const DB_VERSION = 2;

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
      if (!db.objectStoreNames.contains("records")) {
        const store = db.createObjectStore("records", { keyPath: "key" });
        store.createIndex("collection", "collection", { unique: false });
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

/** La misma petición que haría la app para una escritura de la cola. */
function requestFor(item, token) {
  const base = `/api/collections/${item.collection}/records`;
  const headers = { "Content-Type": "application/json", Authorization: token };

  if (item.op === "update") {
    return [
      `${base}/${item.recordId}`,
      { method: "PATCH", headers, body: JSON.stringify(item.payload || {}) },
    ];
  }
  if (item.op === "delete") {
    return [`${base}/${item.recordId}`, { method: "DELETE", headers }];
  }
  // create — y también el formato viejo de la cola de capturas, que no traía
  // `op` ni `recordId`: se manda como creación sin id y el servidor lo pone.
  const body = item.recordId
    ? { id: item.recordId, ...(item.payload || {}) }
    : item.payload || {};
  return [base, { method: "POST", headers, body: JSON.stringify(body) }];
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
    const [url, init] = requestFor(item, token);

    let res;
    try {
      res = await fetch(url, init);
    } catch (_) {
      break; // sigue sin red: parar y dejar el resto en la cola
    }

    if (res.ok) {
      await del(db, "outbox", item.id);
      sent++;
      continue;
    }

    // La sesión caducó. Se guarda todo y que la página vuelva a autenticarse.
    if (res.status === 401 || res.status === 403) break;

    // Actualizar o borrar algo que ya no está: la intención se cumplió sola.
    if (res.status === 404 && item.op !== "create") {
      await del(db, "outbox", item.id);
      sent++;
      continue;
    }

    // Rechazado por otra razón: se guarda con el motivo para que la app decida,
    // en vez de reintentar en silencio para siempre.
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
