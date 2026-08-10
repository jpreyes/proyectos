import { getConfig, type TaxGroup } from "@/lib/config";
import { createTaxonomy, deleteTaxonomy, saveSettings, updateTaxonomy } from "@/lib/actions";
import { Badge, btn, Card, cx, Field, inputClass, PageHeader, Select } from "@/components/ui";

export const metadata = { title: "Configuración · Proyectos" };

const TONES = [
  { value: "neutral", label: "Neutro" },
  { value: "accent", label: "Azul" },
  { value: "ok", label: "Verde" },
  { value: "warn", label: "Ámbar" },
  { value: "bad", label: "Rojo" },
];

const GROUPS: { group: TaxGroup; title: string; hint: string }[] = [
  { group: "project_kind", title: "Tipos de workspace", hint: "Estructural, docencia, investigación…" },
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
];

function Row({
  row,
  editableValue,
}: {
  row: import("@/lib/config").TaxRow;
  editableValue: boolean;
}) {
  return (
    <li className="group flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-0">
      <form action={updateTaxonomy} className="flex flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={row.id} />

        <input
          name="label"
          defaultValue={row.label}
          className={cx(inputClass, "min-w-32 flex-1")}
        />

        {editableValue ? (
          <input
            name="value"
            defaultValue={row.value}
            className={cx(inputClass, "w-32 font-mono text-[11px]")}
            title="Valor interno"
          />
        ) : (
          <span
            className="w-32 shrink-0 font-mono text-[11px] text-faint"
            title="Valor fijo: el código calcula sobre él"
          >
            {row.value} 🔒
          </span>
        )}

        <Select name="color" defaultValue={row.color || "neutral"} options={TONES} className="w-28" />
        <input
          name="position"
          defaultValue={row.position}
          className={cx(inputClass, "w-14 text-center")}
          title="Orden"
        />

        {editableValue && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted" title="Ocultar de los selectores">
            <input type="checkbox" name="inactive" defaultChecked={!row.active} />
            oculto
          </label>
        )}

        <button type="submit" className={btn("subtle", "sm")}>
          Guardar
        </button>
      </form>

      {editableValue && (
        <form action={deleteTaxonomy}>
          <input type="hidden" name="id" value={row.id} />
          <button
            type="submit"
            className="px-1 text-[11px] text-faint opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"
          >
            ✕
          </button>
        </form>
      )}
    </li>
  );
}

export default async function SettingsPage() {
  const cfg = await getConfig();
  const s = cfg.settings;

  return (
    <>
      <PageHeader
        title="Configuración"
        subtitle="Tu vocabulario y los números que la app usa para decidir qué mostrarte."
      />

      <Card
        className="mb-6"
        title="Números"
        subtitle="Antes estaban fijos en el código."
      >
        <form action={saveSettings} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <Field label="IVA" hint="0.19 = 19%">
            <input name="iva_rate" defaultValue={s.iva_rate} className={inputClass} />
          </Field>
          <Field label="Retención honorarios" hint="0.145 = 14,5%">
            <input
              name="withholding_rate"
              defaultValue={s.withholding_rate}
              className={inputClass}
            />
          </Field>
          <Field label="Moneda por defecto">
            <Select
              name="default_currency"
              defaultValue={s.default_currency}
              options={cfg.options("currency")}
            />
          </Field>

          <Field label="Digest: hora">
            <input name="digest_hour" defaultValue={s.digest_hour} className={inputClass} />
          </Field>
          <Field label="Digest: minuto">
            <input name="digest_minute" defaultValue={s.digest_minute} className={inputClass} />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-1.5 text-[13px] text-muted">
              <input type="checkbox" name="digest_enabled" defaultChecked={s.digest_enabled} />
              Enviar resumen diario
            </label>
          </div>
          <div className="flex items-end">
            <button type="submit" className={`${btn("primary")} w-full`}>
              Guardar
            </button>
          </div>
        </form>

        <p className="mt-3 border-t border-line pt-3 text-[11px] text-faint">
          La hora es tuya y aplica de inmediato. El servidor revisa cada 15 minutos, así
          que el correo puede llegar hasta un cuarto de hora después de la hora elegida.
        </p>
      </Card>

      <h2 className="mb-3 text-[13px] font-semibold tracking-wide">Tu vocabulario</h2>

      <div className="grid gap-5 lg:grid-cols-2">
        {GROUPS.map(({ group, title, hint }) => (
          <Card key={group} title={title} subtitle={hint || undefined}>
            <ul>
              {cfg.all(group).map((row) => (
                <Row key={row.id} row={row} editableValue />
              ))}
            </ul>

            <form
              action={createTaxonomy}
              className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3"
            >
              <input type="hidden" name="group" value={group} />
              <input
                name="label"
                required
                placeholder="Nuevo…"
                className={cx(inputClass, "min-w-32 flex-1")}
              />
              <Select name="color" defaultValue="neutral" options={TONES} className="w-28" />
              <button type="submit" className={btn("subtle", "sm")}>
                Agregar
              </button>
            </form>
          </Card>
        ))}
      </div>

      <h2 className="mb-2 mt-8 text-[13px] font-semibold tracking-wide">Estados fijos</h2>
      <p className="mb-3 max-w-2xl text-[13px] leading-relaxed text-muted">
        Estos no son vocabulario: el código <span className="text-ink">calcula</span> sobre
        ellos. “Por cobrar” es literalmente <code className="text-[12px]">facturado</code> más{" "}
        <code className="text-[12px]">comprometido</code>, y el margen depende de ingreso
        contra egreso. Puedes cambiarles el nombre y el color; el valor interno queda fijo para
        que los números sigan significando lo mismo.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        {LOCKED_GROUPS.map(({ group, title }) => (
          <Card
            key={group}
            title={
              <span className="flex items-center gap-2">
                {title}
                <Badge>fijo</Badge>
              </span>
            }
          >
            <ul>
              {cfg.all(group).map((row) => (
                <Row key={row.id} row={row} editableValue={false} />
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
