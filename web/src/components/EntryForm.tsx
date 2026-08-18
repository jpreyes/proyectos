"use client";

import Link from "next/link";
import type { Account, Category, Entity, Entry, Project } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { inputDate, todayISO } from "@/lib/dates";
import { Form, type Action } from "./form";
import { btn, Card, Field, inputClass, Select } from "./ui";

export function EntryForm({
  action,
  entry,
  projects,
  entities,
  accounts,
  categories,
  defaultProject,
  returnTo,
}: {
  action: Action;
  entry?: Entry;
  projects: Project[];
  entities: Entity[];
  accounts: Account[];
  categories: Category[];
  defaultProject?: string;
  returnTo?: string;
}) {
  const cfg = useConfig();
  const e = entry;
  // Ni "IVA" ni "CLP" están escritos en la pantalla: los pone la cuenta. Es lo
  // que permite que este mismo formulario sirva con VAT, GST o IGV.
  const taxLabel = cfg.settings.tax_label || "IVA";
  const taxPct = Math.round((cfg.settings.tax_rate || 0.19) * 100);
  const home = cfg.settings.default_currency || "CLP";

  return (
    <Form action={action} className="space-y-5">
      {e && <input type="hidden" name="id" value={e.id} />}
      <input type="hidden" name="return_to" value={returnTo || "/finanzas"} />

      <div className="space-y-5">
        <Card title="Movimiento">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Fecha">
              <input
                type="date"
                name="date"
                required
                defaultValue={inputDate(e?.date) || todayISO()}
                className={inputClass}
              />
            </Field>
            <Field label="Tipo">
              <Select
                name="direction"
                required
                options={cfg.options("direction")}
                defaultValue={e?.direction || "income"}
              />
            </Field>
            <Field label="Descripción" className="sm:col-span-2">
              <input
                name="description"
                required
                defaultValue={e?.description}
                placeholder="Informe estructural etapa 2"
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card
          title="Monto"
          subtitle={`El valor en ${home} se congela al guardar, para que los reportes históricos no se muevan.`}
        >
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Total">
              <input
                name="amount"
                required
                inputMode="decimal"
                defaultValue={e?.amount || ""}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
            <Field label="Moneda">
              <Select
                name="currency"
                options={cfg.options("currency")}
                defaultValue={e?.currency || cfg.settings.default_currency}
              />
            </Field>
            <Field
              label={`Valor en ${home}`}
              hint={`Solo si el movimiento no está en ${home} (el cambio del día)`}
              className="sm:col-span-2"
            >
              <input
                name="fx_rate"
                inputMode="decimal"
                defaultValue={e?.fx_rate && e.currency !== home ? e.fx_rate : ""}
                placeholder="39.150"
                className={`${inputClass} tabular-nums`}
              />
            </Field>
          </div>

          <div className="mt-3.5 grid gap-3.5 sm:grid-cols-3">
            <Field label="Neto">
              <input
                name="net"
                inputMode="decimal"
                defaultValue={e?.net || ""}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
            <Field label={taxLabel}>
              <input
                name="tax"
                inputMode="decimal"
                defaultValue={e?.tax || ""}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
            <Field label={cfg.settings.withholding_label || "Retención"}>
              <input
                name="withholding"
                inputMode="decimal"
                defaultValue={e?.withholding || ""}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
          </div>

          <label className="mt-4 flex items-center gap-2.5 text-[15px] text-muted">
            <input type="checkbox" name="apply_tax" />
            Calcular neto y {taxLabel} ({taxPct}%) desde el total si los dejo vacíos
          </label>
        </Card>

        <Card title="Documento">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Tipo">
              <Select
                name="doc_type"
                placeholder="—"
                options={cfg.options("doc_type")}
                defaultValue={e?.doc_type}
              />
            </Field>
            <Field label="Número">
              <input
                name="doc_number"
                defaultValue={e?.doc_number}
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label="Notas" className="sm:col-span-2">
              <textarea
                name="notes"
                rows={2}
                defaultValue={e?.notes}
                className={`${inputClass} resize-y`}
              />
            </Field>
          </div>

          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <label className="flex items-start gap-2.5 text-[15px] leading-snug text-muted">
              <input
                type="checkbox"
                name="friction_cost"
                defaultChecked={e?.friction_cost}
                className="mt-1"
              />
              <span>
                <span className="font-semibold text-ink">Costo de fricción</span> — multa, recargo,
                interés por atraso, algo repuesto o comprado dos veces, suscripción olvidada
              </span>
            </label>
            <label className="flex items-center gap-2.5 text-[15px] text-muted">
              <input type="checkbox" name="recurring" defaultChecked={e?.recurring} />
              <span>Es recurrente (suscripción, cuota)</span>
            </label>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card title="Estado del cobro">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Situación">
              <Select
                name="status"
                required
                options={cfg.options("entry_status")}
                defaultValue={e?.status || "invoiced"}
              />
            </Field>
            <Field label="Vence" hint="Cuándo debería estar pagado">
              <input
                type="date"
                name="due_date"
                defaultValue={inputDate(e?.due_date)}
                className={inputClass}
              />
            </Field>
            <Field label="Pagado el">
              <input
                type="date"
                name="paid_date"
                defaultValue={inputDate(e?.paid_date)}
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card title="Vínculos">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Proyecto">
              <Select
                name="project"
                placeholder="—"
                defaultValue={e?.project || defaultProject}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
            <Field label="Contacto">
              <Select
                name="entity"
                placeholder="—"
                defaultValue={e?.entity}
                options={entities.map((x) => ({ value: x.id, label: x.name }))}
              />
            </Field>
            <Field label="Categoría">
              <Select
                name="category"
                placeholder="—"
                defaultValue={e?.category}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
            <Field label="Cuenta">
              <Select
                name="account"
                placeholder="—"
                defaultValue={e?.account}
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              />
            </Field>
          </div>
        </Card>

        <div className="flex gap-2">
          <button type="submit" className={`${btn("primary")} flex-1`}>
            {e ? "Guardar" : "Registrar movimiento"}
          </button>
          <Link href={returnTo || "/finanzas"} className={btn("ghost")}>
            Cancelar
          </Link>
        </div>
      </div>
    </Form>
  );
}
