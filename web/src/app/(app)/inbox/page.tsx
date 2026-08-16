"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { InboxItem, Project } from "@/lib/types";
import {
  deleteInboxItem,
  dropInboxItem,
  inboxToNote,
  inboxToProject,
  inboxToQuote,
  inboxToTask,
  inboxToToday,
  triage,
} from "@/lib/local/actions";
import { useCollection } from "@/lib/local/store";
import { index, sortBy } from "@/lib/local/query";
import { parseWhen } from "@/lib/local/parse";
import { fmtRelative } from "@/lib/dates";
import { Form } from "@/components/form";
import { btn, Card, cx, Empty, Group, inputClass, PageHeader, Row } from "@/components/ui";
import { Title } from "@/components/Title";

const ACTIVE = ["idea", "active", "paused", "waiting"];

export default function InboxPage() {
  const items = useCollection<InboxItem>("inbox");
  const allProjects = useCollection<Project>("projects");

  const { open, recent, projects, projectById } = useMemo(
    () => ({
      open: sortBy(
        items.filter((i) => i.status === "open"),
        "created"
      ),
      recent: sortBy(
        items.filter((i) => i.status !== "open"),
        "-updated"
      ).slice(0, 15),
      projects: sortBy(
        allProjects.filter((p) => ACTIVE.includes(p.status)),
        "name"
      ),
      projectById: index(allProjects),
    }),
    [items, allProjects]
  );

  return (
    <>
      <Title>Bandeja</Title>
      <PageHeader
        title="Bandeja"
        subtitle={
          open.length === 0
            ? "Vacía."
            : `${open.length} cosa${open.length === 1 ? "" : "s"} esperando destino`
        }
      />

      {open.length === 0 ? (
        <Empty>Nada pendiente de clasificar.</Empty>
      ) : (
        <div className="space-y-3">
          {open.map((item) => (
            <InboxCard key={item.id} item={item} projects={projects} />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-8">
          <Group title="Ya procesado">
            {recent.map((i) => (
              <Row
                key={i.id}
                href={i.project && projectById.get(i.project) ? `/w/${i.project}` : undefined}
                label={i.text}
                hint={[i.outcome || "—", projectById.get(i.project)?.name]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </Group>
        </div>
      )}

      {open.length === 0 && recent.length === 0 && (
        <p className="mt-6 text-center text-[13px] text-faint">
          Escribe con el botón ＋ y vuelve acá a decidir qué es.{" "}
          <Link href="/" className="text-accent">
            Ir a Hoy
          </Link>
        </p>
      )}
    </>
  );
}

/**
 * Una cosa escrita y lo que puede llegar a ser.
 *
 * Antes esto era un formulario de seis campos con el workspace obligatorio, así
 * que algo tan común como "responder correos" no tenía salida: no pertenece a
 * ningún proyecto. Ahora el camino corto es un botón, el proyecto es opcional y
 * lo demás vive plegado para cuando de verdad haga falta.
 *
 * Los destinos que necesitan un proyecto —la bitácora y el plan para retomar—
 * aparecen recién cuando eliges uno, en vez de estar ahí apagados: una bitácora
 * sin proyecto no se lee en ninguna parte.
 */
function InboxCard({ item, projects }: { item: InboxItem; projects: Project[] }) {
  const [project, setProject] = useState("");
  const when = useMemo(() => parseWhen(item.text), [item.text]);

  return (
    <Card>
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <p className="text-[17px] font-semibold leading-snug">{item.text}</p>
        <span className="shrink-0 text-[12px] text-faint">{fmtRelative(item.created)}</span>
      </div>

      <Form
        action={inboxToTask}
        alt={{
          hoy: inboxToToday,
          nota: inboxToNote,
          plan: triage,
          descartar: dropInboxItem,
          borrar: deleteInboxItem,
          workspace: inboxToProject,
          presupuesto: inboxToQuote,
        }}
      >
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="text" value={item.text} />
        <input type="hidden" name="project" value={project} />
        <input type="hidden" name="due_date" value={when?.date || ""} />
        <input type="hidden" name="dest" value="plan" />

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={btn("primary")}>
            Tarea{when ? ` · ${when.label}` : ""}
          </button>
          {when?.label !== "hoy" && (
            <button type="submit" data-action="hoy" className={btn("subtle")}>
              Para hoy
            </button>
          )}
          {project && (
            <button type="submit" data-action="nota" className={btn("subtle")}>
              Bitácora
            </button>
          )}
          <button type="submit" data-action="descartar" className={btn("ghost")}>
            Descartar
          </button>
          <button
            type="submit"
            data-action="borrar"
            className={btn("ghost")}
            aria-label="Borrar"
            title="Borrar"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-faint">En</span>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className={cx(inputClass, "max-w-[15rem] py-2 text-[13px]")}
          >
            <option value="">ningún proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <details className="group mt-3">
          <summary className="cursor-pointer list-none text-[13px] font-semibold text-faint">
            Otra cosa
            <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
          </summary>

          <div className="mt-2.5 space-y-2.5">
            <div className="flex flex-wrap gap-2">
              <button type="submit" data-action="workspace" className={btn("subtle", "sm")}>
                Crear workspace con esto
              </button>
              <button type="submit" data-action="presupuesto" className={btn("subtle", "sm")}>
                Empezar un presupuesto
              </button>
            </div>

            {project && (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input name="next_cue" placeholder="Cuando…" className={inputClass} />
                <input name="next_step" placeholder="entonces…" className={inputClass} />
                <button type="submit" data-action="plan" className={btn("subtle")}>
                  Dejarlo como plan
                </button>
              </div>
            )}
          </div>
        </details>
      </Form>
    </Card>
  );
}
