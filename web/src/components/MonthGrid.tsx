"use client";

/**
 * El mes como cuadrícula, para la pregunta que la grilla de semanas no responde.
 *
 * La unidad del modelo sigue siendo la semana —«4 h semanales durante 30 meses»
 * es como se contrata el trabajo, y si algo cabe o no es una suma, no una
 * grilla— así que esto **no** es una agenda de bloques con hora: es la misma
 * carga, dibujada sobre los días que ya tienes en la cabeza. Un compromiso se ve
 * como una banda continua a lo largo de los días que cubre, y su ritmo semanal
 * sigue leyéndose en la columna de la derecha, que es lo que dice qué semana
 * está más cargada.
 *
 * Lo que sí tiene día y hora son los eventos de los calendarios conectados, y por eso
 * son lo único que se dibuja pegado a una fecha concreta.
 *
 * En el teléfono una celda mide unos 50 px: ahí las bandas son color y los
 * eventos son puntos. El detalle no se achica hasta ser ilegible — se toca el
 * día y se lee abajo.
 */

import { useMemo } from "react";
import type { CalendarEvent, Commitment } from "@/lib/types";
import { fmtHours, isoWeekNumber, monthWeeks, type WeekLoad, weekDays } from "@/lib/capacity";
import { eventDayKey } from "@/lib/dates";
import { cx } from "./ui";

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
/** Bandas por semana antes de resumir en «+n». Más que esto no se lee. */
const MAX_LANES = 4;

/** Solo la parte de fecha: PocketBase guarda "2026-08-19 00:00:00.000Z". */
function dayOf(value: string | null | undefined): string {
  return String(value || "").slice(0, 10);
}

const STATUS_BAND: Record<string, string> = {
  confirmed: "bg-accent/70",
  tentative: "bg-warn/60",
  done: "bg-ok/50",
};

export interface MonthGridProps {
  /** "YYYY-MM" */
  month: string;
  commitments: Commitment[];
  events: CalendarEvent[];
  load: Map<string, WeekLoad>;
  capacity: number;
  today: string;
  selected: string;
  onSelect: (day: string) => void;
}

export function MonthGrid({
  month,
  commitments,
  events,
  load,
  capacity,
  today,
  selected,
  onSelect,
}: MonthGridProps) {
  const grid = useMemo(() => {
    const weeks = monthWeeks(month).map(weekDays);

    const live = commitments.filter(
      (c) => c.status !== "cancelled" && c.start_date && c.end_date
    );

    const byDay = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const d = eventDayKey(e.start, e.all_day);
      if (!d) continue;
      const list = byDay.get(d) || [];
      list.push(e);
      byDay.set(d, list);
    }
    for (const list of byDay.values()) {
      list.sort((a, b) => String(a.start).localeCompare(String(b.start)));
    }

    return { weeks, live, byDay, monthNumber: Number(month.slice(5, 7)) };
  }, [month, commitments, events]);

  const cap = capacity > 0 ? capacity : 1;

  return (
    <div>
      {/* Siete columnas y una angosta: el total de la semana no es un día, pero
          es lo que hace que esta vista siga respondiendo «¿cuánto llevo?». */}
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_2.75rem] gap-px overflow-hidden rounded-xl bg-bg text-[12px]">
        {DOW.map((d) => (
          <div key={d} className="bg-panel2 py-1.5 text-center font-semibold text-faint">
            <span className="md:hidden">{d.slice(0, 1)}</span>
            <span className="hidden md:inline">{d}</span>
          </div>
        ))}
        <div className="bg-panel2 py-1.5 text-center font-semibold text-faint">h</div>

        {grid.weeks.map((week) => {
          const wk = week[0];
          const row = load.get(wk);
          const total = row?.total || 0;
          const over = total > cap + 1e-9;

          // Las bandas de la semana, en el mismo orden en cada día: es lo que
          // hace que un compromiso se lea como una sola barra de lunes a viernes
          // y no como siete trocitos sueltos.
          const lanes = grid.live
            .filter((c) => dayOf(c.start_date) <= week[6] && dayOf(c.end_date) >= week[0])
            .sort(
              (a, b) =>
                dayOf(a.start_date).localeCompare(dayOf(b.start_date)) || a.id.localeCompare(b.id)
            );
          const shown = lanes.slice(0, MAX_LANES);

          return (
            <Week
              key={wk}
              week={week}
              lanes={shown}
              extra={lanes.length - shown.length}
              eventsByDay={grid.byDay}
              month={grid.monthNumber}
              today={today}
              selected={selected}
              onSelect={onSelect}
              total={total}
              over={over}
              weekNumber={isoWeekNumber(wk)}
            />
          );
        })}
      </div>

    </div>
  );
}

/** La leyenda de la cuadrícula. Va aparte para poder dejarla bajo el detalle. */
export function MonthLegend({ capacity }: { capacity: number }) {
  return (
    <p className="mt-4 border-t border-line pt-3 text-[13px] leading-relaxed text-faint">
      Cada banda es un compromiso a lo largo de los días que ocupa; su ritmo semanal está en la
      columna de la derecha, contra el techo de {fmtHours(capacity)}. Los puntos son eventos de los
      calendarios que conectaste. Toca un día para ver el detalle.
    </p>
  );
}

function Week({
  week,
  lanes,
  extra,
  eventsByDay,
  month,
  today,
  selected,
  onSelect,
  total,
  over,
  weekNumber,
}: {
  week: string[];
  lanes: Commitment[];
  extra: number;
  eventsByDay: Map<string, CalendarEvent[]>;
  month: number;
  today: string;
  selected: string;
  onSelect: (day: string) => void;
  total: number;
  over: boolean;
  weekNumber: number;
}) {
  return (
    <>
      {week.map((d) => {
        const inMonth = Number(d.slice(5, 7)) === month;
        const isToday = d === today;
        const isSelected = d === selected;
        const dayEvents = eventsByDay.get(d) || [];

        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(isSelected ? "" : d)}
            className={cx(
              "min-h-[4.5rem] bg-row px-1 pb-1 pt-1 text-left align-top transition-colors md:min-h-[6rem]",
              !inMonth && "opacity-45",
              isSelected && "ring-2 ring-inset ring-accent"
            )}
          >
            <span
              className={cx(
                "mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[12px] tabular-nums",
                isToday ? "bg-accent font-bold text-bg" : "text-muted"
              )}
            >
              {Number(d.slice(8, 10))}
            </span>

            {/* Una línea por carril, aunque el compromiso no cubra este día: el
                hueco es lo que mantiene alineada la banda del que sí lo cubre.
                El margen negativo saca las bandas del acolchado de la celda —si
                no, cada día pinta su trocito y la banda se lee como siete
                pastillas sueltas en vez de un proyecto que dura una semana. */}
            <span className="-mx-1 block space-y-0.5">
              {lanes.map((c) => {
                const covers = dayOf(c.start_date) <= d && dayOf(c.end_date) >= d;
                if (!covers) return <span key={c.id} className="block h-3.5" />;
                const starts = dayOf(c.start_date) === d || d === week[0];
                return (
                  <span
                    key={c.id}
                    title={`${c.title} · ${fmtHours(c.hours_per_week || 0)}/sem`}
                    className={cx(
                      "relative block h-3.5 px-1 text-[10px] leading-[0.875rem] text-bg",
                      STATUS_BAND[c.status] || "bg-line2",
                      dayOf(c.start_date) === d && "rounded-l",
                      dayOf(c.end_date) === d && "rounded-r"
                    )}
                  >
                    {/* El rótulo se escribe una vez y se deja correr por encima
                        de los días siguientes, como en cualquier calendario:
                        recortarlo al ancho de una celda lo cortaba a media
                        palabra ("Refuerzo Aula Magn"). El z-10 lo mantiene sobre
                        los tramos que vienen después en el DOM. */}
                    {starts && (
                      <span className="pointer-events-none absolute left-1 top-0 z-10 hidden whitespace-nowrap md:block">
                        {c.title}
                      </span>
                    )}
                  </span>
                );
              })}
              {extra > 0 && (
                <span className="block h-3.5 text-[10px] leading-[0.875rem] text-faint">
                  +{extra}
                </span>
              )}
            </span>

            {dayEvents.length > 0 && (
              <span className="mt-1 block">
                <span className="flex items-center gap-1 text-[10px] text-warn">
                  <span aria-hidden>●</span>
                  <span className="hidden truncate md:inline">{dayEvents[0].title}</span>
                  <span className="md:hidden">{dayEvents.length}</span>
                </span>
                {dayEvents.length > 1 && (
                  <span className="hidden text-[10px] text-faint md:block">
                    +{dayEvents.length - 1} más
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}

      <div
        className={cx(
          "flex flex-col items-center justify-center bg-panel2 px-0.5 py-1 text-[11px] tabular-nums",
          over ? "font-semibold text-bad" : total > 0 ? "text-muted" : "text-faint"
        )}
        title={`Semana ${weekNumber}`}
      >
        {Math.round(total)}
      </div>
    </>
  );
}
