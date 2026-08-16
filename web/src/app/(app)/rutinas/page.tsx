"use client";

import { useMemo } from "react";
import type { Routine, RoutineLog } from "@/lib/types";
import {
  archiveRoutine,
  createRoutine,
  deleteRoutine,
  toggleRoutineDay,
} from "@/lib/local/actions";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { groupBy, sortBy } from "@/lib/local/query";
import { daysUntil, fmtDate, todayISO } from "@/lib/dates";
import { Form } from "@/components/form";
import { btn, Card, cx, Empty, Field, inputClass, PageHeader } from "@/components/ui";
import { Title } from "@/components/Title";

/** Los últimos N días corridos, del más viejo al más nuevo, como YYYY-MM-DD. */
function lastDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function RoutineCard({
  routine,
  logs,
  gridDays,
}: {
  routine: Routine;
  logs: RoutineLog[];
  gridDays: number;
}) {
  const byDay = new Map<string, RoutineLog>();
  for (const l of logs) byDay.set(String(l.date).slice(0, 10), l);

  const days = lastDays(gridDays);
  const today = todayISO();
  const todayLog = byDay.get(today);

  const reps = logs.length;
  const elapsed = routine.started ? Math.abs(daysUntil(routine.started) ?? 0) : 0;

  // Automaticidad autoevaluada a lo largo de las repeticiones, si hay notas.
  const rated = logs
    .filter((l) => l.automaticity > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return (
    <Card
      title={routine.name}
      subtitle={
        routine.cue || routine.action ? (
          <span>
            {routine.cue && <span className="text-faint">Cuando </span>}
            {routine.cue}
            {routine.cue && routine.action && <span className="text-faint">, entonces </span>}
            {routine.action}
          </span>
        ) : undefined
      }
      action={
        <Form action={toggleRoutineDay} className="flex items-center gap-2">
          <input type="hidden" name="routine" value={routine.id} />
          <input type="hidden" name="date" value={today} />
          <input type="hidden" name="log_id" value={todayLog?.id || ""} />
          <button
            type="submit"
            className={cx(
              "rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors",
              todayLog ? "bg-ok/15 text-ok" : "bg-pill text-muted hover:text-ink"
            )}
          >
            {todayLog ? "✓ hecho hoy" : "marcar hoy"}
          </button>
        </Form>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted">
        <span>
          <span className="tabular-nums text-ink">{reps}</span> repetici{reps === 1 ? "ón" : "ones"}
        </span>
        {routine.started && (
          <span>
            <span className="tabular-nums text-ink">{elapsed}</span> días desde{" "}
            {fmtDate(routine.started)}
          </span>
        )}
        {reps > 0 && elapsed > 0 && (
          <span className="text-faint">
            {Math.round((reps / Math.max(elapsed, 1)) * 100)}% de los días
          </span>
        )}
      </div>

      {/* Grilla de puntos, no una racha. Los huecos son información, no fracaso. */}
      <div className="flex flex-wrap gap-1">
        {days.map((d) => {
          const hit = byDay.has(d);
          const isToday = d === today;
          return (
            <span
              key={d}
              title={d}
              className={cx(
                "h-3 w-3 rounded-[3px]",
                hit ? "bg-ok/75" : "bg-line",
                isToday && "ring-2 ring-accent/70"
              )}
            />
          );
        })}
      </div>

      {rated.length >= 3 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-faint">
            Automaticidad (1–7)
          </div>
          <div className="flex items-end gap-[3px]" style={{ height: 48 }}>
            {rated.map((l) => (
              <span
                key={l.id}
                title={`${String(l.date).slice(0, 10)}: ${l.automaticity}`}
                className="min-w-[3px] flex-1 rounded-t-[2px] bg-accent/60"
                style={{ height: `${(l.automaticity / 7) * 100}%` }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
        <Form action={archiveRoutine}>
          <input type="hidden" name="id" value={routine.id} />
          <button type="submit" className={btn("ghost", "sm")}>
            Archivar
          </button>
        </Form>
        <Form action={deleteRoutine} confirm={`¿Eliminar la rutina "${routine.name}"?`}>
          <input type="hidden" name="id" value={routine.id} />
          <button type="submit" className={btn("ghost", "sm")}>
            Eliminar
          </button>
        </Form>
      </div>
    </Card>
  );
}

export default function RoutinesPage() {
  const cfg = useConfig();
  const gridDays = cfg.settings.routine_grid_days;

  const allRoutines = useCollection<Routine>("routines");
  const allLogs = useCollection<RoutineLog>("routine_log");

  const { routines, byRoutine } = useMemo(
    () => ({
      routines: sortBy(
        allRoutines.filter((r) => r.active),
        "name"
      ),
      byRoutine: groupBy(sortBy(allLogs, "date"), (l) => l.routine),
    }),
    [allRoutines, allLogs]
  );

  return (
    <>
      <Title>Rutinas</Title>
      <PageHeader
        title="Rutinas"
        subtitle={`${routines.length} activa${routines.length === 1 ? "" : "s"}`}
      />

      <p className="mb-6 rounded-2xl bg-row px-4 py-4 text-[15px] leading-relaxed text-muted">
        Acá no hay rachas que cuidar: saltarse un día no arruina nada. Un hueco en la grilla es un
        dato, no un fracaso.
      </p>

      <div className="space-y-4">
        {routines.length === 0 && <Empty>Sin rutinas activas.</Empty>}
        {routines.map((r) => (
          <RoutineCard key={r.id} routine={r} logs={byRoutine.get(r.id) || []} gridDays={gridDays} />
        ))}
      </div>

      <details className="group mt-6">
        <summary className={`${btn("subtle")} list-none`}>+ Nueva rutina</summary>
        <Card className="mt-3">
          <Form action={createRoutine} reset className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <input name="name" required className={inputClass} />
            </Field>
            <Field label="Cuando…" hint="Una situación o una hora: funcionan igual">
              <input name="cue" placeholder="me siente en el escritorio" className={inputClass} />
            </Field>
            <Field label="entonces…">
              <input
                name="action"
                placeholder="reviso la bandeja 5 minutos"
                className={inputClass}
              />
            </Field>
            <Field label="Desde" className="sm:col-span-2">
              <input type="date" name="started" defaultValue={todayISO()} className={inputClass} />
            </Field>
            <button type="submit" className={`${btn("primary")} sm:col-span-2`}>
              Crear
            </button>
          </Form>
        </Card>
      </details>
    </>
  );
}
