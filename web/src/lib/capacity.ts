// Calendario de capacidad: aritmética de semanas y búsqueda de huecos.
//
// La unidad de todo este módulo es la semana, identificada por el lunes que la
// abre en formato "YYYY-MM-DD". Igual que en lib/dates.ts, todo se calcula en
// **UTC**: los campos de solo-fecha de PocketBase caen en medianoche UTC, y
// hacer la aritmética en America/Santiago correría cada uno un día hacia atrás,
// que a nivel de semanas significa cambiar de semana.
//
// El modelo tiene dos fuentes de carga y se suman en la misma unidad:
//
//   * `commitments` — horas por semana entre dos fechas. Las semanas parciales
//     del principio y del final se prorratean por días cubiertos, así que un
//     encargo que arranca un jueves no cobra la semana entera.
//   * `calendar_events` — eventos con fecha y hora que llegan del .ics de
//     Outlook. Ya traen sus horas calculadas; se cargan a la semana en que caen.

import type { CalendarEvent, Commitment } from "./types";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/* ------------------------------------------------------------- semanas ---- */

function parseUTC(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Medianoche UTC del día que contiene `value`. */
function dayStart(value: string | null | undefined): number | null {
  const d = parseUTC(value);
  if (!d) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Lunes de la semana que contiene `value`, como "YYYY-MM-DD". */
export function weekStart(value: string | null | undefined): string {
  const ms = dayStart(value);
  if (ms === null) return "";
  const dow = new Date(ms).getUTCDay(); // 0 domingo … 6 sábado
  const back = (dow + 6) % 7; // lunes = 0
  return new Date(ms - back * DAY_MS).toISOString().slice(0, 10);
}

/** Domingo que cierra la semana `key`. */
export function weekEnd(key: string): string {
  const ms = dayStart(key);
  if (ms === null) return "";
  return new Date(ms + 6 * DAY_MS).toISOString().slice(0, 10);
}

export function addWeeks(key: string, n: number): string {
  const ms = dayStart(key);
  if (ms === null) return "";
  return new Date(ms + n * WEEK_MS).toISOString().slice(0, 10);
}

export function addDays(key: string, n: number): string {
  const ms = dayStart(key);
  if (ms === null) return "";
  return new Date(ms + n * DAY_MS).toISOString().slice(0, 10);
}

/** Los siete días de la semana `key`, de lunes a domingo. */
export function weekDays(key: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(addDays(key, i));
  return out;
}

/**
 * Las semanas que cubre la cuadrícula de un mes "YYYY-MM".
 *
 * Vive acá y no en el componente porque la vista de mes necesita **las mismas**
 * semanas para dos cosas: dibujar la cuadrícula y sumar su carga. Calcularlas
 * dos veces es cómo la columna de horas termina desalineada con los días.
 */
export function monthWeeks(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const first = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const out: string[] = [];
  let week = weekStart(first);
  while (week <= last) {
    out.push(week);
    week = addWeeks(week, 1);
  }
  return out;
}

/** "agosto de 2026", para el encabezado de la vista de mes. */
export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-CL", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

/** El mes "YYYY-MM" desplazado `n` meses. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** `count` semanas consecutivas a partir de la que contiene `from`. */
export function weekRange(from: string | null | undefined, count: number): string[] {
  const first = weekStart(from || new Date().toISOString().slice(0, 10));
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(addWeeks(first, i));
  return out;
}

/** "18 ago" — el lunes de la semana. */
export function weekLabel(key: string): string {
  const d = parseUTC(key);
  if (!d) return key;
  return d.toLocaleDateString("es-CL", { timeZone: "UTC", day: "2-digit", month: "short" });
}

/** "18–24 ago" cuando cae dentro del mismo mes, "29 sep – 5 oct" cuando no. */
export function weekSpanLabel(key: string): string {
  const a = parseUTC(key);
  const b = parseUTC(weekEnd(key));
  if (!a || !b) return key;
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  const dayA = a.toLocaleDateString("es-CL", { timeZone: "UTC", day: "2-digit" });
  const monthA = a.toLocaleDateString("es-CL", { timeZone: "UTC", month: "short" });
  const dayB = b.toLocaleDateString("es-CL", { timeZone: "UTC", day: "2-digit" });
  const monthB = b.toLocaleDateString("es-CL", { timeZone: "UTC", month: "short" });
  return sameMonth ? `${dayA}–${dayB} ${monthA}` : `${dayA} ${monthA} – ${dayB} ${monthB}`;
}

/** Número de semana ISO, para la etiqueta discreta de la grilla. */
export function isoWeekNumber(key: string): number {
  const ms = dayStart(key);
  if (ms === null) return 0;
  // El jueves de la semana define a qué año ISO pertenece.
  const thu = new Date(ms + 3 * DAY_MS);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return Math.floor((thu.getTime() - jan1) / WEEK_MS) + 1;
}

/** "12,5 h" — sin decimales cuando es redondo. */
export function fmtHours(n: number): string {
  const v = Math.round((n || 0) * 10) / 10;
  return `${v.toLocaleString("es-CL", { maximumFractionDigits: 1 })} h`;
}

/* ---------------------------------------------------------------- carga ---- */

export interface LoadPart {
  id: string;
  label: string;
  hours: number;
  source: "commitment" | "event";
  /** Estado del compromiso, para pintar los tentativos distinto. */
  status?: string;
}

export interface WeekLoad {
  week: string;
  total: number;
  parts: LoadPart[];
}

/**
 * Cuántos días de la semana `key` caen dentro de [start, end], ambos inclusive.
 * Es lo que prorratea las semanas parciales.
 */
function daysCovered(key: string, start: string, end: string): number {
  const ws = dayStart(key);
  const s = dayStart(start);
  const e = dayStart(end);
  if (ws === null || s === null || e === null) return 0;
  const from = Math.max(ws, s);
  const to = Math.min(ws + 6 * DAY_MS, e);
  if (to < from) return 0;
  return Math.round((to - from) / DAY_MS) + 1;
}

/**
 * Carga de cada semana de `weeks`.
 *
 * Los compromisos anulados no cuentan: siguen existiendo como registro de que
 * el encargo se cayó, pero ya no ocupan tu tiempo.
 */
export function buildWeekLoad(
  weeks: string[],
  commitments: Commitment[],
  events: CalendarEvent[] = []
): Map<string, WeekLoad> {
  const map = new Map<string, WeekLoad>();
  for (const w of weeks) map.set(w, { week: w, total: 0, parts: [] });

  for (const c of commitments) {
    if (c.status === "cancelled") continue;
    if (!c.start_date || !c.end_date) continue;
    for (const w of weeks) {
      const days = daysCovered(w, c.start_date, c.end_date);
      if (!days) continue;
      const hours = (c.hours_per_week || 0) * (days / 7);
      if (hours <= 0) continue;
      const row = map.get(w)!;
      row.total += hours;
      row.parts.push({
        id: c.id,
        label: c.title,
        hours,
        source: "commitment",
        status: c.status,
      });
    }
  }

  for (const e of events) {
    const w = weekStart(e.start);
    const row = map.get(w);
    if (!row) continue;
    const hours = e.hours || 0;
    if (hours <= 0) continue;
    row.total += hours;
    row.parts.push({ id: e.id, label: e.title || "(sin título)", hours, source: "event" });
  }

  for (const row of map.values()) {
    row.parts.sort((a, b) => b.hours - a.hours);
  }

  return map;
}

/** Horas libres por semana, dado un techo constante. */
export function freeHours(load: Map<string, WeekLoad>, capacity: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [week, row] of load) out.set(week, capacity - row.total);
  return out;
}

/* -------------------------------------------------------- buscar hueco ---- */

export interface Slot {
  /** Primer día de trabajo. El lunes de la primera semana, o `earliest` si cae después. */
  start: string;
  /** Domingo que cierra la última semana. */
  end: string;
  weeks: string[];
  hoursPerWeek: number;
  /** false = no cupo en el horizonte y esto es una ubicación forzada. */
  fits: boolean;
}

export interface PlanOptions {
  totalHours: number;
  /** Ritmo máximo que estás dispuesto a dedicarle a ESTE encargo. */
  maxPerWeek: number;
  /** Techo semanal total, de settings. */
  capacity: number;
  load: Map<string, WeekLoad>;
  /** Semanas candidatas, en orden. */
  weeks: string[];
  /** No empezar antes de esta fecha. */
  earliest?: string;
}

/**
 * Busca el primer tramo de semanas consecutivas donde caben `totalHours` sin
 * que ninguna pase de `capacity`.
 *
 * El orden de búsqueda es deliberado: primero la semana de inicio más temprana,
 * y recién dentro de ella el tramo más corto. Es decir, prefiere empezar antes
 * antes que terminar antes — que es lo que uno quiere cuando le preguntan
 * "¿cuándo puedes partir?".
 *
 * El ritmo resultante es plano (`totalHours / n` en cada semana) en vez de
 * llenar hasta el tope semana a semana. Un ritmo plano es lo que se puede
 * escribir en un contrato y lo que se puede sostener; el llenado codicioso
 * produce semanas al 100% seguidas de semanas vacías.
 *
 * Es conservador con la primera semana: exige el ritmo completo aunque el
 * trabajo parta un miércoles y esa semana solo se prorratee después. Preferible
 * a prometer un calce que después no da.
 *
 * Devuelve `fits: false` cuando no hubo tramo posible en todo el horizonte. En
 * ese caso ubica el trabajo lo antes posible al ritmo máximo, y quien llame
 * decide qué hacer — la app lo reserva igual pero marcado como tentativo, que
 * es más honesto que negarse a agendar un encargo que ya aceptaste.
 */
export function planWork(opts: PlanOptions): Slot | null {
  const { totalHours, capacity, load, weeks, earliest } = opts;
  const maxPerWeek = opts.maxPerWeek > 0 ? opts.maxPerWeek : capacity;

  if (totalHours <= 0 || !weeks.length || maxPerWeek <= 0) return null;

  const minWeeks = Math.max(1, Math.ceil(totalHours / maxPerWeek - 1e-9));
  const free = freeHours(load, capacity);
  const EPS = 1e-9;

  const build = (startIdx: number, n: number, fits: boolean): Slot => {
    const span = weeks.slice(startIdx, startIdx + n);
    const monday = span[0];
    const start = earliest && earliest > monday ? earliest : monday;
    return {
      start,
      end: weekEnd(span[span.length - 1]),
      weeks: span,
      hoursPerWeek: totalHours / n,
      fits,
    };
  };

  for (let si = 0; si < weeks.length; si++) {
    const maxN = weeks.length - si;
    for (let n = minWeeks; n <= maxN; n++) {
      const h = totalHours / n;
      if (h > maxPerWeek + EPS) continue;

      let ok = true;
      for (let k = si; k < si + n; k++) {
        if ((free.get(weeks[k]) ?? 0) < h - EPS) {
          ok = false;
          break;
        }
      }
      if (ok) return build(si, n, true);
    }
  }

  // No cupo. Se ubica lo antes posible al ritmo máximo.
  return build(0, Math.min(minWeeks, weeks.length), false);
}

/** Semanas del tramo que quedarían por sobre la capacidad si se agrega el calce. */
export function overloadedWeeks(
  slot: Slot,
  load: Map<string, WeekLoad>,
  capacity: number
): string[] {
  return slot.weeks.filter((w) => {
    const used = load.get(w)?.total ?? 0;
    return used + slot.hoursPerWeek > capacity + 1e-9;
  });
}
