"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { LogEntry, Project, ProjectKind } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { groupBy, matches, sortBy } from "@/lib/local/query";
import { fmtRelative } from "@/lib/dates";
import { Badge, btn, Empty, Group, inputClass, PageHeader, Row } from "@/components/ui";
import { NextStepLine } from "@/components/NextStep";
import { Title } from "@/components/Title";

const ACTIVE = ["idea", "active", "paused", "waiting"];

/**
 * `useSearchParams` obliga a un límite de Suspense: sin él Next no puede
 * prerenderizar la cáscara, y la cáscara es justo lo que hace que esta pantalla
 * abra sin red.
 */
export default function ProyectosRoute() {
  return (
    <Suspense fallback={null}>
      <ProyectosPage />
    </Suspense>
  );
}

function ProyectosPage() {
  const cfg = useConfig();
  const router = useRouter();
  const sp = useSearchParams();

  const q = sp.get("q") || "";
  const kind = sp.get("kind") || "";
  const todos = sp.get("todos") || "";

  const allProjects = useCollection<Project>("projects");
  const logs = useCollection<LogEntry>("log");

  const { byKind, projects, lastSeen } = useMemo(() => {
    const filtered = allProjects.filter((p) => {
      if (q && !matches([p.name, p.code, p.summary], q)) return false;
      if (kind && p.kind !== kind) return false;
      if (!todos && !ACTIVE.includes(p.status)) return false;
      return true;
    });

    const ordered = sortBy(filtered, "kind", "name");

    // La última entrada de bitácora por proyecto, para poder mostrar cuán frío
    // está cada uno.
    const seen = new Map<string, string>();
    for (const l of sortBy(logs, "-date")) {
      if (!seen.has(l.project)) seen.set(l.project, l.date);
    }

    return {
      projects: ordered,
      lastSeen: seen,
      byKind: groupBy(ordered, (p) => p.kind) as Map<ProjectKind, Project[]>,
    };
  }, [allProjects, logs, q, kind, todos]);

  const filtering = Boolean(q || kind || todos);

  function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["q", "kind", "todos"]) {
      const value = String(fd.get(key) || "").trim();
      if (value) params.set(key, value);
    }
    router.replace(params.size ? `/w?${params}` : "/w");
  }

  return (
    <>
      <Title>Trabajo</Title>
      <PageHeader
        title="Proyectos"
        subtitle={`${projects.length} ${todos ? "en total" : "abiertos"}`}
        action={
          <Link href="/w/nuevo" className={btn("primary", "sm")}>
            + Nuevo
          </Link>
        }
      />

      {/* La búsqueda queda siempre a la vista; los dos refinamientos se pliegan
          en un <details> para que la vista por defecto sea un campo, no cuatro
          controles. Ahora filtra sobre la réplica, así que responde al teclear
          incluso sin red. */}
      <form onSubmit={search} className="mb-6 space-y-2.5">
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
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
            <select name="kind" defaultValue={kind} className={`${inputClass} max-w-[13rem]`}>
              <option value="">Todos los tipos</option>
              {cfg.options("project_kind").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-xl bg-panel2 px-3.5 text-[15px] text-muted">
              <input type="checkbox" name="todos" value="1" defaultChecked={!!todos} />
              Incluir cerrados
            </label>
            <button type="submit" className={btn("subtle")}>
              Aplicar
            </button>
          </div>
        </details>
      </form>

      {projects.length === 0 && <Empty>No hay proyectos que coincidan.</Empty>}

      <div data-tour="work-list">
        {[...byKind.entries()].map(([kindKey, list]) => (
          <Group key={kindKey} title={`${cfg.label("project_kind", kindKey)} · ${list.length}`}>
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
      </div>
    </>
  );
}
