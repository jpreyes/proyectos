"use client";

/**
 * El sincronizador. Dos direcciones, independientes entre sí.
 *
 * **Bajada.** Por cada colección se pide el índice —solo `id` y `updated`— y se
 * compara con el local. Lo que cambió se trae; lo que ya no está en el índice
 * se borra de la réplica. Se eligió comparar índices en vez de arrastrar un
 * cursor por `updated` porque la mitad de las colecciones se borra en duro
 * (`routine_log`, `quote_items`, `deliverables`, el catálogo): un cursor solo ve
 * lo que existe, así que jamás se enteraría de una fila que desapareció, y la
 * réplica mostraría para siempre algo que ya no está. El índice completo es la
 * única lápida que PocketBase entrega gratis. Con los datos de una persona son
 * veinte peticiones diminutas; si esto creciera a decenas de miles de filas
 * habría que volver al cursor y agregar una colección de lápidas.
 *
 * **Subida.** La cola de `outbox`, en orden y de a una. Un fallo de red detiene
 * la tanda y se reintenta después; un rechazo del servidor no se reintenta para
 * siempre — se registra y se suelta, porque una cola atascada en un registro
 * inválido bloquea todo lo que venga detrás.
 *
 * **Conflictos.** Gana el último que escribe, campo por registro. Con una sola
 * persona y dos dispositivos es lo correcto y lo predecible; lo que no se hace
 * es dejar que la bajada pise una escritura tuya que todavía no ha subido: si
 * hay algo pendiente para ese registro, el parche local se vuelve a aplicar
 * encima de lo que vino del servidor.
 *
 * Además de esto hay tiempo real (SSE): mientras la pestaña está visible,
 * PocketBase avisa de cada cambio y la pantalla se actualiza sola. La bajada
 * completa es la red de seguridad para lo que ocurrió mientras no estabas.
 */

import type { ClientResponseError, RecordModel } from "pocketbase";
import { pbBrowser } from "../pb.client";
import {
  clearRecords,
  deleteRecords,
  getMeta,
  type Mutation,
  outboxAdd,
  outboxAll,
  outboxDelete,
  outboxPut,
  putRecords,
  recordKey,
  type Row,
  setMeta,
  syncToken,
} from "./db";
import * as store from "./store";
import { COLLECTIONS } from "./store";

/** Cada cuánto se hace una bajada completa mientras la app está abierta. */
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
/** Reintentos antes de soltar una escritura que el servidor rechaza. */
const MAX_ATTEMPTS = 5;
/** Sobre este número de registros cambiados conviene traer la colección entera. */
const BULK_THRESHOLD = 150;

/* --------------------------------------------------------------- estado --- */

let started = false;
let syncing: Promise<void> | null = null;
let pushing: Promise<void> | null = null;
/**
 * Alguien pidió sincronizar mientras ya había una tanda en curso.
 *
 * Sin esto, fusionar las llamadas en la promesa que ya corre se traga el aviso:
 * el teléfono pierde la señal a mitad de una subida, la petición queda colgada
 * medio minuto, vuelve la red, y el `online` que debería reintentar se disuelve
 * en la promesa moribunda. La cola se quedaba quieta hasta el siguiente
 * temporizador. Se anota la petición y se repite al terminar.
 */
let syncAgain = false;
let pushAgain = false;
let timer: ReturnType<typeof setInterval> | null = null;
let subscribed = false;

/**
 * Parches todavía no subidos, por registro. Es lo que impide que una bajada
 * revierta en pantalla algo que acabas de escribir sin red.
 */
const pending = new Map<string, Record<string, unknown>>();
/** Escrituras que el servidor rechazó y se soltaron. Se muestran en la píldora. */
let rejected = 0;

export interface SyncState {
  /** Escrituras esperando subir. */
  queued: number;
  /** Escrituras descartadas porque el servidor las rechazó. */
  rejected: number;
  /** Última bajada completa con éxito, en ms. */
  lastSync: number | null;
  syncing: boolean;
}

let state: SyncState = { queued: 0, rejected: 0, lastSync: null, syncing: false };
const stateListeners = new Set<() => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(fn: () => void): () => void {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

function setState(patch: Partial<SyncState>) {
  const next = { ...state, ...patch };
  if (
    next.queued === state.queued &&
    next.rejected === state.rejected &&
    next.lastSync === state.lastSync &&
    next.syncing === state.syncing
  ) {
    return;
  }
  state = next;
  for (const fn of stateListeners) fn();
}

async function refreshQueueCount() {
  const items = await outboxAll();
  setState({ queued: items.length, rejected });
}

/* ------------------------------------------------------------ arranque ---- */

/**
 * Carga la réplica desde IndexedDB y deja la app usable. Todo lo que viene
 * después —bajada, subida, tiempo real— ocurre con la pantalla ya pintada.
 */
export async function boot(): Promise<void> {
  if (started) return;
  started = true;

  try {
    const { allRecords } = await import("./db");
    const rows = await allRecords();
    store.hydrate(rows.map((r) => ({ collection: r.collection, data: r.data })));
    state = { ...state, lastSync: (await getMeta<number>("lastSync")) ?? null };
  } catch {
    // sin IndexedDB (modo privado antiguo, cuota llena) la app sigue viva:
    // se queda con lo que traiga la bajada, en memoria
  }

  store.setReady();
  await refreshQueueCount();

  void syncNow();
  listen();
}

function listen() {
  if (timer) return;

  // El latido va cada minuto, pero hace dos cosas distintas. La bajada completa
  // solo cada cinco; la subida, siempre que quede algo en la cola. Es que la
  // señal vuelve muchas veces sin que el navegador emita `online` —salir del
  // ascensor, el wifi que reengancha— y esperar cinco minutos con algo escrito
  // sin subir es justo el rato en que uno cierra la app y se olvida.
  let ticks = 0;
  timer = setInterval(() => {
    ticks++;
    if (state.queued > 0) void push();
    if (ticks % 5 === 0) void syncNow();
  }, SYNC_INTERVAL_MS / 5);

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
}

function onOnline() {
  void syncNow();
}

function onVisible() {
  if (document.visibilityState === "visible") void syncNow();
}

/** Al cerrar sesión la réplica se va con ella: es de la cuenta que la bajó. */
export async function wipe(): Promise<void> {
  unsubscribeRealtime();
  store.clear();
  pending.clear();
  await clearRecords().catch(() => undefined);
  setState({ lastSync: null });
}

/* ------------------------------------------------------------- bajada ----- */

/** Una bajada completa: subir primero lo pendiente, después traer los cambios. */
export function syncNow(): Promise<void> {
  if (syncing) {
    syncAgain = true;
    return syncing;
  }

  syncing = (async () => {
    setState({ syncing: true });
    try {
      await syncToken();
      await push();
      await pull();
      await setMeta("lastSync", Date.now());
      setState({ lastSync: Date.now() });
      ensureRealtime();
    } catch {
      // sin red o sesión caída: se reintenta en el próximo disparo
    } finally {
      setState({ syncing: false });
      syncing = null;
    }

    if (syncAgain) {
      syncAgain = false;
      await syncNow();
    }
  })();

  return syncing;
}

async function pull(): Promise<void> {
  const pb = pbBrowser();
  if (!pb.authStore.isValid) return;

  let changed = false;
  for (const name of COLLECTIONS) {
    try {
      if (await pullCollection(name)) changed = true;
    } catch {
      // una colección que falla no puede tumbar el resto de la bajada
    }
  }
  if (changed) store.flushNotify();
}

/** Devuelve true si algo cambió de verdad. */
async function pullCollection(name: string): Promise<boolean> {
  const pb = pbBrowser();

  /* 1. el índice del servidor */
  const remote = new Map<string, string>();
  for (let page = 1; page <= 40; page++) {
    const res = await pb.collection(name).getList(page, 500, {
      fields: "id,updated",
      sort: "id",
      skipTotal: true,
      requestKey: null,
    });
    for (const item of res.items) remote.set(item.id, String(item.updated || ""));
    if (res.items.length < 500) break;
  }

  /* 2. el diff contra lo local */
  const local = store.all(name);
  const localIndex = new Map(local.map((r) => [r.id, String(r.updated || "")]));

  const stale: string[] = [];
  for (const [id, updated] of remote) {
    if (localIndex.get(id) !== updated) stale.push(id);
  }
  const gone = local.filter((r) => !remote.has(r.id)).map((r) => r.id);

  if (!stale.length && !gone.length) return false;

  /* 3. traer lo que cambió */
  const fetched: Row[] = [];
  if (stale.length > BULK_THRESHOLD || (!localIndex.size && stale.length)) {
    // Colección nueva o cambio masivo: sale más barato pedirla entera que
    // armar un filtro con cientos de ids.
    for (let page = 1; page <= 40; page++) {
      const res = await pb
        .collection(name)
        .getList(page, 500, { sort: "id", skipTotal: true, requestKey: null });
      fetched.push(...(res.items as unknown as Row[]));
      if (res.items.length < 500) break;
    }
  } else {
    for (let i = 0; i < stale.length; i += 50) {
      const batch = stale.slice(i, i + 50);
      const filter = batch.map((id) => `id="${id}"`).join(" || ");
      const res = await pb
        .collection(name)
        .getFullList({ filter, batch: 200, requestKey: null });
      fetched.push(...(res as unknown as Row[]));
    }
  }

  /* 4. aplicar */
  const toStore: { key: string; collection: string; id: string; data: Row }[] = [];
  let touched = false;

  for (const raw of fetched) {
    const record = merged(name, raw);
    if (store.put(name, record)) touched = true;
    toStore.push({ key: recordKey(name, record.id), collection: name, id: record.id, data: record });
  }

  const dropped: string[] = [];
  for (const id of gone) {
    // Lo creado sin red todavía no existe en el servidor: no está "borrado",
    // está esperando en la cola. Sacarlo acá lo haría desaparecer de la
    // pantalla al primer sync.
    if (pending.has(recordKey(name, id))) continue;
    if (store.drop(name, id)) touched = true;
    dropped.push(recordKey(name, id));
  }

  await putRecords(toStore).catch(() => undefined);
  await deleteRecords(dropped).catch(() => undefined);

  return touched;
}

/**
 * Lo que vino del servidor, con el parche local pendiente encima.
 *
 * Sin esto, escribir sin red y sincronizar después produce un parpadeo en el
 * que tu cambio se revierte en pantalla hasta que la subida lo repone.
 */
function merged(collection: string, remote: Row): Row {
  const patch = pending.get(recordKey(collection, remote.id));
  return patch ? ({ ...remote, ...patch } as Row) : remote;
}

/* -------------------------------------------------------------- subida ---- */

/** Encola una escritura. La llama `mutate.ts`; nadie más debería. */
export async function enqueue(m: Omit<Mutation, "createdAt">): Promise<void> {
  const key = recordKey(m.collection, m.recordId);

  if (m.op === "delete") pending.set(key, { deleted: true });
  else pending.set(key, { ...(pending.get(key) || {}), ...(m.payload || {}) });

  await outboxAdd({ ...m, createdAt: Date.now() });
  await refreshQueueCount();

  void push();
}

/**
 * Vacía la cola contra el servidor.
 *
 * De a una y en orden: crear el proyecto tiene que llegar antes que la tarea
 * que lo referencia, y PocketBase rechaza una relación que apunta a un id que
 * todavía no existe.
 */
export function push(): Promise<void> {
  if (pushing) {
    pushAgain = true;
    return pushing;
  }

  pushing = (async () => {
    try {
      const pb = pbBrowser();
      if (!pb.authStore.isValid) return;

      const items = await outboxAll();
      if (!items.length) return;

      let touched = false;

      for (const m of items) {
        const outcome = await send(m);

        if (outcome === "retry") break; // sin red: el resto espera su turno

        if (outcome === "applied" || outcome === "dropped") {
          if (m.id != null) await outboxDelete(m.id);
          // El parche deja de estar pendiente solo si no quedan otras
          // escrituras encoladas para el mismo registro.
          const key = recordKey(m.collection, m.recordId);
          const rest = (await outboxAll()).some(
            (x) => recordKey(x.collection, x.recordId) === key
          );
          if (!rest) pending.delete(key);
          touched = true;
        }
      }

      if (touched) store.flushNotify();
      await refreshQueueCount();
    } finally {
      pushing = null;
    }

    if (pushAgain) {
      pushAgain = false;
      await push();
    }
  })();

  return pushing;
}

type Outcome = "applied" | "dropped" | "retry";

async function send(m: Mutation): Promise<Outcome> {
  const pb = pbBrowser();

  try {
    if (m.op === "create") {
      const rec = await pb
        .collection(m.collection)
        .create({ id: m.recordId, ...(m.payload || {}) }, { requestKey: null });
      await land(m.collection, rec);
      return "applied";
    }

    if (m.op === "update") {
      const rec = await pb
        .collection(m.collection)
        .update(m.recordId, m.payload || {}, { requestKey: null });
      await land(m.collection, rec);
      return "applied";
    }

    await pb.collection(m.collection).delete(m.recordId, { requestKey: null });
    return "applied";
  } catch (err) {
    return await failed(m, err as ClientResponseError);
  }
}

/** Guarda la versión autoritativa: el servidor pone `owner`, `created`, `updated`. */
async function land(collection: string, rec: RecordModel): Promise<void> {
  const row = rec as unknown as Row;
  store.put(collection, row);
  await putRecords([
    { key: recordKey(collection, row.id), collection, id: row.id, data: row },
  ]).catch(() => undefined);
}

async function failed(m: Mutation, err: ClientResponseError): Promise<Outcome> {
  const status = err?.status ?? 0;

  // Sin respuesta del servidor: no es un rechazo, es que no hay red.
  if (!status || err?.isAbort) return "retry";

  // La sesión se cayó. Reintentar en bucle solo produciría 401 hasta el final
  // de la cola; el portero de sesión se encarga de mandarte a /login.
  if (status === 401 || status === 403) return "retry";

  // Crear algo que ya existe = un reintento de algo que en realidad funcionó.
  //
  // Son dos redacciones distintas y hacen falta las dos: PocketBase habla de
  // "unique" cuando choca un índice, y de "already exists" cuando el que choca
  // es el id. Lo segundo aparece con las recurrencias, donde el id de cada
  // cuota se deriva de (serie, fecha) justamente para que dos dispositivos que
  // generen la misma repetición produzcan una sola fila.
  if (
    m.op === "create" &&
    status === 400 &&
    /unique|already exists/i.test(JSON.stringify(err?.response || {}))
  ) {
    return "applied";
  }

  // Actualizar o borrar algo que ya no está: la intención se cumplió sola.
  if (status === 404) {
    if (m.op !== "create") {
      store.drop(m.collection, m.recordId);
      await deleteRecords([recordKey(m.collection, m.recordId)]).catch(() => undefined);
    }
    return "dropped";
  }

  const attempts = (m.attempts || 0) + 1;
  if (attempts < MAX_ATTEMPTS) {
    await outboxPut({ ...m, attempts, error: err?.message || String(status) });
    return "retry";
  }

  // Rechazo definitivo. Se suelta y se anota: una cola atascada en un registro
  // inválido bloquea todo lo que venga detrás, y eso sí rompe la promesa.
  rejected++;
  return "dropped";
}

/* ---------------------------------------------------------- tiempo real --- */

const unsubscribers: (() => void)[] = [];

/**
 * Suscripción SSE a las veinte colecciones.
 *
 * Es lo que hace que el teléfono y el navegador muestren lo mismo sin que
 * ninguno tenga que preguntar. La bajada completa sigue existiendo para lo que
 * pasó mientras la pestaña estaba cerrada.
 */
function ensureRealtime() {
  if (subscribed) return;
  const pb = pbBrowser();
  if (!pb.authStore.isValid) return;
  subscribed = true;

  for (const name of COLLECTIONS) {
    pb.collection(name)
      .subscribe("*", (e) => {
        const row = e.record as unknown as Row;
        let touched = false;

        if (e.action === "delete") {
          if (!pending.has(recordKey(name, row.id))) {
            touched = store.drop(name, row.id);
            void deleteRecords([recordKey(name, row.id)]).catch(() => undefined);
          }
        } else {
          const record = merged(name, row);
          touched = store.put(name, record);
          void putRecords([
            { key: recordKey(name, record.id), collection: name, id: record.id, data: record },
          ]).catch(() => undefined);
        }

        if (touched) store.flushNotify();
      })
      .then((off) => unsubscribers.push(off))
      .catch(() => {
        // sin SSE (proxy que lo corta, red caída) la app funciona igual:
        // se actualiza en la próxima bajada
      });
  }
}

function unsubscribeRealtime() {
  subscribed = false;
  for (const off of unsubscribers.splice(0)) {
    try {
      off();
    } catch {
      // la conexión ya estaba cerrada
    }
  }
}

/* ------------------------------------------------- ayuda al service worker */

/**
 * Le pide al worker que suba la cola.
 *
 * Background Sync sobrevive al cierre de la pestaña, que es exactamente el caso
 * que importa: capturas algo en el ascensor, bloqueas el teléfono y la app se
 * muere antes de que vuelva la señal.
 */
export async function handOffToWorker(): Promise<void> {
  await syncToken();
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return;

  const bg = (
    reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }
  ).sync;
  try {
    await bg?.register("flush-outbox");
  } catch {
    // Safari y Firefox no lo tienen; el postMessage de abajo es el respaldo
  }
  reg.active?.postMessage({ type: "flush-outbox" });
}
