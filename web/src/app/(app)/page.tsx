import Link from "next/link";
import type { Entry, LogEntry, Project, Task } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { addLog, markEntryPaid } from "@/lib/actions";
import { getConfig } from "@/lib/config";
import { alive, ALIVE } from "@/lib/filters";
import { clpOf, formatCLPShort } from "@/lib/money";
import { daysUntil, fmtRelative, todayISO } from "@/lib/dates";
import { Badge, btn, Card, cx, Empty, inputClass, PageHeader, Stat } from "@/components/ui";
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

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Vencido"
          value={overdueCount}
          tone={overdueCount > 0 ? "bad" : "ok"}
          hint={overdueCount === 0 ? "nada atrasado" : "requiere decisión"}
        />
        <Stat label="Próximos 7 días" value={weekCount} tone={weekCount > 0 ? "warn" : "neutral"} />
        <Stat
          label="Por cobrar"
          value={formatCLPShort(receivableTotal)}
          tone={receivableTotal > 0 ? "warn" : "neutral"}
          hint={`${receivables.length} documento${receivables.length === 1 ? "" : "s"}`}
        />
        <Stat label="Workspaces abiertos" value={projects.length} />
      </div>

      {/* Capture has to cost nothing, or the offload never happens. */}
      <form
        action={addLog}
        className="mb-6 flex flex-wrap gap-2 rounded-lg border border-line bg-panel/60 px-3 py-2.5"
      >
        <input type="hidden" name="date" value={todayISO()} />
        <input type="hidden" name="kind" value="note" />
        <select name="project" required className={`${inputClass} max-w-[13rem]`}>
          <option value="">¿Dónde va?</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          name="body"
          required
          placeholder="Anota rápido lo que no quieres perder…"
          className={`${inputClass} min-w-40 flex-1`}
        />
        <button type="submit" className={btn("primary", "sm")}>
          Guardar
        </button>
      </form>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card title="Horizonte" subtitle={`Vencido y próximos ${HORIZON_DAYS} días`}>
            {near.length === 0 ? (
              <Empty>Nada en el horizonte cercano.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {near.map((h) => (
                  <li key={h.key}>
                    <Link
                      href={h.href}
                      className="flex items-center gap-3 py-2.5 transition-colors hover:bg-panel2/50"
                    >
                      <span className="w-28 shrink-0">
                        <Due date={h.date} horizon={HORIZON_DAYS} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{h.label}</span>
                        <span className="block truncate text-[11px] text-faint">
                          {h.tag} · {h.context}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Por cobrar"
            subtitle="Lo más concreto que registra el sistema."
            action={
              <Link href="/finanzas" className={btn("ghost", "sm")}>
                Finanzas →
              </Link>
            }
          >
            {receivables.length === 0 ? (
              <Empty>Nada pendiente de cobro.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {receivables.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{e.description}</span>
                      <span className="block truncate text-[11px] text-faint">
                        {e.expand?.entity?.name || "—"}
                        {e.expand?.project ? ` · ${e.expand.project.name}` : ""}
                        {e.due_date ? ` · vence ${fmtRelative(e.due_date)}` : ""}
                      </span>
                    </span>
                    <Badge tone={cfg.tone("entry_status", e.status)}>
                      {cfg.label("entry_status", e.status)}
                    </Badge>
                    <span className="w-24 shrink-0 text-right text-[13px] tabular-nums">
                      {formatCLPShort(clpOf(e))}
                    </span>
                    <form action={markEntryPaid} className="shrink-0">
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="project" value={e.project} />
                      <button type="submit" className={btn("ghost", "sm")} title="Marcar pagado">
                        ✓
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card
            title="Sin plan de reentrada"
            subtitle="Activos sin un si-entonces definido."
          >
            {withoutPlan.length === 0 ? (
              <Empty>Todos tienen su siguiente paso.</Empty>
            ) : (
              <ul className="space-y-1">
                {withoutPlan.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/w/${p.id}`}
                      className="block rounded px-2 py-1.5 hover:bg-panel2"
                    >
                      <span className="block text-[13px]">{p.name}</span>
                      <span className="block text-[11px] text-faint">
                        {cfg.label("project_kind", p.kind)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Enfriándose"
            subtitle={`Activos sin señales hace más de ${COLD_DAYS} días`}
          >
            {cooling.length === 0 ? (
              <Empty>Todo con actividad reciente.</Empty>
            ) : (
              <ul className="space-y-1">
                {cooling.map((p) => {
                  const seen = lastSeen.get(p.id);
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/w/${p.id}`}
                        className="block rounded px-2 py-1.5 hover:bg-panel2"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px]">{p.name}</span>
                          <span className={cx("shrink-0 text-[11px] text-faint")}>
                            {seen ? fmtRelative(seen) : "nunca"}
                          </span>
                        </span>
                        <NextStepLine cue={p.next_cue} step={p.next_step} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
