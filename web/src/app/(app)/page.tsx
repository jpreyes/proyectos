import Link from "next/link";
import type { Entry, LogEntry, Project, Task } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { markEntryPaid } from "@/lib/actions";
import { getConfig } from "@/lib/config";
import { alive, ALIVE } from "@/lib/filters";
import { clpOf, formatCLPShort } from "@/lib/money";
import { daysUntil, fmtRelative } from "@/lib/dates";
import { Badge, btn, Empty, Group, PageHeader, Row, Stat } from "@/components/ui";
import { Due } from "@/components/Due";
import { NextStepLine } from "@/components/NextStep";

export const metadata = { title: "Hoy · Proyectos" };

const ACTIVE = ["idea", "active", "paused", "waiting"];

type HorizonItem = {
  key: string;
  date: string;
  label: string;
  context: string;
  href: string;
  tag: string;
};

export default async function TodayPage() {
  const pb = await requirePB();
  const cfg = await getConfig();
  const COLD_DAYS = cfg.settings.cold_days;
  const HORIZON_DAYS = cfg.settings.horizon_days;

  const activeFilter = `(${ACTIVE.map((s) => `status = "${s}"`).join(" || ")})`;

  const [projects, tasks, receivables, recentLogs] = await Promise.all([
    pb.collection("projects").getFullList<Project>({ filter: alive(activeFilter), sort: "name" }),
    pb.collection("tasks").getFullList<Task>({
      filter: alive('status != "done"'),
      sort: "due_date",
      expand: "project",
    }),
    pb.collection("entries").getFullList<Entry>({
      filter: alive('direction = "income" && (status = "invoiced" || status = "committed")'),
      sort: "due_date",
      expand: "project,entity",
    }),
    pb
      .collection("log")
      .getList<LogEntry>(1, 400, { filter: ALIVE, sort: "-date", fields: "project,date" }),
  ]);

  const lastSeen = new Map<string, string>();
  for (const l of recentLogs.items) if (!lastSeen.has(l.project)) lastSeen.set(l.project, l.date);

  /* ------------------------------------------------------------ horizon --- */
  // Deadlines only feel real when they are close. Merging every source into one
  // dated list — tasks, project deadlines, money owed — is what turns an
  // abstract "sometime" into something with visible distance.
  const horizon: HorizonItem[] = [];

  for (const t of tasks) {
    if (!t.due_date) continue;
    horizon.push({
      key: `t-${t.id}`,
      date: t.due_date,
      label: t.title,
      context: t.expand?.project?.name || "Sin workspace",
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
      context: e.expand?.entity?.name || e.expand?.project?.name || "Sin contraparte",
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

  const overdueCount = near.filter((h) => (daysUntil(h.date) ?? 0) < 0).length;
  const weekCount = near.filter((h) => {
    const n = daysUntil(h.date) ?? 99;
    return n >= 0 && n <= 7;
  }).length;

  /* ------------------------------------------------------------- money ---- */
  const receivableTotal = receivables.reduce((s, e) => s + clpOf(e), 0);

  /* ------------------------------------------------------------ nudges ---- */
  const withoutPlan = projects.filter((p) => !p.next_step && p.status === "active");
  const cooling = projects
    .filter((p) => {
      if (p.status !== "active") return false;
      const seen = lastSeen.get(p.id);
      if (!seen) return true;
      return Math.abs(daysUntil(seen) ?? 0) > COLD_DAYS;
    })
    .slice(0, 8);

  return (
    <>
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

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat
          label="Vencido"
          value={overdueCount}
          tone={overdueCount > 0 ? "bad" : "ok"}
          hint={overdueCount === 0 ? "nada atrasado" : "requiere decisión"}
        />
        <Stat label="Próximos 7 días" value={weekCount} tone={weekCount > 0 ? "warn" : "neutral"} />
        <Stat
          label="Por cobrar"
          href="/finanzas"
          value={formatCLPShort(receivableTotal)}
          tone={receivableTotal > 0 ? "warn" : "neutral"}
          hint={`${receivables.length} documento${receivables.length === 1 ? "" : "s"}`}
        />
        <Stat label="Workspaces abiertos" href="/w" value={projects.length} />
      </div>

      <Group title={`Horizonte · vencido y próximos ${HORIZON_DAYS} días`}>
        {near.length === 0 ? (
          <Empty>Nada en el horizonte cercano.</Empty>
        ) : (
          near.map((h) => (
            <Row key={h.key} href={h.href} label={h.label} hint={`${h.tag} · ${h.context}`}>
              <span className="mt-1.5 block max-w-40">
                <Due date={h.date} horizon={HORIZON_DAYS} />
              </span>
            </Row>
          ))
        )}
      </Group>

      <Group
        title="Por cobrar"
        action={
          <Link href="/finanzas" className="text-[13px] font-semibold text-accent">
            Finanzas ›
          </Link>
        }
      >
        {receivables.length === 0 ? (
          <Empty>Nada pendiente de cobro.</Empty>
        ) : (
          receivables.map((e) => (
            <Row
              key={e.id}
              label={e.description}
              hint={[
                e.expand?.entity?.name || "—",
                e.expand?.project?.name,
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
                  <form action={markEntryPaid} className="shrink-0">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="project" value={e.project} />
                    <button
                      type="submit"
                      className="grid h-9 w-9 place-items-center rounded-full bg-ok/15 text-[15px] text-ok"
                      title="Marcar pagado"
                      aria-label={`Marcar pagado: ${e.description}`}
                    >
                      ✓
                    </button>
                  </form>
                </>
              }
            />
          ))
        )}
      </Group>

      <Group title="Sin plan de reentrada">
        {withoutPlan.length === 0 ? (
          <Empty>Todos tienen su siguiente paso.</Empty>
        ) : (
          withoutPlan.map((p) => (
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
        {cooling.length === 0 ? (
          <Empty>Todo con actividad reciente.</Empty>
        ) : (
          cooling.map((p) => {
            const seen = lastSeen.get(p.id);
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
