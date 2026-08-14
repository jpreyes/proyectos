import "server-only";
import type PocketBase from "pocketbase";
import type { CalendarEvent, Commitment, Quote } from "./types";
import type { Settings } from "./config";
import { ALIVE } from "./filters";
import { buildWeekLoad, planWork, weekRange, weekStart, type Slot, type WeekLoad } from "./capacity";

// Lo que hay que leer de la base para poder responder "¿cuándo cabe esto?".
//
// Vive aparte de capacity.ts a propósito: ese módulo es aritmética pura y se
// puede razonar —y probar— sin base de datos. Acá está la parte sucia, que es
// traer los compromisos y los eventos del calendario institucional.

export interface CalendarWindow {
  weeks: string[];
  commitments: Commitment[];
  events: CalendarEvent[];
  load: Map<string, WeekLoad>;
  capacity: number;
}

/**
 * Carga la ventana de semanas que arranca en `from`.
 *
 * `excludeCommitment` existe para replantear un encargo que ya está reservado:
 * sin sacar su propia reserva de la carga, el buscador compite contra sí mismo
 * y nunca encuentra dónde ponerse.
 */
export async function loadCalendarWindow(
  pb: PocketBase,
  settings: Settings,
  opts: { from?: string; weeks?: number; excludeCommitment?: string } = {}
): Promise<CalendarWindow> {
  const weeks = weekRange(opts.from, opts.weeks || settings.capacity_horizon_weeks || 78);
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  // El domingo que cierra la última semana, más un margen: un compromiso que
  // empieza el sábado siguiente no toca esta ventana.
  const until = `${last} 23:59:59`;

  const [commitments, events] = await Promise.all([
    pb.collection("commitments").getFullList<Commitment>({
      filter: [ALIVE, pb.filter("end_date >= {:a} && start_date <= {:b}", { a: first, b: until })].join(
        " && "
      ),
      sort: "start_date",
    }),
    pb
      .collection("calendar_events")
      .getFullList<CalendarEvent>({
        filter: pb.filter("start >= {:a} && start <= {:b}", { a: first, b: until }),
        sort: "start",
      })
      .catch(() => [] as CalendarEvent[]),
  ]);

  const usable = opts.excludeCommitment
    ? commitments.filter((c) => c.id !== opts.excludeCommitment)
    : commitments;

  return {
    weeks,
    commitments,
    events,
    load: buildWeekLoad(weeks, usable, events),
    capacity: settings.capacity_hours_week || 40,
  };
}

/** El calce que propone el buscador para un presupuesto, o null si no aplica. */
export async function proposeSlotForQuote(
  pb: PocketBase,
  settings: Settings,
  quote: Pick<Quote, "work_hours" | "max_hours_week" | "earliest_start" | "id">,
  opts: { excludeCommitment?: string } = {}
): Promise<{ slot: Slot | null; window: CalendarWindow }> {
  const today = new Date().toISOString().slice(0, 10);
  const earliestDay = quote.earliest_start
    ? String(quote.earliest_start).slice(0, 10)
    : today;
  // No se puede empezar en el pasado, pase lo que pase.
  const earliest = earliestDay > today ? earliestDay : today;

  const window = await loadCalendarWindow(pb, settings, {
    from: weekStart(earliest),
    excludeCommitment: opts.excludeCommitment,
  });

  const slot = planWork({
    totalHours: quote.work_hours || 0,
    maxPerWeek: quote.max_hours_week || 0,
    capacity: window.capacity,
    load: window.load,
    weeks: window.weeks,
    earliest,
  });

  return { slot, window };
}

/** El calce ya fijado en el presupuesto, si tiene uno completo. */
export function storedSlot(quote: Quote): Slot | null {
  if (!quote.plan_start || !quote.plan_end || !quote.plan_hours_week) return null;
  const start = String(quote.plan_start).slice(0, 10);
  const end = String(quote.plan_end).slice(0, 10);
  const weeks: string[] = [];
  let w = weekStart(start);
  const lastWeek = weekStart(end);
  // Cota dura: un plan corrupto no puede colgar el render.
  for (let i = 0; i < 520 && w <= lastWeek; i++) {
    weeks.push(w);
    const next = new Date(`${w}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    w = next.toISOString().slice(0, 10);
  }
  return { start, end, weeks, hoursPerWeek: quote.plan_hours_week, fits: true };
}
