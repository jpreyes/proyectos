"use client";

/**
 * La réplica en memoria y su suscripción a React.
 *
 * Las pantallas no consultan a PocketBase ni a IndexedDB: leen de acá. Son los
 * datos de una sola persona —decenas de proyectos, cientos de movimientos— así
 * que la colección entera cabe en memoria, y eso permite lo que de verdad
 * importa: **las consultas vuelven a ser JavaScript**. Filtrar y ordenar un
 * arreglo, en vez de mantener un dialecto de filtros contra el servidor.
 *
 * IndexedDB es el respaldo que sobrevive al cierre de la pestaña, no la ruta de
 * lectura. Al arrancar se carga todo de una vez y desde ahí la memoria manda.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Row } from "./db";

/** Toda colección que se replica. El sincronizador recorre esta misma lista. */
export const COLLECTIONS = [
  "projects",
  "resources",
  "log",
  "tasks",
  "entries",
  "entry_series",
  "chat",
  "entities",
  "accounts",
  "categories",
  "taxonomy",
  "settings",
  "inbox",
  "routines",
  "routine_log",
  "daily",
  "quotes",
  "quote_items",
  "deliverables",
  "commitments",
  "calendar_feeds",
  "calendar_events",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

const data = new Map<string, Map<string, Row>>();
for (const name of COLLECTIONS) data.set(name, new Map());

const listeners = new Set<() => void>();

/**
 * Un contador por colección, más uno global.
 *
 * Es lo que `useSyncExternalStore` compara para decidir si re-renderizar. Por
 * colección y no solo global para que anotar en la bitácora no vuelva a pintar
 * la pantalla de finanzas.
 */
const versions = new Map<string, number>();
let ready = false;

function bump(collection: string) {
  versions.set(collection, (versions.get(collection) || 0) + 1);
}

function notify() {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function versionOf(collection: string): number {
  return versions.get(collection) || 0;
}

/* ------------------------------------------------------------ lecturas ---- */

/**
 * El arreglo de una colección, con identidad estable entre versiones.
 *
 * La caché no es una optimización cosmética: sin ella cada render entrega un
 * arreglo nuevo, y todo `useMemo` que dependa de él se recalcula siempre.
 */
const cache = new Map<string, { v: number; list: Row[] }>();

export function all<T = Row>(collection: string): T[] {
  const v = versionOf(collection);
  const hit = cache.get(collection);
  if (hit && hit.v === v) return hit.list as unknown as T[];

  const list = [...(data.get(collection)?.values() || [])];
  cache.set(collection, { v, list });
  return list as unknown as T[];
}

export function get<T = Row>(collection: string, id: string): T | undefined {
  if (!id) return undefined;
  return data.get(collection)?.get(id) as T | undefined;
}

export function isReady(): boolean {
  return ready;
}

/* ---------------------------------------------------------- escrituras ---- */

/** Carga inicial desde IndexedDB. No notifica hasta el final. */
export function hydrate(rows: { collection: string; data: Row }[]): void {
  for (const row of rows) {
    const map = data.get(row.collection);
    if (!map) continue; // colección desconocida (versión vieja de la app)
    map.set(row.data.id, row.data);
  }
  for (const name of COLLECTIONS) bump(name);
  notify();
}

export function setReady(): void {
  if (ready) return;
  ready = true;
  notify();
}

/** Inserta o reemplaza un registro. Devuelve true si algo cambió de verdad. */
export function put(collection: string, record: Row): boolean {
  const map = data.get(collection);
  if (!map || !record?.id) return false;

  const previous = map.get(record.id);
  if (previous && sameRecord(previous, record)) return false;

  map.set(record.id, record);
  bump(collection);
  return true;
}

export function drop(collection: string, id: string): boolean {
  const map = data.get(collection);
  if (!map || !map.has(id)) return false;
  map.delete(id);
  bump(collection);
  return true;
}

export function clear(): void {
  for (const name of COLLECTIONS) {
    data.get(name)?.clear();
    bump(name);
  }
  notify();
}

/** Un único aviso a React por tanda de cambios del sincronizador. */
export function flushNotify(): void {
  notify();
}

/**
 * Igualdad barata. `updated` cambia en cada escritura del servidor, así que
 * comparar esa marca evita repintar la app entera cuando el sincronizador
 * vuelve a traer lo mismo que ya teníamos.
 */
function sameRecord(a: Row, b: Row): boolean {
  if (a === b) return true;
  if (a.updated && b.updated && a.updated === b.updated && a.deleted === b.deleted) return true;
  return false;
}

/* ---------------------------------------------------------------- hooks --- */

function useVersion(collection: string): number {
  const sub = useCallback((fn: () => void) => subscribe(fn), []);
  const snapshot = useCallback(() => versionOf(collection), [collection]);
  // En el servidor no hay réplica: el HTML es una cáscara y los datos entran al
  // hidratar. Devolver 0 mantiene el primer render determinista.
  return useSyncExternalStore(sub, snapshot, () => 0);
}

/** Todos los registros de una colección, incluidos los marcados como borrados. */
export function useAll<T = Row>(collection: string): T[] {
  const v = useVersion(collection);
  return useMemo(() => (v >= 0 ? all<T>(collection) : []), [collection, v]);
}

/** Solo los vivos. Es lo que quiere casi toda la app. */
export function useCollection<T = Row>(collection: string): T[] {
  const rows = useAll<T>(collection);
  return useMemo(() => rows.filter((r) => !(r as { deleted?: boolean }).deleted), [rows]);
}

export function useRecord<T = Row>(
  collection: string,
  id: string | undefined
): T | undefined {
  const v = useVersion(collection);
  return useMemo(() => (id && v >= 0 ? get<T>(collection, id) : undefined), [collection, id, v]);
}

/** Falso hasta que la réplica local terminó de cargarse desde IndexedDB. */
export function useReady(): boolean {
  const sub = useCallback((fn: () => void) => subscribe(fn), []);
  return useSyncExternalStore(
    sub,
    () => ready,
    () => false
  );
}
