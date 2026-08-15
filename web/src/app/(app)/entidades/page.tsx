import type { Entity, EntityKind } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { createEntity, deleteEntity } from "@/lib/actions";
import { getConfig } from "@/lib/config";
import { ALIVE } from "@/lib/filters";
import { Badge, btn, Card, Empty, Field, Group, inputClass, PageHeader, Row, Select } from "@/components/ui";

export const metadata = { title: "Contactos · Proyectos" };

export default async function EntitiesPage() {
  const pb = await requirePB();
  const cfg = await getConfig();
  const entities = await pb
    .collection("entities")
    .getFullList<Entity>({ filter: ALIVE, sort: "kind,name" });

  const byKind = new Map<EntityKind, Entity[]>();
  for (const e of entities) {
    const list = byKind.get(e.kind) || [];
    list.push(e);
    byKind.set(e.kind, list);
  }

  return (
    <>
      <PageHeader
        title="Contactos"
        subtitle="Mandantes, universidades, revistas, agencias. Se reutilizan en workspaces y movimientos."
      />

      {entities.length === 0 && <Empty>Todavía no hay contactos.</Empty>}

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
                  <form action={deleteEntity} className="shrink-0">
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      aria-label={`Eliminar ${e.name}`}
                      className="grid h-9 w-9 place-items-center rounded-full text-[13px] text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                    >
                      ✕
                    </button>
                  </form>
                </>
              }
            />
          ))}
        </Group>
      ))}

      {/* Folded away: on a phone the form used to sit beside the list and on a
          narrow column it would push every contact below the fold. */}
      <details className="group mt-2">
        <summary className={`${btn("subtle")} list-none`}>+ Nuevo contacto</summary>
        <Card className="mt-3">
          <form action={createEntity} className="grid gap-3.5 sm:grid-cols-2">
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
          </form>
        </Card>
      </details>
    </>
  );
}
