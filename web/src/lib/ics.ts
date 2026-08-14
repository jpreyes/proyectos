import "server-only";
import type PocketBase from "pocketbase";
import type { CalendarEvent, CalendarFeed } from "./types";

// Lectura del calendario institucional (Outlook / OWA) por su URL .ics
// publicada.
//
// Es de una sola dirección y a propósito: acá se LEE lo que la universidad
// programa —exámenes de grado, comisiones— para que esas horas cuenten en la
// carga de la semana y el buscador de huecos no te agende trabajo encima. Esta
// app nunca escribe en el calendario de la UACh, entre otras cosas porque la
// suscripción .ics no lo permite: para eso haría falta OAuth contra el Entra ID
// de la universidad.
//
// El parser cubre el subconjunto de RFC 5545 que un calendario institucional
// usa de verdad: eventos sueltos, eventos de día completo, series con RRULE
// simple, EXDATE, y las instancias modificadas con RECURRENCE-ID. Lo que no
// entiende lo ignora en vez de fallar — media agenda leída vale más que un
// error.

/** Zona con la que se interpretan las horas sin TZID ni Z ("flotantes"). */
const DEFAULT_TZ = "America/Santiago";

/** Techo de expansión por serie. Una RRULE sin COUNT ni UNTIL es infinita. */
const MAX_OCCURRENCES = 500;

/** Un evento de día completo más largo que esto no se expande día por día. */
const MAX_ALLDAY_SPAN = 31;

const FETCH_TIMEOUT_MS = 20_000;
const MAX_BYTES = 8 * 1024 * 1024;

export interface ParsedEvent {
  uid: string;
  title: string;
  /** Instante de inicio, en ms epoch. */
  start: number;
  end: number;
  allDay: boolean;
  location: string;
}

/* --------------------------------------------------------------- zonas ---- */

/**
 * Offset de `tz` respecto de UTC en el instante `ts`, en milisegundos.
 *
 * Se saca formateando el instante en esa zona y volviendo a leerlo como si
 * fuera UTC: la diferencia entre ambos es el offset. Es el truco estándar para
 * no depender de una librería de zonas horarias, y usa la base de datos de
 * zonas que ya trae Node.
 */
function tzOffset(ts: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(ts));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUTC - ts;
}

/**
 * Convierte una hora de pared en `tz` al instante UTC que le corresponde.
 *
 * Dos pasadas: la primera estima el offset tratando la hora como si fuera UTC,
 * la segunda lo corrige. Hace falta porque en los saltos de horario de verano
 * el offset depende del instante que estamos justamente tratando de calcular.
 */
function wallToUTC(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string
): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let offset: number;
  try {
    offset = tzOffset(guess, tz);
  } catch {
    return guess; // TZID que Node no conoce (p. ej. nombres de Windows)
  }
  let ts = guess - offset;
  const corrected = tzOffset(ts, tz);
  if (corrected !== offset) ts = guess - corrected;
  return ts;
}

/* -------------------------------------------------------------- parser ---- */

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

/**
 * Deshace el plegado de líneas de RFC 5545: una línea que empieza con espacio o
 * tabulación es la continuación de la anterior, sin ese primer carácter.
 */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseProp(line: string): Prop | null {
  // El primer ":" fuera de comillas separa nombre+parámetros del valor. Las
  // comillas importan: un TZID puede traer ":" adentro.
  let colon = -1;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segments = head.split(";");
  const name = segments[0].toUpperCase();

  const params: Record<string, string> = {};
  for (const seg of segments.slice(1)) {
    const eq = seg.indexOf("=");
    if (eq < 0) continue;
    params[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1).replace(/^"|"$/g, "");
  }

  return { name, params, value };
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

interface DateValue {
  ts: number;
  date: boolean;
}

function parseDateValue(prop: Prop): DateValue | null {
  const v = prop.value.trim();

  // Día completo: YYYYMMDD
  if (prop.params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return null;
    return { ts: Date.UTC(+m[1], +m[2] - 1, +m[3]), date: true };
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return null;

  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return { ts: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), date: false };

  const tz = prop.params.TZID || DEFAULT_TZ;
  return { ts: wallToUTC(+y, +mo, +d, +h, +mi, +s, tz), date: false };
}

/* ------------------------------------------------------------- recurrencia - */

interface Rule {
  freq: string;
  interval: number;
  count: number;
  until: number;
  byDay: number[]; // 0 domingo … 6 sábado
}

const DAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRule(value: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const seg of value.split(";")) {
    const eq = seg.indexOf("=");
    if (eq > 0) parts[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1);
  }
  const freq = (parts.FREQ || "").toUpperCase();
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;

  let until = Infinity;
  if (parts.UNTIL) {
    const parsed = parseDateValue({ name: "UNTIL", params: {}, value: parts.UNTIL });
    if (parsed) until = parsed.ts;
  }

  const byDay = (parts.BYDAY || "")
    .split(",")
    .map((d) => DAY_INDEX[d.trim().slice(-2).toUpperCase()])
    .filter((d) => d !== undefined);

  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL) || 1),
    count: Number(parts.COUNT) || 0,
    until,
    byDay,
  };
}

/**
 * Expande una serie a instantes de inicio dentro de [from, to].
 *
 * Deliberadamente incompleto: no hace BYSETPOS, ni BYMONTH, ni semanas que
 * empiezan en otro día. Un calendario académico no los usa, y soportarlos a
 * medias produce fechas equivocadas, que es peor que no mostrar la serie.
 */
function expandRule(rule: Rule, startTs: number, from: number, to: number): number[] {
  const out: number[] = [];
  const base = new Date(startTs);
  const limit = Math.min(rule.until, to);

  // COUNT se cuenta sobre las repeticiones GENERADAS, no sobre las que caen en
  // la ventana. Una serie de 10 clases que empezó el semestre pasado sigue
  // teniendo 10 aunque la ventana solo alcance a ver las últimas tres.
  let generated = 0;
  const take = (ts: number) => {
    generated++;
    if (ts >= from && ts <= limit) out.push(ts);
  };
  const exhausted = () => generated >= MAX_OCCURRENCES || (!!rule.count && generated >= rule.count);

  if (rule.freq === "WEEKLY" && rule.byDay.length) {
    // El lunes es solo el ancla del recorrido; los días concretos salen de BYDAY.
    const days = [...rule.byDay].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const weekAnchor = startTs - ((base.getUTCDay() + 6) % 7) * 86_400_000;

    for (let i = 0; !exhausted(); i++) {
      const week = weekAnchor + i * rule.interval * 7 * 86_400_000;
      if (week > limit) break;
      for (const d of days) {
        const ts = week + ((d + 6) % 7) * 86_400_000;
        if (ts < startTs) continue;
        if (ts > limit) break;
        take(ts);
        if (exhausted()) break;
      }
    }
  } else {
    for (let i = 0; !exhausted(); i++) {
      let ts: number;
      if (rule.freq === "DAILY") {
        ts = startTs + i * rule.interval * 86_400_000;
      } else if (rule.freq === "WEEKLY") {
        ts = startTs + i * rule.interval * 7 * 86_400_000;
      } else {
        const step = i * rule.interval;
        const shifted =
          rule.freq === "MONTHLY"
            ? Date.UTC(
                base.getUTCFullYear(),
                base.getUTCMonth() + step,
                base.getUTCDate(),
                base.getUTCHours(),
                base.getUTCMinutes(),
                base.getUTCSeconds()
              )
            : Date.UTC(
                base.getUTCFullYear() + step,
                base.getUTCMonth(),
                base.getUTCDate(),
                base.getUTCHours(),
                base.getUTCMinutes(),
                base.getUTCSeconds()
              );
        // 31 de enero + 1 mes = 3 de marzo en aritmética de Date. Esa
        // repetición no existe: el RFC dice saltarla, sin gastar una del COUNT.
        if (new Date(shifted).getUTCDate() !== base.getUTCDate()) {
          if (i > MAX_OCCURRENCES) break;
          continue;
        }
        ts = shifted;
      }
      if (ts > limit) break;
      take(ts);
    }
  }

  return out;
}

/* ------------------------------------------------------------ eventos ---- */

/**
 * Convierte un .ics en eventos concretos dentro de la ventana [from, to].
 *
 * Los de día completo se abren en una fila por día: una semana de exámenes
 * declarada como un solo evento de cinco días tiene que pesar cinco veces, no
 * una. Sus horas las pone quien llama, desde `default_hours` del feed.
 */
export function parseICS(text: string, from: number, to: number): ParsedEvent[] {
  const lines = unfold(text);

  interface Block {
    uid: string;
    title: string;
    location: string;
    start: DateValue | null;
    end: DateValue | null;
    rule: Rule | null;
    exdates: number[];
    recurrenceId: number | null;
  }

  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      current = {
        uid: "",
        title: "",
        location: "",
        start: null,
        end: null,
        rule: null,
        exdates: [],
        recurrenceId: null,
      };
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (current && current.start) blocks.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const prop = parseProp(line);
    if (!prop) continue;

    switch (prop.name) {
      case "UID":
        current.uid = prop.value.trim().slice(0, 300);
        break;
      case "SUMMARY":
        current.title = unescapeText(prop.value).slice(0, 300);
        break;
      case "LOCATION":
        current.location = unescapeText(prop.value).slice(0, 300);
        break;
      case "DTSTART":
        current.start = parseDateValue(prop);
        break;
      case "DTEND":
        current.end = parseDateValue(prop);
        break;
      case "RRULE":
        current.rule = parseRule(prop.value);
        break;
      case "EXDATE":
        for (const piece of prop.value.split(",")) {
          const parsed = parseDateValue({ name: "EXDATE", params: prop.params, value: piece });
          if (parsed) current.exdates.push(parsed.ts);
        }
        break;
      case "RECURRENCE-ID": {
        const parsed = parseDateValue(prop);
        if (parsed) current.recurrenceId = parsed.ts;
        break;
      }
    }
  }

  // Instancias modificadas: hay que sacar de la serie la repetición original,
  // o el mismo examen aparece dos veces, en la fecha vieja y en la nueva.
  const overrides = new Map<string, Set<number>>();
  for (const b of blocks) {
    if (b.recurrenceId === null || !b.uid) continue;
    const set = overrides.get(b.uid) || new Set<number>();
    set.add(b.recurrenceId);
    overrides.set(b.uid, set);
  }

  const out: ParsedEvent[] = [];

  for (const b of blocks) {
    if (!b.start) continue;

    const allDay = b.start.date;
    const duration = b.end ? Math.max(0, b.end.ts - b.start.ts) : allDay ? 86_400_000 : 3_600_000;

    const skip = new Set<number>(b.exdates);
    if (b.recurrenceId === null) {
      for (const ts of overrides.get(b.uid) || []) skip.add(ts);
    }

    const starts =
      b.rule && b.recurrenceId === null
        ? expandRule(b.rule, b.start.ts, from, to)
        : b.start.ts >= from && b.start.ts <= to
          ? [b.start.ts]
          : [];

    for (const ts of starts) {
      if (skip.has(ts)) continue;

      if (allDay) {
        const days = Math.max(1, Math.min(MAX_ALLDAY_SPAN, Math.round(duration / 86_400_000)));
        for (let d = 0; d < days; d++) {
          const dayStart = ts + d * 86_400_000;
          if (dayStart < from || dayStart > to) continue;
          out.push({
            uid: b.uid || `${ts}`,
            title: b.title,
            start: dayStart,
            end: dayStart + 86_400_000,
            allDay: true,
            location: b.location,
          });
        }
      } else {
        out.push({
          uid: b.uid || `${ts}`,
          title: b.title,
          start: ts,
          end: ts + duration,
          allDay: false,
          location: b.location,
        });
      }
    }
  }

  return out;
}

/* --------------------------------------------------------------- sync ---- */

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
  total: number;
}

/** webcal:// es lo que copia Outlook, y fetch no lo entiende. */
export function normalizeFeedUrl(url: string): string {
  const trimmed = url.trim();
  if (/^webcal:\/\//i.test(trimmed)) return trimmed.replace(/^webcal:\/\//i, "https://");
  return trimmed;
}

async function fetchICS(url: string): Promise<string> {
  const normalized = normalizeFeedUrl(url);
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("La URL del calendario tiene que ser http(s) o webcal.");
  }

  const res = await fetch(normalized, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`El calendario respondió ${res.status}.`);

  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("El calendario pesa demasiado.");
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new Error("La URL no devolvió un calendario .ics. ¿Es el enlace publicado y no el de la página?");
  }
  return text;
}

/**
 * Trae el feed y deja `calendar_events` igual a lo que dice el .ics.
 *
 * Diferencial y no "borrar todo y volver a crear": una sincronización que no
 * cambió nada no debería escribir nada. La clave de identidad es uid + inicio,
 * porque las repeticiones de una serie comparten UID.
 *
 * Nunca lanza. Un calendario institucional caído no puede tumbar la página del
 * calendario: el error se guarda en el feed y se muestra ahí.
 */
export async function syncFeed(
  pb: PocketBase,
  feed: CalendarFeed,
  opts: { pastDays?: number; futureDays?: number } = {}
): Promise<SyncResult & { error?: string }> {
  const now = Date.now();
  const from = now - (opts.pastDays ?? 30) * 86_400_000;
  const to = now + (opts.futureDays ?? 550) * 86_400_000;

  const result: SyncResult & { error?: string } = { created: 0, updated: 0, removed: 0, total: 0 };

  let parsed: ParsedEvent[];
  try {
    parsed = parseICS(await fetchICS(feed.url), from, to);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message.slice(0, 500);
    try {
      await pb.collection("calendar_feeds").update(feed.id, {
        last_sync: new Date().toISOString(),
        last_error: result.error,
      });
    } catch {
      // si tampoco se puede escribir el error, no hay nada más que hacer acá
    }
    return result;
  }

  const defaultHours = feed.default_hours || 0;
  const wanted = new Map<string, ParsedEvent>();
  for (const e of parsed) {
    wanted.set(`${e.uid}::${new Date(e.start).toISOString()}`, e);
  }

  const existing = await pb.collection("calendar_events").getFullList<CalendarEvent>({
    filter: pb.filter("feed = {:f}", { f: feed.id }),
  });

  const seen = new Set<string>();

  for (const row of existing) {
    const key = `${row.uid}::${new Date(String(row.start).replace(" ", "T")).toISOString()}`;
    const match = wanted.get(key);
    if (!match) {
      await pb.collection("calendar_events").delete(row.id);
      result.removed++;
      continue;
    }
    seen.add(key);
    const hours = match.allDay ? defaultHours : (match.end - match.start) / 3_600_000;
    if (
      row.title !== match.title ||
      row.location !== match.location ||
      Math.abs((row.hours || 0) - hours) > 0.01
    ) {
      await pb.collection("calendar_events").update(row.id, {
        title: match.title,
        location: match.location,
        end: new Date(match.end).toISOString(),
        all_day: match.allDay,
        hours,
      });
      result.updated++;
    }
  }

  for (const [key, e] of wanted) {
    if (seen.has(key)) continue;
    await pb.collection("calendar_events").create({
      feed: feed.id,
      uid: e.uid,
      title: e.title,
      start: new Date(e.start).toISOString(),
      end: new Date(e.end).toISOString(),
      all_day: e.allDay,
      hours: e.allDay ? defaultHours : (e.end - e.start) / 3_600_000,
      location: e.location,
    });
    result.created++;
  }

  result.total = wanted.size;

  await pb.collection("calendar_feeds").update(feed.id, {
    last_sync: new Date().toISOString(),
    last_error: "",
    event_count: result.total,
  });

  return result;
}

/** Sincroniza los feeds activos que estén vencidos. Devuelve cuántos tocó. */
export async function syncStaleFeeds(pb: PocketBase, maxAgeHours = 6): Promise<number> {
  let feeds: CalendarFeed[] = [];
  try {
    feeds = await pb.collection("calendar_feeds").getFullList<CalendarFeed>({ sort: "label" });
  } catch {
    return 0;
  }

  const cutoff = Date.now() - maxAgeHours * 3_600_000;
  let touched = 0;

  for (const feed of feeds) {
    if (!feed.active) continue;
    const last = feed.last_sync ? new Date(String(feed.last_sync).replace(" ", "T")).getTime() : 0;
    if (last > cutoff) continue;
    await syncFeed(pb, feed);
    touched++;
  }

  return touched;
}
