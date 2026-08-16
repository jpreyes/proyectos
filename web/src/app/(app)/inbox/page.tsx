"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { InboxItem, Project } from "@/lib/types";
import { deleteInboxItem, dropInboxItem, triage } from "@/lib/local/actions";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { index, sortBy } from "@/lib/local/query";
import { fmtRelative } from "@/lib/dates";
import { Form } from "@/components/form";
import { btn, Card, Empty, Group, inputClass, PageHeader, Row, Select } from "@/components/ui";
import { Title } from "@/components/Title";

const ACTIVE = ["idea", "active", "paused", "waiting"];

export default function InboxPage() {
  const cfg = useConfig();
  const items = useCollection<InboxItem>("inbox");
  const allProjects = useCollection<Project>("projects");

  const { open, recent, projectOptions, projectById } = useMemo(() => {
    const projects = sortBy(
      allProjects.filter((p) => ACTIVE.includes(p.status)),
      "name"
    );
    return {
      open: sortBy(
        items.filter((i) => i.status === "open"),
        "created"
      ),
      recent: sortBy(
        items.filter((i) => i.status !== "open"),
        "-updated"
      ).slice(0, 15),
      projectOptions: projects.map((p) => ({ value: p.id, label: p.name })),
      projectById: index(allProjects),
    };
  }, [items, allProjects]);

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

      <p className="mb-6 rounded-2xl bg-row px-4 py-4 text-[15px] leading-relaxed text-muted">
        Anotar no cierra el bucle. Una meta pendiente sigue interrumpiendo — con pensamientos
        intrusivos y peor rendimiento en cosas no relacionadas — hasta que existe un{" "}
        <span className="font-semibold text-ink">plan concreto</span>, aunque no la hayas hecho. Por
        eso cada ítem sale de acá convertido en algo con destino y momento.
      </p>

      {open.length === 0 ? (
        <Empty>Nada pendiente de clasificar.</Empty>
      ) : (
        <div className="space-y-4">
          {open.map((item) => (
            <Card key={item.id}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <p className="text-[17px] font-semibold leading-snug">{item.text}</p>
                <span className="shrink-0 text-[12px] text-faint">{fmtRelative(item.created)}</span>
              </div>

              {/* Los dos botones secundarios usan `data-action` en vez del
                  `formAction` de antes: un formulario que no viaja al servidor
                  ya no tiene a dónde apuntar. */}
              <Form
                action={triage}
                alt={{ drop: dropInboxItem, delete: deleteInboxItem }}
                className="grid gap-2.5 sm:grid-cols-2"
              >
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="text" value={item.text} />

                <Select
                  name="dest"
                  defaultValue="task"
                  options={[
                    { value: "plan", label: "Plan si-entonces" },
                    { value: "task", label: "Tarea" },
                    { value: "log", label: "Bitácora" },
                  ]}
                />
                <Select
                  name="project"
                  placeholder="¿En qué workspace?"
                  options={projectOptions}
                  required
                />

                <input
                  name="next_cue"
                  placeholder="Cuando… (solo para plan)"
                  className={inputClass}
                />
                <input
                  name="next_step"
                  placeholder="entonces… (vacío = usa el texto de arriba)"
                  className={inputClass}
                />

                <Select name="priority" options={cfg.options("priority")} defaultValue="normal" />
                <input type="date" name="due_date" className={inputClass} />

                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  <button type="submit" className={btn("primary")}>
                    Darle destino
                  </button>
                  <button
                    type="submit"
                    data-action="drop"
                    className={btn("ghost")}
                    title="Decidir que no se hace"
                  >
                    Descartar
                  </button>
                  <button
                    type="submit"
                    data-action="delete"
                    className={btn("ghost")}
                    aria-label="Borrar"
                  >
                    ✕
                  </button>
                </div>
              </Form>
            </Card>
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
                hint={[i.outcome || "—", projectById.get(i.project)?.name].filter(Boolean).join(" · ")}
              />
            ))}
          </Group>
        </div>
      )}

      {open.length === 0 && recent.length === 0 && (
        <p className="mt-6 text-center text-[13px] text-faint">
          Captura con el botón ＋ y vuelve acá a darle destino.{" "}
          <Link href="/" className="text-accent">
            Ir a Hoy
          </Link>
        </p>
      )}
    </>
  );
}
