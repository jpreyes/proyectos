import type { Entity, EntityKind } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { createEntity, deleteEntity } from "@/lib/actions";
import { getConfig } from "@/lib/config";
import { ALIVE } from "@/lib/filters";
import { Badge, btn, Card, Empty, Field, inputClass, PageHeader, Select } from "@/components/ui";

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

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {entities.length === 0 && <Empty>Todavía no hay contactos.</Empty>}

          {[...byKind.entries()].map(([kind, list]) => (
            <Card key={kind} title={cfg.label("entity_kind", kind)} subtitle={`${list.length}`}>
              <ul className="divide-y divide-line">
                {list.map((e) => (
                  <li key={e.id} className="group flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium">{e.name}</span>
                        {e.tax_id && (
                          <span className="font-mono text-[11px] text-faint">{e.tax_id}</span>
                        )}
                        {!e.active && <Badge>inactivo</Badge>}
                      </div>
                      {(e.email || e.phone) && (
                        <p className="text-[11px] text-muted">
                          {[e.email, e.phone].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {e.notes && <p className="mt-0.5 text-[12px] text-faint">{e.notes}</p>}
                    </div>
                    <form action={deleteEntity} className="shrink-0">
                      <input type="hidden" name="id" value={e.id} />
                      <button
                        type="submit"
                        className="text-[11px] text-faint opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <Card title="Nuevo contacto">
          <form action={createEntity} className="grid gap-3">
            <Field label="Nombre">
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
            <Field label="Notas">
              <textarea name="notes" rows={2} className={`${inputClass} resize-y`} />
            </Field>
            <button type="submit" className={btn("primary")}>
              Agregar
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
