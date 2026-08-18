"use client";

/**
 * La tercera columna, y por qué no ensancha nada.
 *
 * El layout de esta app ya fue ancho una vez y se revirtió: llegaba a 72rem y
 * en un notebook producía grillas de cuatro columnas que nadie lee de lado a
 * lado. La lección de entonces sigue en pie y este panel no la toca — `main`
 * conserva su `max-w-3xl` intacto. Lo que se agrega es una columna **aparte**,
 * con contenido de otra naturaleza, que es lo que hace Instagram: el feed
 * angosto se queda angosto y a la derecha va lo que no se lee, se consulta.
 *
 * El criterio de qué entra acá es el mismo que `nav.ts` usa para la barra, y
 * conviene respetarlo antes que la ganas de llenar el espacio: **va lo que
 * querrías ver sin abandonar la pantalla en la que estás.** Lo que solo tiene
 * sentido en Hoy no va — repetir una pestaña en un panel permanente es el mismo
 * ruido que una fila de Yo que duplica un destino.
 *
 * Bajo ese filtro quedaron tres cosas, y ninguna es decorativa:
 *
 *   1. La semana. Es el número que decide si puedes decir que sí a algo nuevo,
 *      y hoy hay que irse al Calendario a buscarlo.
 *   2. Lo vencido y lo inminente, fundido de tareas, plazos y cobros.
 *   3. La plata que está por llegar.
 *
 * Y **se puede actuar desde acá**: cerrar una tarea y marcar un cobro pagado
 * sin moverse. Es lo que separa un panel de un adorno. Como todo en esta app
 * pasa por la réplica local, el cambio se ve al instante en las dos columnas a
 * la vez y sin recargar.
 */

import { useMemo } from "react";
import Link from "next/link";
import type { CalendarEvent, Commitment, Entry, Project, Task } from "@/lib/types";
import { markEntryPaid, setTaskStatus } from "@/lib/local/actions";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { index, sortBy } from "@/lib/local/query";
import { buildWeekLoad, fmtHours, weekStart } from "@/lib/capacity";
import { formatMoneyShort, homeOf } from "@/lib/money";
import { daysUntil, fmtRelative, todayISO } from "@/lib/dates";
import { Form } from "./form";
import { cx } from "./ui";

const ACTIVE = ["idea", "active", "paused", "waiting"];
/** Cuántas filas caben sin que el panel compita con la columna principal. */
const MAX_ROWS = 4;

type Soon = {
  key: string;
  date: string;
  label: string;
  context: string;
  href: string;
  /** Solo las tareas se pueden cerrar desde acá. */
  taskId?: string;
};

export function SideRail() {
  const cfg = useConfig();
  const capacity = cfg.settings.capacity_hours_week || 45;

  const commitments = useCollection<Commitment>("commitments");
  const events = useCollection<CalendarEvent>("calendar_events");
  const projects = useCollection<Project>("projects");
  const tasks = useCollection<Task>("tasks");
  const entries = useCollection<Entry>("entries");

  const view = useMemo(() => {
    const projectById = index(projects);
    const week = weekStart(todayISO());
    const load = buildWeekLoad([week], commitments, events).get(week);
    const used = load?.total ?? 0;

    /* ------------------------------------------------------------- ahora -- */
    // Misma fusión que hace Hoy: un plazo no pesa por venir de una tabla u
    // otra, pesa por estar cerca.
    const soon: Soon[] = [];

    for (const t of sortBy(tasks, "due_date")) {
      if (t.status === "done" || !t.due_date) continue;
      soon.push({
        key: `t-${t.id}`,
        date: t.due_date,
        label: t.title,
        context: projectById.get(t.project)?.name || "Sin proyecto",
        href: t.project ? `/w/${t.project}` : "/w",
        taskId: t.id,
      });
    }
    for (const p of projects) {
      if (!ACTIVE.includes(p.status) || !p.due_date) continue;
      soon.push({
        key: `p-${p.id}`,
        date: p.due_date,
        label: p.name,
        context: "plazo del proyecto",
        href: `/w/${p.id}`,
      });
    }

    const receivables = sortBy(
      entries.filter(
        (e) =>
          e.direction === "income" && (e.status === "invoiced" || e.status === "committed")
      ),
      "due_date"
    );
    for (const e of receivables) {
      if (!e.due_date) continue;
      soon.push({
        key: `e-${e.id}`,
        date: e.due_date,
        label: e.description || "Cobro",
        context: "por cobrar",
        href: `/finanzas/${e.id}`,
      });
    }

    const near = soon
      .filter((s) => {
        const n = daysUntil(s.date);
        return n !== null && n <= cfg.settings.horizon_days;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      used,
      free: Math.max(0, capacity - used),
      pct: capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0,
      over: used > capacity + 0.01,
      near,
      overdue: near.filter((s) => (daysUntil(s.date) ?? 0) < 0).length,
      receivables,
      receivableTotal: receivables.reduce((n, e) => n + homeOf(e), 0),
    };
  }, [projects, tasks, entries, commitments, events, capacity, cfg.settings.horizon_days]);

  return (
    <div className="space-y-5 text-[13px]">
      {/* ------------------------------------------------------ la semana -- */}
      <section className="rounded-2xl bg-row px-4 py-4">
        <Link href="/calendario" className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-semibold tracking-tight">Esta semana</span>
          <span className="text-faint">Calendario ›</span>
        </Link>
        <p className="mt-3 flex items-baseline gap-1.5">
          <span
            className={cx(
              "text-[22px] font-semibold tabular-nums",
              view.over ? "text-bad" : "text-ink"
            )}
          >
            {fmtHours(view.used)}
          </span>
          <span className="text-faint">de {fmtHours(capacity)} h</span>
        </p>
        <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-line">
          <span
            className={cx(
              "block h-full rounded",
              view.over ? "bg-bad" : view.pct > 85 ? "bg-warn" : "bg-accent"
            )}
            style={{ width: `${view.pct}%` }}
          />
        </span>
        <p className={cx("mt-2", view.over ? "text-bad" : "text-faint")}>
          {view.over
            ? `${fmtHours(view.used - capacity)} h sobre el techo`
            : `${fmtHours(view.free)} h libres`}
        </p>
      </section>

      {/* ----------------------------------------------------------- ahora -- */}
      <section className="rounded-2xl bg-row px-4 py-4">
        <Link href="/#horizonte" className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-semibold tracking-tight">Ahora</span>
          {view.overdue > 0 && (
            <span className="font-semibold text-bad">{view.overdue} vencido</span>
          )}
        </Link>

        {view.near.length === 0 ? (
          <p className="mt-3 text-faint">Nada cerca. Buen momento para lo que no tiene plazo.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {view.near.slice(0, MAX_ROWS).map((s) => {
              const n = daysUntil(s.date) ?? 0;
              return (
                <li key={s.key} className="flex items-start gap-2">
                  {/* Solo las tareas se cierran desde acá: un plazo de proyecto
                      no es una casilla, y un cobro se marca abajo con su monto
                      a la vista. */}
                  {s.taskId ? (
                    <Form action={setTaskStatus} className="flex shrink-0 pt-0.5">
                      <input type="hidden" name="id" value={s.taskId} />
                      <input type="hidden" name="status" value="done" />
                      <button
                        type="submit"
                        aria-label={`Marcar lista: ${s.label}`}
                        className="grid h-5 w-5 touch-manipulation place-items-center rounded border-2 border-line2 text-[11px] text-transparent transition-colors hover:border-accent/60 hover:text-accent active:bg-accent/15"
                      >
                        ✓
                      </button>
                    </Form>
                  ) : (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line2" />
                  )}
                  <Link href={s.href} className="min-w-0 flex-1 touch-manipulation active:opacity-60">
                    <span className="block truncate text-ink">{s.label}</span>
                    <span className="mt-0.5 flex items-baseline gap-1.5">
                      <span
                        className={cx(
                          "font-semibold",
                          n < 0 ? "text-bad" : n <= 3 ? "text-warn" : "text-muted"
                        )}
                      >
                        {fmtRelative(s.date)}
                      </span>
                      <span className="min-w-0 truncate text-faint">{s.context}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {view.near.length > MAX_ROWS && (
          <Link href="/#horizonte" className="mt-3 block text-faint">
            {view.near.length - MAX_ROWS} más ›
          </Link>
        )}
      </section>

      {/* ------------------------------------------------------ por cobrar -- */}
      {view.receivables.length > 0 && (
        <section className="rounded-2xl bg-row px-4 py-4">
          <Link href="/finanzas" className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold tracking-tight">Por cobrar</span>
            <span className="text-faint">Finanzas ›</span>
          </Link>
          <p className="mt-2 text-[22px] font-semibold tabular-nums text-warn">
            {formatMoneyShort(view.receivableTotal)}
          </p>
          <ul className="mt-3 space-y-2.5">
            {view.receivables.slice(0, 3).map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <Link
                  href={`/finanzas/${e.id}`}
                  className="min-w-0 flex-1 touch-manipulation active:opacity-60"
                >
                  <span className="block truncate text-ink">{e.description || "Cobro"}</span>
                  <span className="text-faint tabular-nums">{formatMoneyShort(homeOf(e))}</span>
                </Link>
                <Form action={markEntryPaid} className="shrink-0">
                  <input type="hidden" name="id" value={e.id} />
                  <button
                    type="submit"
                    className="touch-manipulation rounded-full px-2 py-1 text-[12px] font-semibold text-ok transition-colors hover:bg-ok/15 active:bg-ok/25"
                  >
                    Pagado
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
