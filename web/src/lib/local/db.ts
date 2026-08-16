"use client";

/**
 * La capa de persistencia local: IndexedDB.
 *
 * Tres almacenes, con tres roles distintos:
 *
 *   - `records` — la réplica. Una copia de cada registro tuyo, tal como está en
 *     PocketBase. Es lo que la app lee; el servidor no se consulta para pintar
 *     una pantalla.
 *   - `outbox`  — las escrituras que todavía no llegan al servidor. Toda
 *     escritura pasa por acá, haya red o no: una app que a veces guarda y a
 *     veces no deja de ser confiable, y entonces vuelves a sostener las cosas
 *     en la cabeza.
 *   - `meta`    — el token para el service worker y las marcas de tiempo del
 *     sincronizador.
 *
 * Este módulo es deliberadamente tonto: abre, lee, escribe. Quién decide qué
 * guardar vive en `sync.ts` y `mutate.ts`; qué se muestra, en `store.ts`.
 *
 * `public/sw.js` abre esta misma base con su propio código. La duplicación es a
 * propósito — un service worker no puede importar módulos de la app sin un paso
 * de bundling — así que **cualquier cambio de esquema va en los dos lados**.
 */

const DB_NAME = "proyectos-offline";
/** v2 agrega `records`: antes esto era solo la cola de captura. */
const DB_VERSION = 2;

export type Row = Record<string, unknown> & { id: string; updated?: string };

/** Una fila de la réplica. `key` es `colección:id` para no necesitar índices compuestos. */
export interface StoredRecord {
  key: string;
  collection: string;
  id: string;
  data: Row;
}

/**
 * Una escritura pendiente.
 *
 * `recordId` existe también para las creaciones: el id se genera en el
 * dispositivo (ver `mutate.ts`), así que una relación creada sin red apunta
 * desde el primer momento al id definitivo y no hay que reescribir nada cuando
 * la creación sube.
 */
export interface Mutation {
  id?: number;
  op: "create" | "update" | "delete";
  collection: string;
  recordId: string;
  /** Registro completo en `create`, parche en `update`, ausente en `delete`. */
  payload?: Record<string, unknown>;
  createdAt: number;
  attempts?: number;
  error?: string;
}

export function recordKey(collection: string, id: string): string {
  return `${collection}:${id}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
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

  // Un fallo al abrir no puede dejar la promesa cacheada: el siguiente intento
  // tiene que poder volver a probar.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* ------------------------------------------------------------- réplica ---- */

/** Todo lo guardado, de una. Es lo que se carga al arrancar. */
export async function allRecords(): Promise<StoredRecord[]> {
  const db = await openDB();
  const tx = db.transaction("records", "readonly");
  return wrap(tx.objectStore("records").getAll() as IDBRequest<StoredRecord[]>);
}

/** Escribe en lote: una transacción para toda la tanda que trae el sync. */
export async function putRecords(items: StoredRecord[]): Promise<void> {
  if (!items.length) return;
  const db = await openDB();
  const tx = db.transaction("records", "readwrite");
  const store = tx.objectStore("records");
  for (const item of items) store.put(item);
  await done(tx);
}

export async function deleteRecords(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const db = await openDB();
  const tx = db.transaction("records", "readwrite");
  const store = tx.objectStore("records");
  for (const key of keys) store.delete(key);
  await done(tx);
}

/** Se usa al cerrar sesión: la réplica es de la cuenta que la bajó. */
export async function clearRecords(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(["records", "meta"], "readwrite");
  tx.objectStore("records").clear();
  tx.objectStore("meta").delete("lastSync");
  await done(tx);
}

/* -------------------------------------------------------------- outbox ---- */

export async function outboxAdd(m: Mutation): Promise<number> {
  const db = await openDB();
  const tx = db.transaction("outbox", "readwrite");
  const id = await wrap(tx.objectStore("outbox").add(m) as IDBRequest<IDBValidKey>);
  await done(tx);
  return Number(id);
}

/** En orden de llegada: `add` con clave autoincremental ya los devuelve así. */
export async function outboxAll(): Promise<Mutation[]> {
  try {
    const db = await openDB();
    const tx = db.transaction("outbox", "readonly");
    return await wrap(tx.objectStore("outbox").getAll() as IDBRequest<Mutation[]>);
  } catch {
    return [];
  }
}

export async function outboxDelete(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("outbox", "readwrite");
  tx.objectStore("outbox").delete(id);
  await done(tx);
}

export async function outboxPut(m: Mutation): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("outbox", "readwrite");
  tx.objectStore("outbox").put(m);
  await done(tx);
}

/* ---------------------------------------------------------------- meta ---- */

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  try {
    const db = await openDB();
    const tx = db.transaction("meta", "readonly");
    const row = await wrap(
      tx.objectStore("meta").get(key) as IDBRequest<{ key: string; value: T } | undefined>
    );
    return row?.value;
  } catch {
    return undefined;
  }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key, value });
  await done(tx);
}

/**
 * El service worker necesita el token para subir la cola cuando la pestaña ya
 * no existe, y no puede leer document.cookie. Se refleja acá.
 */
export async function syncToken(): Promise<void> {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith("pb_auth="))
    ?.slice("pb_auth=".length);
  if (!raw) return;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { token?: string };
    if (parsed.token) await setMeta("token", parsed.token);
  } catch {
    // cookie malformada: no hay nada que reflejar
  }
}
