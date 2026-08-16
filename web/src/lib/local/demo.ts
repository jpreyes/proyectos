"use client";

/**
 * Los datos de ejemplo, vistos desde la app.
 *
 * El servidor los siembra una vez por cuenta (pb_hooks/lib/demo.js) y marca
 * cada fila con `demo`. Acá vive lo único que la app necesita saber de ellos:
 * cuántos quedan y cómo borrarlos todos de una vez.
 *
 * Por qué existe el botón: unos datos de ejemplo que no se pueden quitar dejan
 * de ser una ayuda y pasan a ser basura en la base de alguien. Y por qué el
 * borrado es exactamente el mismo que el manual —borrado suave donde la
 * colección lo tiene, cola de subida como cualquier escritura— porque un camino
 * especial de borrado masivo es justo el tipo de código que un día se lleva por
 * delante algo que no era de ejemplo.
 */

import { remove } from "./mutate";
import * as store from "./store";
import { useAll } from "./store";

/**
 * Orden de borrado: primero lo que cuelga, después de lo que cuelga.
 *
 * Con relaciones sin cascada da igual para la integridad, pero no para lo que
 * se ve mientras la cola sube: borrar el encargo antes que sus tareas deja unos
 * segundos de tareas huérfanas en pantalla.
 */
export const DEMO_COLLECTIONS = [
  "routine_log",
  "quote_items",
  "deliverables",
  "commitments",
  "entries",
  "log",
  "tasks",
  "resources",
  "inbox",
  "daily",
  "routines",
  "quotes",
  "projects",
  "entities",
] as const;

type DemoRow = { id: string; demo?: boolean; deleted?: boolean };

/** Cuántas filas de ejemplo quedan vivas. Reactivo: baja mientras se borran. */
export function useDemoCount(): number {
  let total = 0;
  for (const name of DEMO_COLLECTIONS) {
    // Un hook por colección, siempre los mismos y en el mismo orden: la lista
    // es una constante, así que esto cumple las reglas de los hooks.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const rows = useAll<DemoRow>(name);
    total += rows.filter((r) => r.demo && !r.deleted).length;
  }
  return total;
}

/** Borra todo lo sembrado como ejemplo. Lo que escribió la persona no se toca. */
export async function deleteDemoData(): Promise<void> {
  for (const name of DEMO_COLLECTIONS) {
    const rows = store.all<DemoRow>(name).filter((r) => r.demo && !r.deleted);
    for (const row of rows) await remove(name, row.id);
  }
}
