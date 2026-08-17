"use client";

/**
 * Escribir.
 *
 * Una sola ruta, con red o sin ella: se calcula el registro nuevo, se aplica a
 * la réplica —memoria e IndexedDB— y se encola para subir. La pantalla ya
 * cambió cuando la función vuelve; que el servidor se entere es asunto del
 * sincronizador.
 *
 * La pieza que hace esto posible es que **el id se genera acá**. PocketBase
 * acepta un id propio de 15 caracteres en la creación, así que un proyecto
 * creado en el metro tiene desde el primer instante el mismo id que tendrá en
 * el servidor, y las tareas, la bitácora y los movimientos pueden apuntarle sin
 * esperar a nadie. Sin eso habría que inventar ids temporales y reescribir cada
 * referencia al subir, que es donde estas arquitecturas se rompen.
 */

import { putRecords, recordKey, type Row } from "./db";
import * as store from "./store";
import { enqueue } from "./sync";

/**
 * Colecciones con borrado suave.
 *
 * El resto se borra en duro. No es un descuido: `routine_log` tiene un índice
 * único (rutina, día) que una fila marcada como borrada bloquearía, y los
 * ítems de un presupuesto o las filas del catálogo son subfilas de un
 * formulario, no cosas que un dispositivo desconectado deba "enterarse" de que
 * desaparecieron. La bajada compara índices completos, así que los borrados en
 * duro igual llegan a la réplica.
 */
const SOFT_DELETE = new Set([
  "projects",
  "resources",
  "log",
  "tasks",
  "entries",
  "entry_series",
  "entities",
  "inbox",
  "routines",
  "daily",
  "quotes",
  "commitments",
]);

export const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Un id con la misma forma que los de PocketBase: 15 caracteres, [a-z0-9]. */
export function newId(): string {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

/**
 * La marca de tiempo en el formato exacto de PocketBase
 * ("2026-08-15 23:15:42.927Z"), para que ordenar y comparar por `updated` dé lo
 * mismo antes y después de que la escritura suba.
 */
function stamp(): string {
  return new Date().toISOString().replace("T", " ");
}

async function persist(collection: string, record: Row): Promise<void> {
  store.put(collection, record);
  store.flushNotify();
  await putRecords([
    { key: recordKey(collection, record.id), collection, id: record.id, data: record },
  ]).catch(() => undefined);
}

/** Crea un registro y devuelve su id, ya definitivo. */
export async function create(
  collection: string,
  data: Record<string, unknown>,
  id = newId()
): Promise<string> {
  const now = stamp();
  const record: Row = { ...data, id, created: now, updated: now };

  await persist(collection, record);
  await enqueue({ op: "create", collection, recordId: id, payload: data });
  return id;
}

/** Aplica un parche. Los campos que no vienen quedan como estaban. */
export async function update(
  collection: string,
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const current = store.get(collection, id);
  if (!current) return;

  await persist(collection, { ...current, ...patch, id, updated: stamp() });
  await enqueue({ op: "update", collection, recordId: id, payload: patch });
}

/**
 * Borrar. Suave donde la colección lo admite, en duro donde no.
 *
 * Un borrado suave se ve igual que uno de verdad —las listas filtran `deleted`—
 * pero deja una fila con fecha, que es lo único que permite que otro
 * dispositivo se entere de que algo desapareció.
 */
export async function remove(collection: string, id: string): Promise<void> {
  if (SOFT_DELETE.has(collection)) {
    await update(collection, id, { deleted: true });
    return;
  }

  store.drop(collection, id);
  store.flushNotify();
  const { deleteRecords } = await import("./db");
  await deleteRecords([recordKey(collection, id)]).catch(() => undefined);
  await enqueue({ op: "delete", collection, recordId: id });
}

/**
 * Crea o actualiza la fila que corresponde a `id`, según exista o no.
 * Los formularios de configuración y de ritmo escriben así: una fila única por
 * cuenta o por día, sin dos caminos distintos según si ya existía.
 */
export async function upsert(
  collection: string,
  id: string | undefined,
  data: Record<string, unknown>
): Promise<string> {
  if (id && store.get(collection, id)) {
    await update(collection, id, data);
    return id;
  }
  return create(collection, data);
}
