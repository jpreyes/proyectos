"use client";

import Link from "next/link";
import type { Entity, Project } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { inputDate } from "@/lib/dates";
import { Form, type Action } from "./form";
import { btn, Card, Field, inputClass, Select } from "./ui";

export function ProjectForm({
  action,
  project,
  entities,
  parents,
}: {
  action: Action;
  project?: Project;
  entities: Entity[];
  parents: Project[];
}) {
  const cfg = useConfig();
  const p = project;

  return (
    <Form action={action} className="space-y-5">
      {p && <input type="hidden" name="id" value={p.id} />}

      <div className="space-y-5">
        <Card title="Identidad">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Nombre">
              <input name="name" required defaultValue={p?.name} className={inputClass} />
            </Field>
            <Field label="Código" hint="Opcional, único">
              <input
                name="code"
                defaultValue={p?.code}
                placeholder="EST-2026-014"
                className={`${inputClass} font-mono`}
              />
            </Field>

            <Field label="Qué es" className="sm:col-span-2" hint="Dos líneas. Para tu yo de dentro de un mes.">
              <textarea
                name="summary"
                rows={2}
                defaultValue={p?.summary}
                className={`${inputClass} resize-y`}
              />
            </Field>

            <Field label="Etiquetas" className="sm:col-span-2" hint="Separadas por coma">
              <input
                name="tags"
                defaultValue={(p?.tags || []).join(", ")}
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card title="Retomar" subtitle="El plan si-entonces con el que vas a volver a entrar.">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Cuando…">
              <input
                name="next_cue"
                defaultValue={p?.next_cue}
                placeholder="abra el computador el lunes"
                className={inputClass}
              />
            </Field>
            <Field label="entonces…">
              <input
                name="next_step"
                defaultValue={p?.next_step}
                placeholder="reviso los residuos del modelo 2"
                className={inputClass}
              />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card title="Estado">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Tipo">
              <Select
                name="kind"
                required
                options={cfg.options("project_kind")}
                defaultValue={p?.kind || "research"}
              />
            </Field>
            <Field label="Estado">
              <Select
                name="status"
                required
                options={cfg.options("project_status")}
                defaultValue={p?.status || "active"}
              />
            </Field>
            <Field label="Prioridad">
              <Select
                name="priority"
                options={cfg.options("priority")}
                defaultValue={p?.priority || "normal"}
              />
            </Field>
            <Field label="Salud">
              <Select
                name="health"
                options={cfg.options("health")}
                defaultValue={p?.health || "ok"}
              />
            </Field>
          </div>
        </Card>

        <Card title="Contexto">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Contraparte" className="sm:col-span-2">
              <Select
                name="client"
                placeholder="—"
                defaultValue={p?.client}
                options={entities.map((e) => ({ value: e.id, label: e.name }))}
              />
            </Field>
            <Field label="Pertenece a" className="sm:col-span-2" hint="Para agrupar en áreas">
              <Select
                name="parent"
                placeholder="—"
                defaultValue={p?.parent}
                options={parents
                  .filter((x) => x.id !== p?.id)
                  .map((x) => ({ value: x.id, label: x.name }))}
              />
            </Field>
            <Field label="Inicio">
              <input
                type="date"
                name="start_date"
                defaultValue={inputDate(p?.start_date)}
                className={inputClass}
              />
            </Field>
            <Field label="Plazo">
              <input
                type="date"
                name="due_date"
                defaultValue={inputDate(p?.due_date)}
                className={inputClass}
              />
            </Field>
            <Field label="Presupuesto">
              <input
                name="budget"
                inputMode="decimal"
                defaultValue={p?.budget || ""}
                className={inputClass}
              />
            </Field>
            <Field label="Moneda">
              <Select
                name="budget_currency"
                options={cfg.options("currency")}
                defaultValue={p?.budget_currency || cfg.settings.default_currency}
              />
            </Field>
          </div>
        </Card>

        <div className="flex gap-2">
          <button type="submit" className={`${btn("primary")} flex-1`}>
            {p ? "Guardar cambios" : "Crear workspace"}
          </button>
          <Link href={p ? `/w/${p.id}` : "/w"} className={btn("ghost")}>
            Cancelar
          </Link>
        </div>
      </div>
    </Form>
  );
}
