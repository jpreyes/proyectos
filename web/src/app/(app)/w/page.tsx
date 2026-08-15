import Link from "next/link";
import type { LogEntry, Project, ProjectKind } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { getConfig } from "@/lib/config";
import { alive, ALIVE } from "@/lib/filters";
import { fmtRelative } from "@/lib/dates";
import { Badge, btn, Empty, Group, inputClass, PageHeader, Row } from "@/components/ui";
import { NextStepLine } from "@/components/NextStep";

export const metadata = { title: "Trabajo · Proyectos" };

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

  const filtering = Boolean(sp.q || sp.kind || sp.todos);

  return (
    <>
      <PageHeader
        title="Trabajo"
        subtitle={`${projects.length} ${sp.todos ? "en total" : "abiertos"}`}
        action={
          <Link href="/w/nuevo" className={btn("primary", "sm")}>
            + Nuevo
          </Link>
        }
      />

      {/* Search stays inline and always visible; the two refinements collapse
          into a <details> so the default view is one field, not four controls. */}
      <form className="mb-6 space-y-2.5">
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={sp.q || ""}
            placeholder="Buscar…"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button type="submit" className={btn("subtle")}>
            Buscar
          </button>
        </div>

        <details open={filtering} className="group">
          <summary className="cursor-pointer list-none px-1 text-[13px] font-semibold text-faint">
            Filtros
            <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <select
              name="kind"
              defaultValue={sp.kind || ""}
              className={`${inputClass} max-w-[13rem]`}
            >
              <option value="">Todos los tipos</option>
              {cfg.options("project_kind").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-xl bg-panel2 px-3.5 text-[15px] text-muted">
              <input type="checkbox" name="todos" value="1" defaultChecked={!!sp.todos} />
              Incluir cerrados
            </label>
            <button type="submit" className={btn("subtle")}>
              Aplicar
            </button>
          </div>
        </details>
      </form>

      {projects.length === 0 && <Empty>No hay workspaces que coincidan.</Empty>}

      {[...byKind.entries()].map(([kind, list]) => (
        <Group key={kind} title={`${cfg.label("project_kind", kind)} · ${list.length}`}>
          {list.map((p) => {
            const seen = lastSeen.get(p.id);
            return (
              <Row
                key={p.id}
                href={`/w/${p.id}`}
                label={p.name}
                value={seen ? fmtRelative(seen) : "sin bitácora"}
                badge={
                  <>
                    <Badge tone={cfg.tone("project_status", p.status)}>
                      {cfg.label("project_status", p.status)}
                    </Badge>
                    {p.health && p.health !== "ok" && (
                      <Badge tone={cfg.tone("health", p.health)}>
                        {cfg.label("health", p.health)}
                      </Badge>
                    )}
                  </>
                }
              >
                <NextStepLine cue={p.next_cue} step={p.next_step} />
              </Row>
            );
          })}
        </Group>
      ))}
    </>
  );
}
