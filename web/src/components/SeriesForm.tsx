"use client";

import Link from "next/link";
import type { Account, Category, Entity, EntrySeries, Project } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { CADENCE, options } from "@/lib/labels";
import { inputDate, todayISO } from "@/lib/dates";
import { Form, type Action } from "./form";
import { btn, Card, Field, inputClass, Select } from "./ui";

/**
 * La regla, no el movimiento.
 *
 * Es casi el mismo formulario que el de un movimiento —y a propósito: quien
 * sabe registrar un gasto ya sabe programarlo— con una diferencia que ordena
 * todo lo demás: acá no se elige "pagado". Una cuota que todavía no ocurre no
 * puede estar pagada, así que lo que se elige es **con qué estado nace**, y
 * aparte, si esto es de las cosas que siempre llegan, la casilla que las da por
 * pagadas al vencer.
 */
export function SeriesForm({
  action,
  series,
  projects,
  entities,
  accounts,
  categories,
  returnTo,
}: {
  action: Action;
  series?: EntrySeries;
  projects: Project[];
  entities: Entity[];
  accounts: Account[];
  categories: Category[];
  returnTo?: string;
}) {
  const cfg = useConfig();
  const s = series;
  const taxLabel = cfg.settings.tax_label || "IVA";
  const taxPct = Math.round((cfg.settings.tax_rate || 0.19) * 100);
  const home = cfg.settings.default_currency || "CLP";

  return (
    <Form action={action} className="space-y-5">
      {s && <input type="hidden" name="id" value={s.id} />}
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}

      <Card title="Qué se repite">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Descripción" className="sm:col-span-2">
            <input
              name="description"
              required
              defaultValue={s?.description}
              placeholder="Sueldo · Universidad Austral"
              className={inputClass}
            />
          </Field>
          <Field label="Tipo">
            <Select
              name="direction"
              required
              options={cfg.options("direction")}
              defaultValue={s?.direction || "income"}
            />
          </Field>
          <Field label="Cada cuánto">
            <Select
              name="cadence"
              required
              options={options(CADENCE)}
              defaultValue={s?.cadence || "monthly"}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Monto"
        subtitle={`Cada repetición se anota por este monto, y su valor en ${home} queda congelado como el de cualquier movimiento.`}
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Total">
            <input
              name="amount"
              required
              inputMode="decimal"
              defaultValue={s?.amount || ""}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          <Field label="Moneda">
            <Select
              name="currency"
              options={cfg.options("currency")}
              defaultValue={s?.currency || cfg.settings.default_currency}
            />
          </Field>
          <Field
            label={`Valor en ${home}`}
            hint={`Solo si no está en ${home}. Una cuota futura no puede conocer el cambio de su día: va este y se corrige al cobrarla.`}
            className="sm:col-span-2"
          >
            <input
              name="fx_rate"
              inputMode="decimal"
              defaultValue={s?.fx_rate && s.currency !== home ? s.fx_rate : ""}
              placeholder="39.150"
              className={`${inputClass} tabular-nums`}
            />
          </Field>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer list-none text-[13px] font-semibold text-faint">
            Neto, {taxLabel.toLowerCase()} y retención
            <span className="ml-1 inline-block">›</span>
          </summary>
          <div className="mt-3.5 grid gap-3.5 sm:grid-cols-3">
            <Field label="Neto">
              <input
                name="net"
                inputMode="decimal"
                defaultValue={s?.net || ""}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
            <Field label={taxLabel}>
              <input
                name="tax"
                inputMode="decimal"
                defaultValue={s?.tax || ""}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
            <Field label={cfg.settings.withholding_label || "Retención"}>
              <input
                name="withholding"
                inputMode="decimal"
                defaultValue={s?.withholding || ""}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
          </div>
          <label className="mt-4 flex items-center gap-2.5 text-[15px] text-muted">
            <input type="checkbox" name="apply_tax" />
            Calcular neto y {taxLabel} ({taxPct}%) desde el total si los dejo vacíos
          </label>
        </details>
      </Card>

      <Card
        title="Desde cuándo y hasta cuándo"
        subtitle="Sin término, la app mantiene los próximos tres meses anotados y sigue agregando sola."
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Primera vez" hint="De acá salen el día del mes y el ritmo">
            <input
              type="date"
              name="start_date"
              required
              defaultValue={inputDate(s?.start_date) || todayISO()}
              className={inputClass}
            />
          </Field>
          <Field label="Última vez" hint="En blanco: sin término">
            <input
              type="date"
              name="end_date"
              defaultValue={inputDate(s?.end_date)}
              className={inputClass}
            />
          </Field>
          <Field label="O un número de cuotas" hint="0 = sin límite">
            <input
              name="occurrences"
              inputMode="numeric"
              defaultValue={s?.occurrences || ""}
              placeholder="0"
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          <Field label="Vence a los… días" hint="0 = el mismo día">
            <input
              name="due_days"
              inputMode="numeric"
              defaultValue={s?.due_days || ""}
              placeholder="0"
              className={`${inputClass} tabular-nums`}
            />
          </Field>
        </div>
      </Card>

      <Card title="Cómo nace cada repetición">
        <Field label="Situación">
          <Select
            name="status"
            required
            options={cfg
              .options("entry_status")
              .filter((o) => o.value !== "paid" && o.value !== "cancelled")}
            defaultValue={s?.status || "planned"}
          />
        </Field>

        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <label className="flex items-start gap-2.5 text-[15px] leading-snug text-muted">
            <input
              type="checkbox"
              name="auto_paid"
              defaultChecked={s?.auto_paid}
              className="mt-1"
            />
            <span>
              <span className="font-semibold text-ink">Darlo por pagado al llegar la fecha</span> —
              para lo que siempre llega y no hace falta confirmar. Las repeticiones futuras siguen
              proyectadas hasta su día.
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-[15px] leading-snug text-muted">
            <input type="checkbox" name="paused" defaultChecked={s?.paused} className="mt-1" />
            <span>
              <span className="font-semibold text-ink">En pausa</span> — deja de anotar
              repeticiones nuevas. No borra las que ya están.
            </span>
          </label>
        </div>
      </Card>

      <Card title="Vínculos">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Workspace">
            <Select
              name="project"
              placeholder="—"
              defaultValue={s?.project}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Contraparte">
            <Select
              name="entity"
              placeholder="—"
              defaultValue={s?.entity}
              options={entities.map((x) => ({ value: x.id, label: x.name }))}
            />
          </Field>
          <Field label="Categoría">
            <Select
              name="category"
              placeholder="—"
              defaultValue={s?.category}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
          <Field label="Cuenta">
            <Select
              name="account"
              placeholder="—"
              defaultValue={s?.account}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
          <Field label="Documento">
            <Select
              name="doc_type"
              placeholder="—"
              options={cfg.options("doc_type")}
              defaultValue={s?.doc_type}
            />
          </Field>
          <Field label="Notas" className="sm:col-span-2">
            <textarea
              name="notes"
              rows={2}
              defaultValue={s?.notes}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>
      </Card>

      <div className="flex gap-2">
        <button type="submit" className={`${btn("primary")} flex-1`}>
          {s ? "Guardar" : "Programar"}
        </button>
        <Link href={returnTo || "/recurrentes"} className={btn("ghost")}>
          Cancelar
        </Link>
      </div>
    </Form>
  );
}
