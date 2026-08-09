import Link from "next/link";
import type { LogEntry, Project, ProjectKind } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { getConfig } from "@/lib/config";
import { alive, ALIVE } from "@/lib/filters";
import { fmtRelative } from "@/lib/dates";
import { Badge, btn, cx, Empty, inputClass, PageHeader } from "@/components/ui";
import { NextStepLine } from "@/components/NextStep";

export const metadata = { title: "Workspaces · Proyectos" };

const ACTIVE = ["idea", "active", "paused", "waiting"];

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; todos?: string }>;
}) {
  const sp = await searchParams;
  const pb = await requirePB();
  const cfg = await getConfig();

  const filters: string[] = [ALIVE];
  if (sp.q) filters.push(pb.filter("(name ~ {:q} || code ~ {:q} || summary ~ {:q})", { q: sp.q }));
  if (sp.kind) filters.push(pb.filter("kind = {:k}", { k: sp.kind }));
  if (!sp.todos) filters.push(`(${ACTIVE.map((s) => `status = "${s}"`).join(" || ")})`);

  const projects = await pb.collection("projects").getFullList<Project>({
    filter: filters.join(" && "),
    sort: "kind,name",
    expand: "client",
  });

  // Last journal entry per project, so the list can show how cold each one is.
  const recent = await pb
    .collection("log")
    .getList<LogEntry>(1, 400, { filter: ALIVE, sort: "-date", fields: "project,date" });
  const lastSeen = new Map<string, string>();
  for (const l of recent.items) if (!lastSeen.has(l.project)) lastSeen.set(l.project, l.date);

  const byKind = new Map<ProjectKind, Project[]>();
  for (const p of projects) {
    const list = byKind.get(p.kind) || [];
    list.push(p);
    byKind.set(p.kind, list);
  }

  return (
    <>
      <PageHeader
        title="Workspaces"
        subtitle={`${projects.length} ${sp.todos ? "en total" : "abiertos"}`}
        action={
          <Link href="/w/nuevo" className={btn("primary", "sm")}>
            + Nuevo
          </Link>
        }
      />

      <form className="mb-5 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={sp.q || ""}
          placeholder="Buscar…"
          className={`${inputClass} max-w-xs`}
        />
        <select name="kind" defaultValue={sp.kind || ""} className={`${inputClass} max-w-[11rem]`}>
          <option value="">Todos los tipos</option>
          {cfg.options("project_kind").map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 text-[13px] text-muted">
          <input type="checkbox" name="todos" value="1" defaultChecked={!!sp.todos} />
          Incluir cerrados
        </label>
        <button type="submit" className={btn("subtle")}>
          Filtrar
        </button>
      </form>

      {projects.length === 0 && <Empty>No hay workspaces que coincidan.</Empty>}

      <div className="space-y-7">
        {[...byKind.entries()].map(([kind, list]) => (
          <section key={kind}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
              {cfg.label("project_kind", kind)} · {list.length}
            </h2>

            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel/50">
              {list.map((p) => {
                const seen = lastSeen.get(p.id);
                const cold = !seen;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/w/${p.id}`}
                      className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-panel2/60"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium">{p.name}</span>
                        {p.code && (
                          <span className="font-mono text-[11px] text-faint">{p.code}</span>
                        )}
                        <Badge tone={cfg.tone("project_status", p.status)}>
                          {cfg.label("project_status", p.status)}
                        </Badge>
                        {p.health && p.health !== "ok" && (
                          <Badge tone={cfg.tone("health", p.health)}>
                            {cfg.label("health", p.health)}
                          </Badge>
                        )}
                        <span
                          className={cx(
                            "ml-auto text-[11px]",
                            cold ? "text-faint" : "text-muted"
                          )}
                        >
                          {seen ? fmtRelative(seen) : "sin bitácora"}
                        </span>
                      </div>

                      <NextStepLine cue={p.next_cue} step={p.next_step} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
