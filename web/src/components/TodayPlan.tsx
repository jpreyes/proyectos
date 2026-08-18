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
import type { CalendarEvent, Commitment, LogEntry, Task } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { buildDayPlan, fmtMin } from "@/lib/dayplan";
import { fmtHours } from "@/lib/capacity";
import { todayISO } from "@/lib/dates";
import { markBlockDone } from "@/lib/local/actions";
import { Form } from "./form";
import { Card, cx, Empty } from "./ui";

/** `fl-<compromiso>-3` / `fx-<compromiso>-0` -> el id del compromiso. */
function commitmentOf(key: string): string {
  const m = /^(?:fl|fx)-(.+)-\d+$/.exec(key);
  return m ? m[1] : "";
}

export function TodayPlan() {
  const cfg = useConfig();
  const commitments = useCollection<Commitment>("commitments");
  const events = useCollection<CalendarEvent>("calendar_events");
  const tasks = useCollection<Task>("tasks");
  const logs = useCollection<LogEntry>("log");
  const day = todayISO();

  const plan = useMemo(
    () =>
      buildDayPlan({
        day,
        commitments,
        tasks,
        events,
        logs,
        workStart: cfg.settings.work_start,
        workEnd: cfg.settings.work_end,
        lunchStart: cfg.settings.lunch_start,
        lunchEnd: cfg.settings.lunch_end,
      }),
    [
      day,
      commitments,
      tasks,
      events,
      logs,
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
                <span className="min-w-0 flex-1">
                  <span
                    className={cx("block truncate text-[15px]", isLunch && "text-faint")}
                  >
                    {b.label}
                  </span>
                  {b.context && (
                    <span className="block truncate text-[13px] text-faint">{b.context}</span>
                  )}
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
            const hours = (b.to - b.from) / 60;
            return (
              <li key={b.key} className="flex items-center gap-2">
                {/* Un toque: "esto ya lo hice". Escribe la bitácora con sus
                    horas, y lo que quede sin marcar se reparte solo entre los
                    días que quedan de la semana. Los eventos ajenos y el
                    almuerzo no se marcan: no son trabajo tuyo que atrasar. */}
                {b.kind !== "lunch" && b.kind !== "event" ? (
                  <Form action={markBlockDone} className="flex shrink-0">
                    <input type="hidden" name="date" value={day} />
                    <input type="hidden" name="project" value={b.project || ""} />
                    <input type="hidden" name="commitment" value={commitmentOf(b.key)} />
                    <input type="hidden" name="title" value={b.label} />
                    <input type="hidden" name="hours" value={hours} />
                    <input type="hidden" name="task" value={b.task || ""} />
                    <input type="hidden" name="close_task" value={b.task ? "1" : ""} />
                    <button
                      type="submit"
                      aria-label={`Ya lo hice: ${b.label}`}
                      className="grid h-6 w-6 place-items-center rounded-md border-2 border-line2 text-[13px] text-transparent transition-colors hover:border-accent/60 hover:text-accent active:bg-accent/15"
                    >
                      ✓
                    </button>
                  </Form>
                ) : (
                  <span className="h-6 w-6 shrink-0" />
                )}
                {b.project ? (
                  <Link href={`/w/${b.project}`} className={cx(cls, "min-w-0 flex-1 active:bg-pill")}>
                    {row}
                  </Link>
                ) : (
                  <span className={cx(cls, "min-w-0 flex-1")}>{row}</span>
                )}
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
