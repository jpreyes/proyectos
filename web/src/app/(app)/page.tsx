"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Entity, Entry, LogEntry, Project, Task } from "@/lib/types";
import { markEntryPaid } from "@/lib/local/actions";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { index, sortBy } from "@/lib/local/query";
import { clpOf, formatCLPShort } from "@/lib/money";
import { daysUntil, fmtRelative } from "@/lib/dates";
import { Form } from "@/components/form";
import { Badge, btn, Card, Empty, Group, PageHeader, Row, Stat } from "@/components/ui";
import { Due } from "@/components/Due";
import { NextStepLine } from "@/components/NextStep";
import { TaskList } from "@/components/TaskList";
import { Title } from "@/components/Title";

const ACTIVE = ["idea", "active", "paused", "waiting"];

type HorizonItem = {
  key: string;
  date: string;
  label: string;
  context: string;
  href: string;
  tag: string;
};

export default function TodayPage() {
  const cfg = useConfig();
  const COLD_DAYS = cfg.settings.cold_days;
  const HORIZON_DAYS = cfg.settings.horizon_days;

  const allProjects = useCollection<Project>("projects");
  const allTasks = useCollection<Task>("tasks");
  const allEntries = useCollection<Entry>("entries");
  const logs = useCollection<LogEntry>("log");
  const entities = useCollection<Entity>("entities");

  const view = useMemo(() => {
    const projectById = index(allProjects);
    const entityById = index(entities);

    const projects = sortBy(
      allProjects.filter((p) => ACTIVE.includes(p.status)),
      "name"
    );
    const tasks = sortBy(
      allTasks.filter((t) => t.status !== "done"),
      "due_date"
    );
    const receivables = sortBy(
      allEntries.filter(
        (e) => e.direction === "income" && (e.status === "invoiced" || e.status === "committed")
      ),
      "due_date"
    );

    const lastSeen = new Map<string, string>();
    for (const l of sortBy(logs, "-date")) {
      if (!lastSeen.has(l.project)) lastSeen.set(l.project, l.date);
    }

    /* ---------------------------------------------------------- horizonte -- */
    // Los plazos solo pesan cuando están cerca. Fundir todas las fuentes en una
    // sola lista con fecha —tareas, plazos de proyecto, plata por cobrar— es lo
    // que convierte un "en algún momento" abstracto en algo con distancia.
    const horizon: HorizonItem[] = [];

    for (const t of tasks) {
      if (!t.due_date) continue;
      horizon.push({
        key: `t-${t.id}`,
        date: t.due_date,
        label: t.title,
        context: projectById.get(t.project)?.name || "Sin workspace",
        href: t.project ? `/w/${t.project}` : "/w",
        tag: "tarea",
      });
    }
    for (const p of projects) {
      if (!p.due_date) continue;
      horizon.push({
        key: `p-${p.id}`,
        date: p.due_date,
        label: `Plazo: ${p.name}`,
        context: cfg.label("project_kind", p.kind),
        href: `/w/${p.id}`,
        tag: "plazo",
      });
    }
    for (const e of receivables) {
      if (!e.due_date) continue;
      horizon.push({
        key: `e-${e.id}`,
        date: e.due_date,
        label: `Cobrar ${formatCLPShort(clpOf(e))} — ${e.description}`,
        context:
          entityById.get(e.entity)?.name || projectById.get(e.project)?.name || "Sin contraparte",
        href: "/finanzas",
        tag: "cobro",
      });
    }

    const near = horizon
      .filter((h) => {
        const n = daysUntil(h.date);
        return n !== null && n <= HORIZON_DAYS;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const withoutPlan = projects.filter((p) => !p.next_step && p.status === "active");
    const cooling = projects
      .filter((p) => {
        if (p.status !== "active") return false;
        const seen = lastSeen.get(p.id);
        if (!seen) return true;
        return Math.abs(daysUntil(seen) ?? 0) > COLD_DAYS;
      })
      .slice(0, 8);

    return {
      projects,
      receivables,
      entityById,
      projectById,
      lastSeen,
      near,
      withoutPlan,
      cooling,
      // Sin esto, una tarea sin fecha no aparece en ninguna parte: el horizonte
      // solo muestra lo que tiene plazo, y una tarea sin proyecto tampoco vive
      // en la ficha de ningún workspace. Sería anotar algo para perderlo.
      loose: tasks.filter((t) => !t.due_date),
      overdueCount: near.filter((h) => (daysUntil(h.date) ?? 0) < 0).length,
      weekCount: near.filter((h) => {
        const n = daysUntil(h.date) ?? 99;
        return n >= 0 && n <= 7;
      }).length,
      receivableTotal: receivables.reduce((s, e) => s + clpOf(e), 0),
    };
  }, [allProjects, allTasks, allEntries, logs, entities, cfg, COLD_DAYS, HORIZON_DAYS]);

  return (
    <>
      <Title>Hoy</Title>
      <PageHeader
        title="Hoy"
        subtitle={new Date().toLocaleDateString("es-CL", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        action={
          <Link href="/w/nuevo" className={btn("subtle", "sm")}>
            + Workspace
          </Link>
        }
      />

      <div data-tour="today-stats" className="mb-6 grid grid-cols-2 gap-3">
        <Stat
          label="Vencido"
          value={view.overdueCount}
          tone={view.overdueCount > 0 ? "bad" : "ok"}
          hint={view.overdueCount === 0 ? "nada atrasado" : "requiere decisión"}
        />
        <Stat
          label="Próximos 7 días"
          value={view.weekCount}
          tone={view.weekCount > 0 ? "warn" : "neutral"}
        />
        <Stat
          label="Por cobrar"
          href="/finanzas"
          value={formatCLPShort(view.receivableTotal)}
          tone={view.receivableTotal > 0 ? "warn" : "neutral"}
          hint={`${view.receivables.length} documento${view.receivables.length === 1 ? "" : "s"}`}
        />
        <Stat label="Workspaces abiertos" href="/w" value={view.projects.length} />
      </div>

      <Group title={`Horizonte · vencido y próximos ${HORIZON_DAYS} días`}>
        {view.near.length === 0 ? (
          <Empty>Nada en el horizonte cercano.</Empty>
        ) : (
          view.near.map((h) => (
            <Row key={h.key} href={h.href} label={h.label} hint={`${h.tag} · ${h.context}`}>
              <span className="mt-1.5 block max-w-40">
                <Due date={h.date} horizon={HORIZON_DAYS} />
              </span>
            </Row>
          ))
        )}
      </Group>

      {view.loose.length > 0 && (
        <Card className="mb-6" title="Pendientes sin fecha">
          <TaskList tasks={view.loose} showProject showForm={false} />
        </Card>
      )}

      <Group
        title="Por cobrar"
        action={
          <Link href="/finanzas" className="text-[13px] font-semibold text-accent">
            Finanzas ›
          </Link>
        }
      >
        {view.receivables.length === 0 ? (
          <Empty>Nada pendiente de cobro.</Empty>
        ) : (
          view.receivables.map((e) => (
            <Row
              key={e.id}
              label={e.description}
              hint={[
                view.entityById.get(e.entity)?.name || "—",
                view.projectById.get(e.project)?.name,
                e.due_date ? `vence ${fmtRelative(e.due_date)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              value={formatCLPShort(clpOf(e))}
              chevron={false}
              badge={
                <>
                  <Badge tone={cfg.tone("entry_status", e.status)}>
                    {cfg.label("entry_status", e.status)}
                  </Badge>
                  <Form action={markEntryPaid} className="shrink-0">
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      className="grid h-9 w-9 place-items-center rounded-full bg-ok/15 text-[15px] text-ok"
                      title="Marcar pagado"
                      aria-label={`Marcar pagado: ${e.description}`}
                    >
                      ✓
                    </button>
                  </Form>
                </>
              }
            />
          ))
        )}
      </Group>

      <Group title="Sin plan de reentrada">
        {view.withoutPlan.length === 0 ? (
          <Empty>Todos tienen su siguiente paso.</Empty>
        ) : (
          view.withoutPlan.map((p) => (
            <Row
              key={p.id}
              href={`/w/${p.id}`}
              label={p.name}
              hint={cfg.label("project_kind", p.kind)}
            />
          ))
        )}
      </Group>

      <Group title={`Enfriándose · sin señales hace más de ${COLD_DAYS} días`}>
        {view.cooling.length === 0 ? (
          <Empty>Todo con actividad reciente.</Empty>
        ) : (
          view.cooling.map((p) => {
            const seen = view.lastSeen.get(p.id);
            return (
              <Row
                key={p.id}
                href={`/w/${p.id}`}
                label={p.name}
                value={seen ? fmtRelative(seen) : "nunca"}
              >
                <NextStepLine cue={p.next_cue} step={p.next_step} />
              </Row>
            );
          })
        )}
      </Group>
    </>
  );
}
