"use client";

/**
 * "¿Cuándo cabe esto?" — la parte que necesita datos.
 *
 * Vive aparte de `lib/capacity.ts` por la misma razón de siempre: ese módulo es
 * aritmética pura y se puede razonar sin base de datos. Lo único que cambió al
 * pasar a local-first es de dónde salen los compromisos y los eventos: antes se
 * consultaban al servidor con `await`, ahora se leen de la réplica, que ya está
 * en memoria. Por eso estas funciones son síncronas — y por eso el buscador de
 * huecos responde sin red.
 */

import type { CalendarEvent, Commitment, Quote } from "../types";
import type { Settings } from "../config";
import {
  buildWeekLoad,
  planWork,
  weekEnd,
  weekRange,
  weekStart,
  type Slot,
  type WeekLoad,
} from "../capacity";
import * as store from "./store";
import { day } from "./query";

export interface CalendarWindow {
  weeks: string[];
  commitments: Commitment[];
  events: CalendarEvent[];
  load: Map<string, WeekLoad>;
  capacity: number;
}

/**
 * La ventana de semanas que arranca en `from`.
 *
 * `excludeCommitment` existe para replantear un proyecto ya reservado: sin sacar
 * su propia reserva de la carga, el buscador compite contra sí mismo y nunca
 * encuentra dónde ponerse.
 */
export function calendarWindow(
  settings: Settings,
  opts: { from?: string; weeks?: number; excludeCommitment?: string } = {}
): CalendarWindow {
  const weeks = weekRange(opts.from, opts.weeks || settings.capacity_horizon_weeks || 78);
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const until = weekEnd(last);

  const commitments = store
    .all<Commitment & { id: string }>("commitments")
    .filter((c) => !c.deleted)
    .filter((c) => day(c.end_date) >= first && day(c.start_date) <= until);

  const events = store
    .all<CalendarEvent & { id: string }>("calendar_events")
    .filter((e) => !e.deleted)
    .filter((e) => day(e.start) >= first && day(e.start) <= until);

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
export function proposeSlotForQuote(
  settings: Settings,
  quote: Pick<Quote, "work_hours" | "max_hours_week" | "earliest_start" | "id">,
  opts: { excludeCommitment?: string } = {}
): { slot: Slot | null; window: CalendarWindow } {
  const today = new Date().toISOString().slice(0, 10);
  const earliestDay = quote.earliest_start ? day(quote.earliest_start) : today;
  // No se puede empezar en el pasado, pase lo que pase.
  const earliest = earliestDay > today ? earliestDay : today;

  const window = calendarWindow(settings, {
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
  const start = day(quote.plan_start);
  const end = day(quote.plan_end);
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
