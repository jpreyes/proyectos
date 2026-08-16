"use client";

/**
 * Lo que reemplaza al lenguaje de filtros de PocketBase.
 *
 * Con la colección entera en memoria, una consulta vuelve a ser lo que siempre
 * fue en JavaScript: filtrar y ordenar un arreglo. Estos ayudantes existen solo
 * para que las páginas se lean parecido a como se leían cuando el orden lo
 * decía una cadena `sort: "-date,-created"`.
 */

/**
 * Ordena por campos, con `-campo` para descendente. Estable y sin mutar.
 *
 * El acceso por clave va con un cast porque las interfaces de `lib/types.ts` no
 * declaran firma de índice — y no deberían: obligar a `Project` a aceptar
 * cualquier clave con tal de poder ordenarlo perdería justo la comprobación que
 * hace útil tener los tipos.
 */
export function sortBy<T>(list: T[], ...keys: string[]): T[] {
  const specs = keys.map((k) =>
    k.startsWith("-") ? { key: k.slice(1), dir: -1 } : { key: k, dir: 1 }
  );

  return [...list].sort((a, b) => {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    for (const { key, dir } of specs) {
      const cmp = compare(ra[key], rb[key]);
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  });
}

function compare(a: unknown, b: unknown): number {
  // Los vacíos van al final en orden ascendente: una tarea sin plazo no debe
  // encabezar la lista de plazos.
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" || typeof b === "boolean") return Number(b) - Number(a);
  return String(a).localeCompare(String(b), "es");
}

/** Índice por id, para resolver relaciones sin recorrer la lista cada vez. */
export function index<T extends { id: string }>(list: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of list) map.set(item.id, item);
  return map;
}

/** Agrupa conservando el orden de aparición de cada grupo. */
export function groupBy<T>(list: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Búsqueda de texto sin acentos ni mayúsculas, como la del buscador de arriba. */
export function matches(haystack: (string | undefined | null)[], needle: string): boolean {
  const q = fold(needle);
  if (!q) return true;
  return haystack.some((h) => fold(h || "").includes(q));
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}

/** Solo la parte de fecha, que es como se comparan los campos de solo-fecha. */
export function day(value: string | null | undefined): string {
  return String(value || "").slice(0, 10);
}
