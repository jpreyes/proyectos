"use client";

/**
 * Qué hacer hoy, en la pantalla que se llama Hoy.
 *
 * Se reportó así: "en Hoy no dice en ninguna parte lo que tengo que hacer hoy".
 * Y era cierto aunque la pantalla estuviera llena: lo que mostraba eran
 * **plazos** —"Memoria de cálculo · en 2 días"— y un plazo dice cuándo vence,
 * no qué hacer ahora. Con cinco cosas venciendo dentro de la quincena, el
 * horizonte contesta "¿voy tarde?" y deja sin contestar "¿por dónde parto?".
 *
 * El motor que sí lo sabe ya existía (`lib/dayplan.ts`) y vivía solo en
 * Calendario → Día, o sea a dos toques de la pantalla que más lo necesitaba.
 * Esto es el mismo plan, en versión corta.
 *
 * Corta y no la grilla de horas: la grilla ocupa diez horas de alto y sirve para
 * mirar la forma del día; acá lo que se necesita es la lista, arriba, sin
 * desplazar. Cada bloque lleva a su proyecto, que es donde está lo que hay que
 * abrir para trabajar.
 */

import Link from "next/link";
import { useMemo } from "react";
import type { CalendarEvent, Commitment } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { buildDayPlan, fmtMin } from "@/lib/dayplan";
import { fmtHours } from "@/lib/capacity";
import { todayISO } from "@/lib/dates";
import { Card, cx, Empty } from "./ui";

export function TodayPlan() {
  const cfg = useConfig();
  const commitments = useCollection<Commitment>("commitments");
  const events = useCollection<CalendarEvent>("calendar_events");
  const day = todayISO();

  const plan = useMemo(
    () =>
      buildDayPlan({
        day,
        commitments,
        events,
        workStart: cfg.settings.work_start,
        workEnd: cfg.settings.work_end,
        lunchStart: cfg.settings.lunch_start,
        lunchEnd: cfg.settings.lunch_end,
      }),
    [
      day,
      commitments,
      events,
      cfg.settings.work_start,
      cfg.settings.work_end,
      cfg.settings.lunch_start,
      cfg.settings.lunch_end,
    ]
  );

  const work = plan.blocks.filter((b) => b.kind !== "lunch");

  return (
    <Card
      id="plan-de-hoy"
      className="mb-6"
      title="Qué hacer hoy"
      subtitle={
        work.length > 0 ? `${fmtHours(plan.placed)} h repartidas` : undefined
      }
      action={
        <Link href="/calendario?vista=dia" className="text-[13px] font-semibold text-accent">
          El día ›
        </Link>
      }
    >
      {work.length === 0 ? (
        <Empty>
          Hoy no tienes horas comprometidas. Si es fin de semana, está bien; si no, compromételas
          en el calendario y aparecen acá.
        </Empty>
      ) : (
        <ul className="space-y-0.5" data-tour="today-plan">
          {plan.blocks.map((b) => {
            const isLunch = b.kind === "lunch";
            const row = (
              <>
                <span
                  className={cx(
                    "w-24 shrink-0 tabular-nums text-[13px]",
                    isLunch ? "text-faint" : "text-muted"
                  )}
                >
                  {fmtMin(b.from)}–{fmtMin(b.to)}
                </span>
                <span
                  className={cx(
                    "min-w-0 flex-1 truncate text-[15px]",
                    isLunch && "text-faint"
                  )}
                >
                  {b.label}
                </span>
                {b.kind === "fixed" && (
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-accent">
                    fijo
                  </span>
                )}
              </>
            );
            const cls =
              "flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 touch-manipulation";
            return b.project ? (
              <li key={b.key}>
                <Link href={`/w/${b.project}`} className={cx(cls, "active:bg-pill")}>
                  {row}
                </Link>
              </li>
            ) : (
              <li key={b.key} className={cls}>
                {row}
              </li>
            );
          })}
        </ul>
      )}

      {plan.unplaced.length > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-[13px] text-warn">
          No cabe en la jornada:{" "}
          {plan.unplaced.map((u) => `${u.label} (${fmtHours(u.hours)} h)`).join(", ")}
        </p>
      )}
    </Card>
  );
}
