"use client";

import { useMemo } from "react";
import type { Entity, EntityKind } from "@/lib/types";
import { createEntity, deleteEntity } from "@/lib/local/actions";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { groupBy, sortBy } from "@/lib/local/query";
import { Form } from "@/components/form";
import { Badge, btn, Card, Empty, Field, Group, inputClass, PageHeader, Row, Select } from "@/components/ui";
import { Title } from "@/components/Title";

export default function EntitiesPage() {
  const cfg = useConfig();
  const entities = useCollection<Entity>("entities");

  const { byKind, total } = useMemo(() => {
    const ordered = sortBy(entities, "kind", "name");
    return {
      total: ordered.length,
      byKind: groupBy(ordered, (e) => e.kind) as Map<EntityKind, Entity[]>,
    };
  }, [entities]);

  return (
    <>
      <Title>Contactos</Title>
      <PageHeader
        title="Contactos"
        subtitle="Mandantes, universidades, revistas, agencias. Se reutilizan en workspaces y movimientos."
      />

      {total === 0 && <Empty>Todavía no hay contactos.</Empty>}

      {[...byKind.entries()].map(([kind, list]) => (
        <Group key={kind} title={`${cfg.label("entity_kind", kind)} · ${list.length}`}>
          {list.map((e) => (
            <Row
              key={e.id}
              label={e.name}
              chevron={false}
              hint={[e.email, e.phone, e.tax_id, e.notes].filter(Boolean).join(" · ")}
              badge={
                <>
                  {!e.active && <Badge>inactivo</Badge>}
                  <Form
                    action={deleteEntity}
                    confirm={`¿Eliminar ${e.name}?`}
                    className="shrink-0"
                  >
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      aria-label={`Eliminar ${e.name}`}
                      className="grid h-9 w-9 place-items-center rounded-full text-[13px] text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                    >
                      ✕
                    </button>
                  </Form>
                </>
              }
            />
          ))}
        </Group>
      ))}

      {/* Plegado: en un teléfono el formulario estaba al lado de la lista y en
          una columna angosta empujaba cada contacto bajo el pliegue. */}
      <details className="group mt-2">
        <summary className={`${btn("subtle")} list-none`}>+ Nuevo contacto</summary>
        <Card className="mt-3">
          <Form action={createEntity} reset className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <input name="name" required className={inputClass} />
            </Field>
            <Field label="Tipo">
              <Select
                name="kind"
                required
                options={cfg.options("entity_kind")}
                defaultValue="company"
              />
            </Field>
            <Field label="RUT / ID">
              <input name="tax_id" className={`${inputClass} font-mono`} />
            </Field>
            <Field label="Correo">
              <input name="email" type="email" className={inputClass} />
            </Field>
            <Field label="Teléfono">
              <input name="phone" className={inputClass} />
            </Field>
            <Field label="Notas" className="sm:col-span-2">
              <textarea name="notes" rows={2} className={`${inputClass} resize-y`} />
            </Field>
            <button type="submit" className={`${btn("primary")} sm:col-span-2`}>
              Agregar
            </button>
          </Form>
        </Card>
      </details>
    </>
  );
}
