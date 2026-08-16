"use client";

import { useState } from "react";
import type { TaxGroup, TaxRow } from "@/lib/config";
import { createTaxonomy, deleteTaxonomy, saveSettings, updateTaxonomy } from "@/lib/local/actions";
import { useConfig } from "@/lib/local/config";
import { deleteDemoData, useDemoCount } from "@/lib/local/demo";
import { startTour } from "@/lib/tour";
import { Form } from "@/components/form";
import { ThemePicker } from "@/components/ThemePicker";
import { Badge, btn, cx, Field, inputClass, PageHeader, Select } from "@/components/ui";
import { Title } from "@/components/Title";

const TONES = [
  { value: "neutral", label: "Neutro" },
  { value: "accent", label: "Verde" },
  { value: "ok", label: "Verde oscuro" },
  { value: "warn", label: "Ámbar" },
  { value: "bad", label: "Rojo" },
];

const GROUPS: { group: TaxGroup; title: string; hint: string }[] = [
  {
    group: "project_kind",
    title: "Tipos de workspace",
    hint: "Estructural, docencia, investigación…",
  },
  { group: "resource_kind", title: "Tipos de ubicación", hint: "Carpeta, repo, paper…" },
  { group: "entity_kind", title: "Tipos de contacto", hint: "Persona, empresa, revista…" },
  { group: "log_kind", title: "Tipos de bitácora", hint: "Nota, hito, hallazgo…" },
  { group: "doc_type", title: "Tipos de documento", hint: "Factura, boleta, honorarios…" },
  { group: "currency", title: "Monedas", hint: "CLP, UF, USD…" },
  { group: "priority", title: "Prioridades", hint: "" },
  { group: "health", title: "Salud del workspace", hint: "" },
];

const LOCKED_GROUPS: { group: TaxGroup; title: string }[] = [
  { group: "project_status", title: "Estados de workspace" },
  { group: "entry_status", title: "Estados de cobro" },
  { group: "task_status", title: "Estados de tarea" },
  { group: "resource_state", title: "Estados de ubicación" },
  { group: "direction", title: "Ingreso / Egreso" },
  { group: "quote_status", title: "Estados de presupuesto" },
  { group: "commitment_status", title: "Estados de compromiso" },
];

/**
 * Una entrada del vocabulario editable.
 *
 * El `value` —el nombre con el que la fila viaja por la base— ya no se muestra.
 * Era una columna monoespaciada con "invoiced 🔒" al lado de "Facturado": un
 * detalle de implementación puesto en la pantalla de alguien que solo quería
 * renombrar una etiqueta. Se sigue generando solo a partir del rótulo (ver
 * `createTaxonomy`), y las filas fijas se marcan con un candado y basta.
 */
function TaxRowItem({ row, editableValue }: { row: TaxRow; editableValue: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-line py-2.5 last:border-0">
      <Form action={updateTaxonomy} className="flex flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={row.id} />

        <input name="label" defaultValue={row.label} className={cx(inputClass, "min-w-32 flex-1")} />

        {!editableValue && (
          <span className="shrink-0 text-[13px] text-faint" title="Su significado es fijo">
            🔒
          </span>
        )}

        <Select name="color" defaultValue={row.color || "neutral"} options={TONES} className="w-32" />
        <input
          name="position"
          defaultValue={row.position}
          className={cx(inputClass, "w-16 text-center")}
          title="Orden"
        />

        {editableValue && (
          <label
            className="flex items-center gap-1.5 text-[13px] text-muted"
            title="Ocultar de los selectores"
          >
            <input type="checkbox" name="inactive" defaultChecked={!row.active} />
            oculto
          </label>
        )}

        <button type="submit" className={btn("subtle", "sm")}>
          Guardar
        </button>
      </Form>

      {editableValue && (
        <Form action={deleteTaxonomy} confirm={`¿Eliminar "${row.label}"?`}>
          <input type="hidden" name="id" value={row.id} />
          <button
            type="submit"
            aria-label={`Eliminar ${row.label}`}
            className="grid h-9 w-9 place-items-center rounded-full text-[13px] text-faint transition-colors hover:bg-bad/15 hover:text-bad"
          >
            ✕
          </button>
        </Form>
      )}
    </li>
  );
}

/** Un encabezado plegado que se lee como una fila hasta que lo abres. */
function Section({
  title,
  hint,
  badge,
  children,
}: {
  title: string;
  hint?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group mb-px overflow-hidden bg-row first:rounded-t-2xl last:rounded-b-2xl">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold leading-tight">{title}</span>
          {hint && <span className="mt-1 block truncate text-[13px] text-faint">{hint}</span>}
        </span>
        {badge}
        <span className="text-[17px] text-faint transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

/** Una fila que no se pliega: título, explicación corta y un control. */
function Plain({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-px bg-row px-4 py-4 first:rounded-t-2xl last:rounded-b-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold leading-tight">{title}</h3>
          {hint && <p className="mt-1 text-[13px] leading-relaxed text-faint">{hint}</p>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}

/** El botón que borra los ejemplos. Pide confirmación y dice cuántos son. */
function DemoRow() {
  const count = useDemoCount();
  const [busy, setBusy] = useState(false);

  if (count === 0) return null;

  async function wipe() {
    if (!confirm(`¿Borrar las ${count} filas de ejemplo? Lo que hayas escrito tú no se toca.`)) {
      return;
    }
    setBusy(true);
    await deleteDemoData();
    setBusy(false);
  }

  return (
    <Plain
      title="Datos de ejemplo"
      hint={`${count} filas sembradas para que la app no abriera en blanco: dos encargos con su bitácora, sus cobros y sus presupuestos. Se borran de una vez y no vuelven.`}
    >
      <button type="button" onClick={wipe} disabled={busy} className={btn("danger", "sm")}>
        {busy ? "Borrando…" : "Borrar ejemplos"}
      </button>
    </Plain>
  );
}

export default function SettingsPage() {
  const cfg = useConfig();
  const s = cfg.settings;

  return (
    <>
      <Title>Configuración</Title>
      <PageHeader
        title="Configuración"
        subtitle="Tu vocabulario y los números que la app usa para decidir qué mostrarte."
      />

      <div data-tour="settings-start" className="mb-6 overflow-hidden rounded-2xl bg-bg">
        <Plain
          title="Tema"
          hint="Automático sigue al sistema y cambia solo al anochecer, si tu teléfono lo hace. La elección es de este dispositivo."
        >
          <ThemePicker />
        </Plain>

        <Plain title="Guía de la app" hint="Los ocho pasos del primer ingreso, otra vez.">
          <button type="button" onClick={() => startTour()} className={btn("subtle", "sm")}>
            Ver la guía
          </button>
        </Plain>

        <DemoRow />
      </div>

      {/* Todo esto estaba abierto a la vez: veinte campos numéricos seguidos de
          quince tablas de vocabulario. Plegado, la pantalla abre como una lista
          corta de nombres — que es todo lo que hace falta para encontrar el que
          venías a buscar. */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-bg">
        <Section title="Números" hint="Umbrales, impuestos y valores por defecto.">
          <Form action={saveSettings} className="grid gap-3.5 sm:grid-cols-2">
            <input type="hidden" name="id" value={s.id} />

            <Field label="Enfriándose" hint="días sin bitácora para avisarte">
              <input name="cold_days" defaultValue={s.cold_days} className={inputClass} />
            </Field>
            <Field label="Horizonte" hint="días que muestra Hoy">
              <input name="horizon_days" defaultValue={s.horizon_days} className={inputClass} />
            </Field>
            <Field label="Ritmo: mínimo" hint="días antes de declarar franja peak">
              <input
                name="rhythm_min_sample"
                defaultValue={s.rhythm_min_sample}
                className={inputClass}
              />
            </Field>
            <Field label="Ritmo: ventana" hint="días que promedia">
              <input
                name="rhythm_window_days"
                defaultValue={s.rhythm_window_days}
                className={inputClass}
              />
            </Field>
            <Field label="Grilla de rutinas" hint="días visibles">
              <input
                name="routine_grid_days"
                defaultValue={s.routine_grid_days}
                className={inputClass}
              />
            </Field>
            {/* Impuestos: nada de esto es una constante del código. La misma
                app sirve con IVA, VAT, GST o IGV porque el nombre, la tasa, el
                período y si el gasto da crédito son de la cuenta. */}
            <Field label="Nombre del impuesto" hint="IVA, VAT, GST, IGV…">
              <input name="tax_label" defaultValue={s.tax_label} className={inputClass} />
            </Field>
            <Field label="Tasa del impuesto" hint="0.19 = 19%. Solo es el valor por defecto">
              <input name="tax_rate" defaultValue={s.tax_rate} className={inputClass} />
            </Field>
            <Field label="Nombre de la retención" hint="Retención, IRPF, ISR, TDS…">
              <input
                name="withholding_label"
                defaultValue={s.withholding_label}
                className={inputClass}
              />
            </Field>
            <Field label="Tasa de retención" hint="0.145 = 14,5%">
              <input
                name="withholding_rate"
                defaultValue={s.withholding_rate}
                className={inputClass}
              />
            </Field>
            <Field label="Cada cuánto se declara">
              <Select
                name="tax_period"
                defaultValue={s.tax_period}
                options={[
                  { value: "monthly", label: "Cada mes" },
                  { value: "bimonthly", label: "Cada dos meses" },
                  { value: "quarterly", label: "Cada trimestre" },
                ]}
              />
            </Field>
            <Field label="Qué fecha cuenta" hint="cuándo entra un movimiento al período">
              <Select
                name="tax_basis"
                defaultValue={s.tax_basis}
                options={[
                  { value: "document", label: "La del documento" },
                  { value: "payment", label: "La del pago (régimen de caja)" },
                ]}
              />
            </Field>
            <label className="flex items-start gap-2 text-[15px] text-muted sm:col-span-2">
              <input
                type="checkbox"
                name="tax_on_expenses"
                defaultChecked={s.tax_on_expenses}
                className="mt-1"
              />
              <span>
                El impuesto que pago en mis gastos se descuenta del que cobro
                <span className="block text-[13px] text-faint">
                  Así funcionan el IVA, el VAT y el GST. El «sales tax» de Estados Unidos no: ahí
                  el cierre solo suma lo cobrado.
                </span>
              </span>
            </label>
            <Field label="Moneda base" hint="en la que se congela y se suma todo">
              <Select
                name="default_currency"
                defaultValue={s.default_currency}
                options={cfg.options("currency")}
              />
            </Field>

            <Field label="Capacidad semanal" hint="horas de trabajo, el techo del calendario">
              <input
                name="capacity_hours_week"
                defaultValue={s.capacity_hours_week}
                className={inputClass}
              />
            </Field>
            <Field label="Horizonte del calendario" hint="semanas que mira el buscador de huecos">
              <input
                name="capacity_horizon_weeks"
                defaultValue={s.capacity_horizon_weeks}
                className={inputClass}
              />
            </Field>
            <Field label="Gastos generales" hint="0.15 = 15% del costo directo">
              <input
                name="quote_overhead_pct"
                defaultValue={s.quote_overhead_pct}
                className={inputClass}
              />
            </Field>
            <Field label="Utilidades" hint="0.10 = 10% del costo directo">
              <input
                name="quote_profit_pct"
                defaultValue={s.quote_profit_pct}
                className={inputClass}
              />
            </Field>
            <Field label="Validez del presupuesto" hint="días">
              <input
                name="quote_validity_days"
                defaultValue={s.quote_validity_days}
                className={inputClass}
              />
            </Field>
            <Field label="Prefijo de numeración" hint="P → P-2026-001">
              <input name="quote_prefix" defaultValue={s.quote_prefix} className={inputClass} />
            </Field>

            <Field label="Resumen diario: hora">
              <input name="digest_hour" defaultValue={s.digest_hour} className={inputClass} />
            </Field>
            <Field label="Resumen diario: minuto">
              <input name="digest_minute" defaultValue={s.digest_minute} className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-[15px] text-muted sm:col-span-2">
              <input type="checkbox" name="digest_enabled" defaultChecked={s.digest_enabled} />
              Enviar resumen diario
            </label>

            {/* Va dentro del MISMO formulario a propósito: saveSettings escribe la
                fila entera, así que un segundo formulario aparte borraría todo lo
                que no llevara puesto. */}
            <div className="col-span-full mt-2 border-t border-line pt-4">
              <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
                Tus credenciales
              </h3>
              <p className="mb-4 text-[13px] text-faint">
                El encabezado de cada presupuesto. Se escribe una vez.
              </p>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Nombre">
                  <input name="issuer_name" defaultValue={s.issuer_name} className={inputClass} />
                </Field>
                <Field label="Título / cargo" hint="lo que va bajo tu nombre">
                  <input name="issuer_role" defaultValue={s.issuer_role} className={inputClass} />
                </Field>
                <Field label="RUT">
                  <input name="issuer_tax_id" defaultValue={s.issuer_tax_id} className={inputClass} />
                </Field>
                <Field label="Correo">
                  <input name="issuer_email" defaultValue={s.issuer_email} className={inputClass} />
                </Field>
                <Field label="Teléfono">
                  <input name="issuer_phone" defaultValue={s.issuer_phone} className={inputClass} />
                </Field>
                <Field label="Sitio web">
                  <input name="issuer_web" defaultValue={s.issuer_web} className={inputClass} />
                </Field>
                <Field label="Dirección" className="sm:col-span-2">
                  <input
                    name="issuer_address"
                    defaultValue={s.issuer_address}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>

            <button type="submit" className={`${btn("primary")} sm:col-span-2`}>
              Guardar
            </button>
          </Form>

          <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-faint">
            El resumen diario puede llegar hasta un cuarto de hora después de la hora elegida.
          </p>
        </Section>
      </div>

      <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-faint">
        Tu vocabulario
      </h2>
      <div className="mb-8 overflow-hidden rounded-2xl bg-bg">
        {GROUPS.map(({ group, title, hint }) => (
          <Section
            key={group}
            title={title}
            hint={hint || undefined}
            badge={<Badge>{cfg.all(group).length}</Badge>}
          >
            <ul>
              {cfg.all(group).map((row) => (
                <TaxRowItem key={row.id} row={row} editableValue />
              ))}
            </ul>

            <Form
              action={createTaxonomy}
              reset
              className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4"
            >
              <input type="hidden" name="group" value={group} />
              <input
                name="label"
                required
                placeholder="Nuevo…"
                className={cx(inputClass, "min-w-32 flex-1")}
              />
              <Select name="color" defaultValue="neutral" options={TONES} className="w-32" />
              <button type="submit" className={btn("subtle")}>
                Agregar
              </button>
            </Form>
          </Section>
        ))}
      </div>

      <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-faint">
        Estados fijos
      </h2>
      <p className="mb-3 px-1 text-[15px] leading-relaxed text-muted">
        Puedes cambiarles el nombre y el color. Lo que no cambia es lo que significan: “Por cobrar”
        suma lo facturado y lo comprometido, y el margen resta egresos a ingresos.
      </p>

      <div className="overflow-hidden rounded-2xl bg-bg">
        {LOCKED_GROUPS.map(({ group, title }) => (
          <Section key={group} title={title} badge={<Badge>fijo</Badge>}>
            <ul>
              {cfg.all(group).map((row) => (
                <TaxRowItem key={row.id} row={row} editableValue={false} />
              ))}
            </ul>
          </Section>
        ))}
      </div>

    </>
  );
}
