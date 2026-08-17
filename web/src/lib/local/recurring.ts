"use client";

/**
 * Los movimientos que se repiten.
 *
 * Una serie no es un movimiento: es la regla que los fabrica —cada cuánto,
 * desde cuándo, hasta cuándo, por cuánto. Un sueldo, un arriendo, la cuota de
 * un crédito, un encargo largo que se cobra por mes.
 *
 * **La regla no reemplaza al movimiento: lo materializa.** Cada repetición se
 * escribe como una fila normal de `entries`, y desde ahí todo lo que ya lee el
 * ledger sigue funcionando sin enterarse de que existen las series: el flujo
 * mensual, el margen por proyecto, "por cobrar", el cierre de impuestos, el
 * buscador. La alternativa —expandir la serie al leer— habría obligado a que
 * cada una de esas pantallas supiera de recurrencias, y habría hecho imposible
 * lo más corriente de todo: que el arriendo de este mes haya llegado distinto y
 * uno lo corrija sin tocar los otros once.
 *
 * Tres decisiones sostienen esto:
 *
 * - **El id de cada cuota se deriva de (serie, fecha).** No es una optimización:
 *   es lo que hace que dos dispositivos que generen la misma repetición
 *   produzcan la misma fila y no dos. Sin eso, abrir la app en el teléfono y en
 *   el computador el mismo día duplicaría el sueldo. De paso hace que borrar
 *   una cuota se quede borrada: el id sigue ocupado en la réplica, y el
 *   generador salta lo que ya existe.
 *
 * - **Se materializa hasta un horizonte corto** (`HORIZON_DAYS`), no hasta el
 *   fin de la serie. Un sueldo sin fecha de término es infinito; el ledger no
 *   puede serlo. Lo pasado se materializa entero —de eso se trata anotar desde
 *   enero— con un tope duro por serie.
 *
 * - **Editar la serie reescribe el futuro, nunca el pasado.** Un aumento de
 *   sueldo tiene que verse el mes que viene, no reescribir lo que ya se cobró.
 *   Las cuotas futuras que la serie todavía "posee" —las que siguen en el
 *   estado con que nacieron— se actualizan; las que ya viven su propia vida
 *   (facturadas, pagadas, editadas a otro estado) quedan como están.
 */

import { homeOf } from "../money";
import type { Cadence, Entry, EntrySeries } from "../types";
import { create, ID_ALPHABET, update } from "./mutate";
import { day } from "./query";
import * as store from "./store";

/** Hasta dónde se adelanta el ledger. Un trimestre: lo que cabe en una proyección. */
const HORIZON_DAYS = 92;

/**
 * Tope de cuotas por serie. Existe para el caso torpe —una serie semanal cuya
 * fecha de inicio quedó en 2015— y no para el uso normal: treinta años de
 * sueldo son 360 filas.
 */
const MAX_OCCURRENCES = 400;

/* ------------------------------------------------------------- el calendario */

const STEP: Record<Cadence, { unit: "week" | "month"; every: number }> = {
  weekly: { unit: "week", every: 1 },
  biweekly: { unit: "week", every: 2 },
  monthly: { unit: "month", every: 1 },
  bimonthly: { unit: "month", every: 2 },
  quarterly: { unit: "month", every: 3 },
  semiannual: { unit: "month", every: 6 },
  annual: { unit: "month", every: 12 },
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Suma días a una fecha "YYYY-MM-DD", en UTC como todo el resto de la app. */
export function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * La repetición número `n` de una serie (la 0 es la fecha de inicio).
 *
 * En las cadencias por mes se conserva el día del mes de la fecha de inicio y
 * se recorta al último día cuando el mes es más corto: un cobro del 31 cae el
 * 28 de febrero y **vuelve** al 31 en marzo. Arrastrar el recorte —calcular
 * cada fecha desde la anterior— haría que un solo febrero corriera el cobro al
 * día 28 para siempre.
 */
export function occurrence(start: string, cadence: Cadence, n: number): string {
  const [y, m, d] = start.split("-").map(Number);
  if (!y || !m || !d) return "";

  const step = STEP[cadence] || STEP.monthly;

  if (step.unit === "week") {
    return new Date(Date.UTC(y, m - 1, d + n * step.every * 7)).toISOString().slice(0, 10);
  }

  const months = m - 1 + n * step.every;
  const year = y + Math.floor(months / 12);
  const month = ((months % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`;
}

/** Las fechas de una serie hasta `limit`, ya recortadas por término y por tope. */
export function occurrencesUntil(series: EntrySeries, limit: string): string[] {
  const start = day(series.start_date);
  if (!start) return [];

  const end = day(series.end_date);
  const max = series.occurrences > 0 ? Math.min(series.occurrences, MAX_OCCURRENCES) : MAX_OCCURRENCES;

  const dates: string[] = [];
  for (let n = 0; n < max; n++) {
    const date = occurrence(start, series.cadence, n);
    if (!date) break;
    if (end && date > end) break;
    if (date > limit) break;
    dates.push(date);
  }
  return dates;
}

/** La próxima repetición desde hoy, para mostrarla en la lista. */
export function nextOccurrence(series: EntrySeries, from = todayKey()): string {
  const start = day(series.start_date);
  if (!start) return "";

  const end = day(series.end_date);
  const max = series.occurrences > 0 ? Math.min(series.occurrences, MAX_OCCURRENCES) : MAX_OCCURRENCES;

  for (let n = 0; n < max; n++) {
    const date = occurrence(start, series.cadence, n);
    if (!date) return "";
    if (end && date > end) return "";
    if (date >= from) return date;
  }
  return "";
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Cuántas veces al mes ocurre cada cadencia, en promedio. */
const PER_MONTH: Record<Cadence, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  bimonthly: 1 / 2,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
};

/**
 * Lo que la serie mueve al mes, en moneda base.
 *
 * Es el número por el que se pregunta de verdad —"¿cuánto me entra y cuánto me
 * sale todos los meses?"— y no sale de sumar el ledger: ahí una cuota anual
 * aparece una vez y en diciembre. Un promedio mensual pone en la misma escala
 * el arriendo, el seguro semestral y el dominio que se paga una vez al año.
 */
export function perMonth(series: EntrySeries): number {
  const value = homeOf({
    amount: series.amount,
    amount_clp: 0,
    fx_rate: series.fx_rate || 0,
    currency: series.currency || "CLP",
  });
  return value * (PER_MONTH[series.cadence] ?? 1);
}

/* ------------------------------------------------------------------ el id -- */

/**
 * El id de una cuota, derivado de (serie, fecha).
 *
 * Dos dispositivos que generen la misma repetición tienen que producir **la
 * misma fila**. Con ids al azar, abrir la app en el teléfono y en el computador
 * el mismo día duplicaría el sueldo; con este, el segundo intento choca contra
 * el id que ya existe y el sincronizador lo trata como lo que es — un reintento
 * de algo que ya funcionó.
 *
 * Es un hash de 64 bits estirado a los 15 caracteres que usa PocketBase. No es
 * criptográfico y no tiene por qué serlo: solo tiene que no chocar entre las
 * pocas miles de cuotas de una cuenta.
 */
export function occurrenceId(seriesId: string, date: string): string {
  const seed = `${seriesId}|${date}`;

  let s0 = 0x811c9dc5;
  let s1 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    s0 = Math.imul(s0 ^ c, 16777619) >>> 0;
    s1 = Math.imul(s1 + c, 2246822519) >>> 0;
  }

  let out = "";
  for (let i = 0; i < 15; i++) {
    s0 ^= s0 << 13;
    s0 >>>= 0;
    s0 ^= s0 >>> 17;
    s0 ^= s0 << 5;
    s0 >>>= 0;
    s1 = Math.imul(s1 ^ s0, 2654435761) >>> 0;
    out += ID_ALPHABET[(s0 ^ s1) % ID_ALPHABET.length];
  }
  return out;
}

/* ------------------------------------------------------------ la materia --- */

/** Los campos con que nace una cuota. Es un movimiento normal y corriente. */
function entryFor(series: EntrySeries, date: string): Record<string, unknown> {
  const currency = series.currency || "CLP";
  const fx = currency === "CLP" ? 1 : series.fx_rate || 0;
  const past = date <= todayKey();

  return {
    date,
    direction: series.direction,
    description: series.description,
    amount: series.amount,
    currency,
    fx_rate: fx,
    // Congelado igual que en cualquier movimiento. En una serie en UF o USD el
    // cambio de una cuota futura no se puede conocer, así que queda el que se
    // anotó en la serie y se corrige al cobrarla — mejor un número que se
    // arregla que uno inventado.
    amount_clp: Math.round(series.amount * fx),
    net: series.net || 0,
    tax: series.tax || 0,
    withholding: series.withholding || 0,
    status: series.auto_paid && past ? "paid" : series.status || "planned",
    due_date: series.due_days ? shiftDays(date, series.due_days) : date,
    paid_date: series.auto_paid && past ? date : "",
    project: series.project || "",
    entity: series.entity || "",
    account: series.account || "",
    category: series.category || "",
    doc_type: series.doc_type || "",
    doc_number: "",
    notes: series.notes || "",
    friction_cost: false,
    recurring: true,
    series: series.id,
    series_date: date,
    series_dropped: false,
    deleted: false,
  };
}

/**
 * ¿La cuota sigue siendo de la serie, o ya vive su propia vida?
 *
 * Una que se facturó, se cobró o se editó a otro estado es un hecho y no una
 * proyección: cambiar la serie no puede reescribirla. Las que siguen en el
 * estado con que nacieron son todavía una promesa, y esas sí siguen a la regla.
 */
function ownedBySeries(entry: Entry, series: EntrySeries): boolean {
  return entry.status === (series.status || "planned");
}

/** Las cuotas ya materializadas de una serie, por fecha. */
function materialized(seriesId: string): Map<string, Entry & { id: string }> {
  const map = new Map<string, Entry & { id: string }>();
  for (const e of store.all<Entry & { id: string }>("entries")) {
    if (e.series === seriesId) map.set(day(e.series_date || e.date), e);
  }
  return map;
}

/**
 * Fabrica lo que falte de una serie. Devuelve cuántas cuotas nuevas escribió.
 *
 * Es idempotente por construcción: lo que ya existe con ese id se salta, venga
 * de este dispositivo, del otro o de una corrida anterior.
 */
export async function materializeSeries(series: EntrySeries): Promise<number> {
  if (series.deleted || series.paused || !series.amount || !series.start_date) return 0;

  const limit = shiftDays(todayKey(), HORIZON_DAYS);
  let made = 0;

  for (const date of occurrencesUntil(series, limit)) {
    const id = occurrenceId(series.id, date);
    const existing = store.get<Entry & { id: string }>("entries", id);

    if (existing) {
      // La única que se repone es la que la propia serie soltó al cambiarle el
      // calendario. Lo que borró la persona se queda borrado.
      if (existing.deleted && existing.series_dropped) {
        await update("entries", id, entryFor(series, date));
        made++;
      }
      continue;
    }

    await create("entries", entryFor(series, date), id);
    made++;
  }

  return made;
}

/**
 * Pone al día las cuotas futuras después de editar la serie.
 *
 * Lo que ya pasó no se toca —un cobro de marzo no cambia porque en agosto
 * subiste la tarifa— y lo que salió del estado inicial tampoco. Lo que queda
 * fuera del calendario nuevo se suelta marcado, para poder reponerlo si el
 * cambio se revierte.
 */
export async function resyncSeries(series: EntrySeries): Promise<void> {
  const today = todayKey();
  const limit = shiftDays(today, HORIZON_DAYS);
  const planned = new Set(occurrencesUntil(series, limit));
  const existing = materialized(series.id);

  for (const [date, entry] of existing) {
    if (date <= today || entry.deleted) continue;

    if (!planned.has(date)) {
      if (ownedBySeries(entry, series)) {
        await update("entries", entry.id, { deleted: true, series_dropped: true });
      }
      continue;
    }

    if (ownedBySeries(entry, series)) {
      await update("entries", entry.id, entryFor(series, date));
    }
  }

  await materializeSeries(series);
}

/**
 * Da por pagadas las cuotas que ya vencieron, cuando la serie lo pide.
 *
 * Sin esto `auto_paid` solo valdría para las cuotas del pasado que se
 * materializan de una vez: la del mes que viene nace proyectada y se quedaría
 * así para siempre, porque el generador nunca vuelve a tocar lo que ya existe.
 */
async function settleDue(series: EntrySeries): Promise<number> {
  if (!series.auto_paid) return 0;

  const today = todayKey();
  let settled = 0;

  for (const entry of store.all<Entry & { id: string }>("entries")) {
    if (entry.series !== series.id || entry.deleted) continue;
    if (day(entry.date) > today) continue;
    if (entry.status !== (series.status || "planned")) continue;

    await update("entries", entry.id, { status: "paid", paid_date: day(entry.date) });
    settled++;
  }

  return settled;
}

/**
 * Pasa por todas las series y deja el ledger al día.
 *
 * Corre al abrir la app y cada vez que cambia una serie —también cuando el
 * cambio llegó de otro dispositivo—, no en un temporizador: materializar es
 * barato y saltar lo que ya existe todavía más, así que no hace falta elegir un
 * momento.
 */
export async function runSeries(): Promise<number> {
  let written = 0;

  for (const series of store.all<EntrySeries & { id: string }>("entry_series")) {
    if (series.deleted || series.paused) continue;
    written += await materializeSeries(series);
    written += await settleDue(series);
  }

  return written;
}
