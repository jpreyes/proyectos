/**
 * El día, en horas. La otra pregunta del calendario.
 *
 * `capacity.ts` contesta "¿cabe?" — horas por semana entre dos fechas, que es
 * la unidad en la que se contrata lo que llena un año y la única con la que
 * decidir si un proyecto de 30 meses revienta alguna semana es una suma. Eso no
 * se toca.
 *
 * Esto contesta la otra, la que uno se hace un martes a las diez: **¿qué hago
 * ahora?**. 2,86 h/semana de un informe no le dicen a nadie cuándo abrir el
 * archivo, y sin esa respuesta el día se va en una sola cosa o en ninguna.
 *
 * La regla que lo mantiene honesto: **acá no se guarda nada**. El día se
 * recalcula desde los compromisos cada vez que se abre la pantalla. La objeción
 * clásica contra una agenda con horas —"exige mantenerla al día o queda
 * mintiendo en una semana"— es una objeción contra un dato guardado a mano; un
 * plan derivado no se puede desactualizar porque no hay nada que actualizar.
 * Por eso no existe una colección de bloques y no debería existir.
 *
 * Tres clases de bloque, en orden de quién manda:
 *
 *   1. **Eventos** de los calendarios iCal conectados. Traen hora real y son
 *      compromisos con terceros: nada se pone encima.
 *   2. **Franjas fijas** de un compromiso (`slots`) — las clases. Ocurren a esa
 *      hora o no ocurren.
 *   3. **Flexible**: el resto de las horas semanales, repartidas en lo que
 *      quede libre.
 *
 * Y una cuarta cosa que no es un bloque sino un límite: la jornada. Nada se
 * coloca fuera de `work_start`–`work_end` ni encima del almuerzo. Lo que no
 * alcanza a entrar **se informa** (`unplaced`) en vez de derramarse a la
 * noche, que es exactamente lo que esta pantalla existe para evitar.
 */

import type { CalendarEvent, Commitment, DaySlot } from "./types";
import { eventDayKey } from "./dates";

/**
 * La rejilla del reparto: media hora.
 *
 * Las horas solo se parten por la mitad. No es cosmético — un bloque que
 * empieza a las 10:15 porque una reunión terminó ahí es un bloque que nadie
 * respeta, y una cuota de 23 minutos no es tiempo de trabajo, es un número. Lo
 * flexible se coloca siempre en :00 o :30 y dura un múltiplo de media hora.
 *
 * Lo fijo no se toca: si una clase va de 11:30 a 17:30, va de 11:30 a 17:30, y
 * si un evento del iCal cae a las 10:15 se dibuja a las 10:15. La rejilla
 * ordena lo que la app decide, no lo que la realidad impone.
 */
const GRAIN = 30;
/** Días hábiles de una semana. El reparto flexible solo cae de lunes a viernes. */
const WORK_DAYS = 5;
/** Un bloque flexible más corto que esto no se coloca: es cambio de contexto puro. */
const MIN_BLOCK = 30;
/**
 * Y uno más largo que esto tampoco, aunque haya hueco y horas que colocar.
 *
 * Sin tope, el repartidor codicioso vacía toda la demanda de un compromiso en el
 * primer hueco grande: el lunes salía "8:00-13:00 Galerías", cinco horas
 * seguidas en una sola cosa. Eso reproduce exactamente el problema que esta
 * pantalla vino a resolver —"haré solo una cosa en todo el día"— así que el
 * tope no es una preferencia, es el punto.
 *
 * Con dos horas, el reparto va rotando entre lo que tienes abierto y un día se
 * parece a un día y no a un turno.
 */
const MAX_BLOCK = 120;

export type BlockKind = "event" | "fixed" | "flex" | "lunch";

export interface Block {
  key: string;
  label: string;
  /** Minutos desde medianoche. */
  from: number;
  to: number;
  kind: BlockKind;
  /** A qué proyecto llevar al tocarlo. Los eventos y el almuerzo no llevan. */
  project?: string;
  status?: string;
}

export interface DayPlan {
  day: string;
  /** La ventana de la jornada, en minutos. */
  from: number;
  to: number;
  blocks: Block[];
  /** Horas colocadas y horas que se pedían. */
  placed: number;
  demanded: number;
  /** Lo que no cupo en la jornada, por compromiso. */
  unplaced: { label: string; hours: number }[];
}

/* ------------------------------------------------------------------ tiempo -- */

/** "HH:MM" -> minutos desde medianoche. Devuelve `fallback` si no parsea. */
export function toMin(value: string | null | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value || "").trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return fallback;
  return h * 60 + min;
}

/** minutos -> "8:30". Sin cero a la izquierda: es una etiqueta, no un dato. */
export function fmtMin(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, "0")}`;
}

/** El siguiente :00 o :30 a partir de `n`. */
function snapUp(n: number): number {
  return Math.ceil(n / GRAIN) * GRAIN;
}

/** El :00 o :30 anterior. */
function snapDown(n: number): number {
  return Math.floor(n / GRAIN) * GRAIN;
}

/** 1 = lunes … 7 = domingo, para "YYYY-MM-DD" leído en UTC como todo acá. */
export function isoWeekday(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  const n = d.getUTCDay();
  return n === 0 ? 7 : n;
}

/* ---------------------------------------------------------------- huecos --- */

type Gap = { from: number; to: number };

/** Le quita [from,to] a una lista de huecos. */
function carve(gaps: Gap[], from: number, to: number): Gap[] {
  const out: Gap[] = [];
  for (const g of gaps) {
    if (to <= g.from || from >= g.to) {
      out.push(g);
      continue;
    }
    if (from > g.from) out.push({ from: g.from, to: Math.min(from, g.to) });
    if (to < g.to) out.push({ from: Math.max(to, g.from), to: g.to });
  }
  return out.filter((g) => g.to - g.from >= 1);
}

/* ------------------------------------------------------------------ plan --- */

export interface DayPlanOptions {
  day: string;
  commitments: Commitment[];
  events?: CalendarEvent[];
  workStart: string;
  workEnd: string;
  lunchStart: string;
  lunchEnd: string;
}

function activeOn(c: Commitment, day: string): boolean {
  if (c.deleted || c.status === "cancelled") return false;
  if (!c.start_date || !c.end_date) return false;
  return c.start_date.slice(0, 10) <= day && day <= c.end_date.slice(0, 10);
}

function slotsOf(c: Commitment): DaySlot[] {
  return Array.isArray(c.slots) ? c.slots : [];
}

function slotMinutes(sl: DaySlot): number {
  return Math.max(0, toMin(sl.end, 0) - toMin(sl.start, 0));
}

/** El lunes de la semana que contiene `day`. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (isoWeekday(day) - 1));
  return d.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * La semana entera, y por qué no se puede repartir día por día.
 *
 * El primer intento dividía la cuota semanal de cada compromiso en cinco partes
 * iguales y llenaba cada día por separado. Con eso, un miércoles con cinco horas
 * de clase quedaba "corto" y la pantalla acusaba que no cabía algo que sí cabe:
 * lo que no entró el miércoles entra el viernes, y la unidad en la que se
 * contrató el trabajo es la semana, no el día.
 *
 * Así que se reparte la semana completa. Un compromiso derrama sus horas por los
 * huecos de lunes a viernes en orden, y solo si al terminar la semana le quedan
 * horas sin ubicar hay de verdad un problema que informar.
 */
export interface WeekPlan {
  monday: string;
  days: DayPlan[];
  /** Lo que no cupo en la semana. Acá sí significa algo. */
  unplaced: { label: string; hours: number }[];
}

export function buildWeekPlan(opts: DayPlanOptions): WeekPlan {
  const monday = mondayOf(opts.day);
  const from = toMin(opts.workStart, 8 * 60);
  const to = toMin(opts.workEnd, 18 * 60);
  const lunchFrom = toMin(opts.lunchStart, 13 * 60);
  const lunchTo = toMin(opts.lunchEnd, 14 * 60);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDays(monday, i));

  const blocksByDay = new Map<string, Block[]>();
  const gapsByDay = new Map<string, Gap[]>();

  for (const day of days) {
    const blocks: Block[] = [];
    let gaps: Gap[] = [{ from, to }];
    const weekday = isoWeekday(day);
    const active = opts.commitments.filter((c) => activeOn(c, day));

    /* 1. lo fijo primero: manda sobre el almuerzo, no al revés ------------- */
    for (const e of opts.events || []) {
      if (e.deleted) continue;
      if (eventDayKey(e.start, e.all_day) !== day) continue;
      if (e.all_day) continue;
      const s0 = new Date(e.start);
      if (Number.isNaN(s0.getTime())) continue;
      const t0 = e.end ? new Date(e.end) : new Date(s0.getTime() + 3600_000);
      const bs = s0.getUTCHours() * 60 + s0.getUTCMinutes();
      const be = Number.isNaN(t0.getTime()) ? bs + 60 : t0.getUTCHours() * 60 + t0.getUTCMinutes();
      const cs = Math.max(bs, from);
      const ce = Math.min(be > bs ? be : bs + 60, to);
      if (ce <= cs) continue;
      blocks.push({ key: `ev-${e.id}`, label: e.title || "Evento", from: cs, to: ce, kind: "event" });
      gaps = carve(gaps, cs, ce);
    }

    for (const c of active) {
      for (const [i, sl] of slotsOf(c).entries()) {
        if (Number(sl.day) !== weekday) continue;
        const a = toMin(sl.start, -1);
        const b = toMin(sl.end, -1);
        if (a < 0 || b < 0 || b <= a) continue;
        blocks.push({
          key: `fx-${c.id}-${i}`,
          label: c.title,
          from: a,
          to: b,
          kind: "fixed",
          project: c.project,
          status: c.status,
        });
        gaps = carve(gaps, a, b);
      }
    }

    /* 2. el almuerzo, solo donde sigue libre ------------------------------- */
    // Una clase de 11:30 a 17:30 se come la hora de almuerzo: es un hecho, no un
    // error, y dibujar el almuerzo encima de la clase sería mentir. Se pinta la
    // parte que quede libre, o ninguna.
    if (lunchTo > lunchFrom) {
      for (const g of gaps) {
        const a = Math.max(g.from, lunchFrom);
        const b = Math.min(g.to, lunchTo);
        if (b - a >= 15) blocks.push({ key: `lunch-${a}`, label: "Almuerzo", from: a, to: b, kind: "lunch" });
      }
      gaps = carve(gaps, lunchFrom, lunchTo);
    }

    blocksByDay.set(day, blocks);
    gapsByDay.set(day, gaps);
  }

  /* 3. lo flexible, derramado por la semana de lunes a viernes ------------- */
  const weekdays = days.slice(0, WORK_DAYS);
  const seen = new Map<string, Commitment>();
  for (const day of weekdays) {
    for (const c of opts.commitments.filter((x) => activeOn(x, day))) seen.set(c.id, c);
  }

  // Lo que cierra antes va primero: entre dos cosas que caben, la que tiene el
  // plazo encima es la que no puede esperar a la semana que viene.
  const demands = [...seen.values()]
    .map((c) => {
      const daysActive = weekdays.filter((d) => activeOn(c, d)).length;
      const fixedWeek = slotsOf(c)
        .filter((sl) => weekdays.some((d) => isoWeekday(d) === Number(sl.day) && activeOn(c, d)))
        .reduce((n, sl) => n + slotMinutes(sl), 0);
      // Una semana que el compromiso solo cubre a medias pide su parte, igual
      // que en la grilla de semanas.
      const weekMinutes = (c.hours_per_week || 0) * 60 * (daysActive / WORK_DAYS);
      return { c, minutes: Math.max(0, snapDown(weekMinutes - fixedWeek)) };
    })
    .filter((d) => d.minutes >= MIN_BLOCK)
    .sort((a, b) => {
      const d = (a.c.end_date || "").localeCompare(b.c.end_date || "");
      return d !== 0 ? d : a.c.title.localeCompare(b.c.title);
    });

  const unplaced: { label: string; hours: number }[] = [];

  // Se reparte por rondas y no vaciando un compromiso antes de pasar al
  // siguiente: en cada pasada, cada uno toma **un** bloque por día. Es lo que
  // produce una jornada variada en vez de un turno por proyecto.
  const left = new Map<string, number>(demands.map((d) => [d.c.id, d.minutes]));
  const parts = new Map<string, number>();

  for (let round = 0; round < 12; round++) {
    let placedAny = false;
    for (const day of weekdays) {
      for (const d of demands) {
        let rest = left.get(d.c.id) || 0;
        if (rest < MIN_BLOCK) continue;
        if (!activeOn(d.c, day)) continue;
        const gaps = gapsByDay.get(day)!;
        const g = [...gaps].sort((a, b) => a.from - b.from).find((x) => {
          const st = snapUp(x.from);
          return snapDown(x.to) - st >= MIN_BLOCK;
        });
        if (!g) continue;
        const start = snapUp(g.from);
        const room = snapDown(g.to) - start;
        const take = snapDown(Math.min(room, rest, MAX_BLOCK));
        if (take < MIN_BLOCK) continue;
        const n = (parts.get(d.c.id) || 0) + 1;
        parts.set(d.c.id, n);
        blocksByDay.get(day)!.push({
          key: `fl-${d.c.id}-${n}`,
          label: d.c.title,
          from: start,
          to: start + take,
          kind: "flex",
          project: d.c.project,
          status: d.c.status,
        });
        gapsByDay.set(day, carve(gaps, start, start + take));
        rest -= take;
        left.set(d.c.id, rest);
        placedAny = true;
      }
    }
    if (!placedAny) break;
  }

  for (const d of demands) {
    const rest = left.get(d.c.id) || 0;
    if (rest >= MIN_BLOCK) unplaced.push({ label: d.c.title, hours: rest / 60 });
  }

  const plans: DayPlan[] = days.map((day) => {
    let blocks = (blocksByDay.get(day) || []).sort((a, b) => a.from - b.from || a.to - b.to);
    // Un día sin trabajo no necesita que le dibujen el almuerzo: sería lo único
    // en la pantalla y no es información.
    if (!blocks.some((b) => b.kind !== "lunch")) blocks = [];
    const placed = blocks
      .filter((b) => b.kind !== "lunch")
      .reduce((n, b) => n + (b.to - b.from), 0);
    return { day, from, to, blocks, placed: placed / 60, demanded: placed / 60, unplaced: [] };
  });

  return { monday, days: plans, unplaced };
}

/** Un día suelto. Se arma la semana entera porque el reparto es semanal. */
export function buildDayPlan(opts: DayPlanOptions): DayPlan {
  const week = buildWeekPlan(opts);
  const found = week.days.find((d) => d.day === opts.day);
  const base =
    found ||
    ({
      day: opts.day,
      from: toMin(opts.workStart, 8 * 60),
      to: toMin(opts.workEnd, 18 * 60),
      blocks: [],
      placed: 0,
      demanded: 0,
      unplaced: [],
    } as DayPlan);
  // Lo que no cupo es de la semana, pero se muestra en el día: es donde se está
  // mirando cuando importa.
  return { ...base, unplaced: week.unplaced };
}
