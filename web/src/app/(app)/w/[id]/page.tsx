import Link from "next/link";
import { notFound } from "next/navigation";
import type { Entry, LogEntry, Project, Resource, Task } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { getConfig } from "@/lib/config";
import { alive, ALIVE } from "@/lib/filters";
import { clpOf, formatCLPShort } from "@/lib/money";
import { fmtDate, fmtRelative } from "@/lib/dates";
import { Badge, btn, Card, Empty, Group, PageHeader, Row, Stat } from "@/components/ui";
import { NextStep } from "@/components/NextStep";
import { ResourceMap } from "@/components/ResourceMap";
import { LogFeed } from "@/components/LogFeed";
import { TaskList } from "@/components/TaskList";
import { Due } from "@/components/Due";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const pb = await requirePB();
    const p = await pb.collection("projects").getOne<Project>(id);
    return { title: `${p.name} · Proyectos` };
  } catch {
    return { title: "Workspace · Proyectos" };
  }
}

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pb = await requirePB();

  let project: Project;
  try {
    project = await pb.collection("projects").getOne<Project>(id, { expand: "client,parent" });
  } catch {
    notFound();
  }

  const cfg = await getConfig();
  const scope = alive(pb.filter("project = {:id}", { id }));

  const [resources, logs, tasks, entries, children] = await Promise.all([
    pb
      .collection("resources")
      .getFullList<Resource>({ filter: scope, sort: "-pinned,position,label" }),
    pb.collection("log").getList<LogEntry>(1, 40, { filter: scope, sort: "-date,-created" }),
    pb.collection("tasks").getFullList<Task>({ filter: scope, sort: "status,due_date,-priority" }),
    pb.collection("entries").getFullList<Entry>({ filter: scope, sort: "-date" }),
    pb.collection("projects").getFullList<Project>({
      filter: alive(pb.filter("parent = {:id}", { id })),
      sort: "name",
    }),
  ]);

  const open = tasks.filter((t) => t.status !== "done");
  const lastLog = logs.items[0];

  const income = entries
    .filter((e) => e.direction === "income" && e.status === "paid")
    .reduce((s, e) => s + clpOf(e), 0);
  const expense = entries
    .filter((e) => e.direction === "expense" && e.status === "paid")
    .reduce((s, e) => s + clpOf(e), 0);
  const receivable = entries
    .filter(
      (e) => e.direction === "income" && (e.status === "invoiced" || e.status === "committed")
    )
    .reduce((s, e) => s + clpOf(e), 0);

  const margin = income - expense;

  return (
    <>
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
            {project.expand?.parent && (
              <Link href={`/w/${project.parent}`} className="text-[13px] text-faint">
                ↑ {project.expand.parent.name}
              </Link>
            )}
            {project.expand?.client && (
              <span className="text-[13px] text-muted">{project.expand.client.name}</span>
            )}
          </span>
        }
        action={
          <Link href={`/w/${project.id}/editar`} className={btn("subtle", "sm")}>
            Editar ficha
          </Link>
        }
      />

      {/* Re-entry block. Fixed position, always first: resuming a task after a
          long gap depends on visually reconstructing the context, so this is
          the part that must never move. */}
      <div className="mb-6 space-y-3">
        <NextStep projectId={project.id} cue={project.next_cue} step={project.next_step} />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-[13px] text-faint">
          {lastLog ? (
            <span>
              Última señal: <span className="text-muted">{fmtRelative(lastLog.date)}</span>
              {lastLog.title ? ` · ${lastLog.title}` : ""}
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
          {open.length > 0 && (
            <span>
              {open.length} pendiente{open.length === 1 ? "" : "s"}
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
        <TaskList tasks={open} projectId={project.id} />
      </Card>

      <Card
        className="mb-6"
        title="Dónde vive"
        subtitle="Cada ubicación con una línea que explique para qué sirve."
      >
        <ResourceMap projectId={project.id} resources={resources} />
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
        {entries.length === 0 ? (
          <Empty>Sin movimientos.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Recibido" value={formatCLPShort(income)} tone="ok" />
              <Stat label="Gastado" value={formatCLPShort(expense)} tone="neutral" />
              <Stat
                label="Por cobrar"
                value={formatCLPShort(receivable)}
                tone={receivable > 0 ? "warn" : "neutral"}
              />
              <Stat label="Margen" value={formatCLPShort(margin)} tone={margin >= 0 ? "ok" : "bad"} />
            </div>
            <Link
              href={`/finanzas?project=${project.id}`}
              className="mt-4 block text-[13px] font-semibold text-accent"
            >
              Ver los {entries.length} movimientos ›
            </Link>
          </>
        )}
      </Card>

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

      {children.length > 0 && (
        <Group title="Sub-workspaces">
          {children.map((c) => (
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

      <Card title="Bitácora" subtitle={`${logs.totalItems} entrada${logs.totalItems === 1 ? "" : "s"}`}>
        <LogFeed projectId={project.id} entries={logs.items} />
      </Card>
    </>
  );
}
