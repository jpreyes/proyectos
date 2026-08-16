"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Commitment, Entity, Entry, LogEntry, Project, Quote, Resource, Task } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { useCollection, useRecord } from "@/lib/local/store";
import { useRouteId } from "@/lib/local/route";
import { sortBy } from "@/lib/local/query";
import { clpOf, formatCLPShort } from "@/lib/money";
import { fmtDate, fmtRelative } from "@/lib/dates";
import { fmtHours } from "@/lib/capacity";
import { formatAmount } from "@/lib/money";
import { createCommitment } from "@/lib/local/actions";
import { Form } from "@/components/form";
import { Badge, btn, Card, Empty, Field, Group, inputClass, PageHeader, Row, Stat } from "@/components/ui";
import { NextStep } from "@/components/NextStep";
import { ResourceMap } from "@/components/ResourceMap";
import { LogFeed } from "@/components/LogFeed";
import { TaskList } from "@/components/TaskList";
import { Due } from "@/components/Due";
import { Title } from "@/components/Title";

export default function WorkspacePage() {
  const id = useRouteId();
  const cfg = useConfig();

  const project = useRecord<Project>("projects", id);
  const allResources = useCollection<Resource>("resources");
  const allLogs = useCollection<LogEntry>("log");
  const allTasks = useCollection<Task>("tasks");
  const allEntries = useCollection<Entry>("entries");
  const allProjects = useCollection<Project>("projects");
  const entities = useCollection<Entity>("entities");
  const allCommitments = useCollection<Commitment>("commitments");
  const allQuotes = useCollection<Quote>("quotes");

  const view = useMemo(() => {
    const resources = sortBy(
      allResources.filter((r) => r.project === id),
      "-pinned",
      "position",
      "label"
    );
    const logs = sortBy(
      allLogs.filter((l) => l.project === id),
      "-date",
      "-created"
    );
    const tasks = sortBy(
      allTasks.filter((t) => t.project === id),
      "status",
      "due_date",
      "-priority"
    );
    const entries = sortBy(
      allEntries.filter((e) => e.project === id),
      "-date"
    );

    const paid = (dir: string) =>
      entries
        .filter((e) => e.direction === dir && e.status === "paid")
        .reduce((s, e) => s + clpOf(e), 0);

    return {
      resources,
      logs,
      tasks,
      entries,
      children: sortBy(
        allProjects.filter((p) => p.parent === id),
        "name"
      ),
      open: tasks.filter((t) => t.status !== "done"),
      // Calendario y Presupuestos dejaron de ser pestañas: lo de este proyecto
      // se ve acá, que es donde uno lo va a buscar.
      commitments: sortBy(
        allCommitments.filter((c) => c.project === id && c.status !== "cancelled"),
        "start_date"
      ),
      quotes: sortBy(
        allQuotes.filter((q) => q.project === id),
        "-date"
      ),
      lastLog: logs[0],
      income: paid("income"),
      expense: paid("expense"),
      receivable: entries
        .filter(
          (e) => e.direction === "income" && (e.status === "invoiced" || e.status === "committed")
        )
        .reduce((s, e) => s + clpOf(e), 0),
    };
  }, [id, allResources, allLogs, allTasks, allEntries, allProjects, allCommitments, allQuotes]);

  if (!project || project.deleted) {
    return (
      <>
        <Title>Workspace</Title>
        <PageHeader title="No está" subtitle="Este workspace no existe en esta cuenta." />
        <Link href="/w" className={btn("subtle")}>
          Volver a Trabajo
        </Link>
      </>
    );
  }

  const client = entities.find((e) => e.id === project.client);
  const parent = allProjects.find((p) => p.id === project.parent);
  const margin = view.income - view.expense;

  return (
    <>
      <Title>{project.name}</Title>
      <PageHeader
        title={project.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={cfg.tone("project_status", project.status)}>
              {cfg.label("project_status", project.status)}
            </Badge>
            <Badge>{cfg.label("project_kind", project.kind)}</Badge>
            {project.health && (
              <Badge tone={cfg.tone("health", project.health)}>
                {cfg.label("health", project.health)}
              </Badge>
            )}
            {project.code && <span className="font-mono text-[13px] text-faint">{project.code}</span>}
            {parent && (
              <Link href={`/w/${project.parent}`} className="text-[13px] text-faint">
                ↑ {parent.name}
              </Link>
            )}
            {client && <span className="text-[13px] text-muted">{client.name}</span>}
          </span>
        }
        action={
          <Link href={`/w/${project.id}/editar`} className={btn("subtle", "sm")}>
            Editar ficha
          </Link>
        }
      />

      {/* Bloque de reentrada. Posición fija, siempre primero: retomar una tarea
          tras una interrupción larga depende de reconstruir el contexto
          visualmente, así que esta es la parte que no puede moverse. */}
      <div className="mb-6 space-y-3">
        <NextStep projectId={project.id} cue={project.next_cue} step={project.next_step} />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-[13px] text-faint">
          {view.lastLog ? (
            <span>
              Última señal: <span className="text-muted">{fmtRelative(view.lastLog.date)}</span>
              {view.lastLog.title ? ` · ${view.lastLog.title}` : ""}
            </span>
          ) : (
            <span>Sin bitácora todavía.</span>
          )}
          {project.due_date && (
            <span>
              Plazo: <span className="text-muted">{fmtDate(project.due_date)}</span> (
              {fmtRelative(project.due_date)})
            </span>
          )}
          {view.open.length > 0 && (
            <span>
              {view.open.length} pendiente{view.open.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {project.summary && (
        <Card className="mb-6" title="Qué es">
          <p className="text-[15px] leading-relaxed text-muted">{project.summary}</p>
        </Card>
      )}

      <Card className="mb-6" title="Pendientes">
        <TaskList tasks={view.open} projectId={project.id} />
      </Card>

      {/* El calendario visto desde acá: solo lo que este proyecto ocupa de tus
          semanas, y la forma de comprometer más sin salir de la ficha. */}
      <Card
        className="mb-6"
        title="Horas comprometidas"
        action={
          <Link href="/calendario" className="text-[13px] font-semibold text-accent">
            Calendario ›
          </Link>
        }
      >
        {view.commitments.length === 0 ? (
          <Empty>Este proyecto todavía no ocupa horas de ninguna semana.</Empty>
        ) : (
          <ul className="space-y-2">
            {view.commitments.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {fmtHours(c.hours_per_week)}/sem
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-faint">
                  {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                </span>
                <Badge tone={cfg.tone("commitment_status", c.status)}>
                  {cfg.label("commitment_status", c.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <details className="mt-4 border-t border-line pt-4">
          <summary className={`${btn("subtle", "sm")} list-none`}>+ Comprometer horas</summary>
          <Form action={createCommitment} reset className="mt-3 grid gap-3.5 sm:grid-cols-2">
            <input type="hidden" name="project" value={project.id} />
            <Field label="Qué es" className="sm:col-span-2">
              <input
                name="title"
                required
                defaultValue={project.name}
                className={inputClass}
              />
            </Field>
            <Field label="Horas por semana">
              <input name="hours_per_week" required placeholder="4" className={inputClass} />
            </Field>
            <Field label="Desde">
              <input type="date" name="start_date" required className={inputClass} />
            </Field>
            <Field label="Hasta" className="sm:col-span-2">
              <input type="date" name="end_date" required className={inputClass} />
            </Field>
            <button type="submit" className={`${btn("primary")} sm:col-span-2`}>
              Agregar
            </button>
          </Form>
        </details>
      </Card>

      <Card
        className="mb-6"
        title="Dónde vive"
        subtitle="Cada ubicación con una línea que explique para qué sirve."
      >
        <ResourceMap projectId={project.id} resources={view.resources} />
      </Card>

      <Card
        className="mb-6"
        title="Plata"
        action={
          <Link
            href={`/finanzas/nuevo?project=${project.id}&return_to=/w/${project.id}`}
            className={btn("ghost", "sm")}
          >
            + Movimiento
          </Link>
        }
      >
        {view.entries.length === 0 ? (
          <Empty>Sin movimientos.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Recibido" value={formatCLPShort(view.income)} tone="ok" />
              <Stat label="Gastado" value={formatCLPShort(view.expense)} tone="neutral" />
              <Stat
                label="Por cobrar"
                value={formatCLPShort(view.receivable)}
                tone={view.receivable > 0 ? "warn" : "neutral"}
              />
              <Stat label="Margen" value={formatCLPShort(margin)} tone={margin >= 0 ? "ok" : "bad"} />
            </div>
            <Link
              href={`/finanzas?project=${project.id}`}
              className="mt-4 block text-[13px] font-semibold text-accent"
            >
              Ver los {view.entries.length} movimientos ›
            </Link>
          </>
        )}
      </Card>

      {view.quotes.length > 0 && (
        <Card
          className="mb-6"
          title="Presupuestos"
          action={
            <Link href="/presupuestos" className="text-[13px] font-semibold text-accent">
              Todos ›
            </Link>
          }
        >
          <ul className="space-y-2">
            {view.quotes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/presupuestos/${q.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] hover:text-accent"
                >
                  <span className="shrink-0 font-mono text-[12px] text-faint">
                    {q.number || "s/n"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{q.title}</span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {formatAmount(q.net_total || 0, q.currency || "CLP")}
                  </span>
                  <Badge tone={cfg.tone("quote_status", q.status)}>
                    {cfg.label("quote_status", q.status)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(project.start_date || project.due_date || project.budget > 0) && (
        <Card className="mb-6" title="Ficha">
          <dl className="space-y-3 text-[15px]">
            {project.start_date && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Inicio</dt>
                <dd>{fmtDate(project.start_date)}</dd>
              </div>
            )}
            {project.due_date && (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted">Plazo</dt>
                <dd className="w-40">
                  <Due date={project.due_date} />
                </dd>
              </div>
            )}
            {project.budget > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Presupuesto</dt>
                <dd className="tabular-nums">
                  {project.budget_currency && project.budget_currency !== "CLP"
                    ? `${project.budget_currency} ${project.budget}`
                    : formatCLPShort(project.budget)}
                </dd>
              </div>
            )}
          </dl>
          {project.tags && project.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {project.tags.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          )}
        </Card>
      )}

      {view.children.length > 0 && (
        <Group title="Sub-workspaces">
          {view.children.map((c) => (
            <Row
              key={c.id}
              href={`/w/${c.id}`}
              label={c.name}
              badge={
                <Badge tone={cfg.tone("project_status", c.status)}>
                  {cfg.label("project_status", c.status)}
                </Badge>
              }
            />
          ))}
        </Group>
      )}

      <Card
        title="Bitácora"
        subtitle={`${view.logs.length} entrada${view.logs.length === 1 ? "" : "s"}`}
      >
        <LogFeed projectId={project.id} entries={view.logs} limit={40} />
      </Card>
    </>
  );
}
