"use client";

import { useMemo, useState } from "react";
import type { Daily } from "@/lib/types";
import { saveDaily } from "@/lib/local/actions";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { sortBy } from "@/lib/local/query";
import { fmtDate, todayISO } from "@/lib/dates";
import { Form } from "@/components/form";
import { btn, Card, cx, Empty, Field, Group, inputClass, PageHeader, Row, Stat } from "@/components/ui";
import { Title } from "@/components/Title";

/** "23:45" -> 1425. Devuelve null para cualquier cosa impareable. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() || "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function fmtMinutes(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.round(t % 60)).padStart(2, "0")}`;
}

function mean(values: number[]): number | null {
  const v = values.filter((x) => x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export default function RhythmPage() {
  const cfg = useConfig();
  const WINDOW_DAYS = cfg.settings.rhythm_window_days;
  const MIN_SAMPLE = cfg.settings.rhythm_min_sample;

  const all = useCollection<Daily>("daily");
  const today = todayISO();

  /**
   * El día que está abierto en el formulario. Vacío = hoy.
   *
   * La lista de abajo mostraba catorce días y ninguno se podía tocar: para
   * corregir el sueño de anteayer había que escribir su fecha a mano en el
   * campo de arriba y confiar en que la app entendería que es una edición y no
   * un registro nuevo. Ahora se toca el día y el formulario se pone en él.
   */
  const [picked, setPicked] = useState("");

  const view = useMemo(() => {
    const days = sortBy(all, "-date").slice(0, WINDOW_DAYS);

    /* --------------------------------------------------------- energía --- */
    const slots = [
      { key: "morning", label: "Mañana", avg: mean(days.map((d) => d.energy_morning)) },
      { key: "afternoon", label: "Tarde", avg: mean(days.map((d) => d.energy_afternoon)) },
      { key: "evening", label: "Noche", avg: mean(days.map((d) => d.energy_evening)) },
    ];
    const rated = days.filter(
      (d) => d.energy_morning > 0 || d.energy_afternoon > 0 || d.energy_evening > 0
    ).length;
    const best = slots.filter((s) => s.avg !== null).sort((a, b) => (b.avg || 0) - (a.avg || 0))[0];

    /* ----------------------------------------------------------- sueño --- */
    const durations: number[] = [];
    const midpoints: number[] = [];
    for (const d of days) {
      const s = toMinutes(d.sleep_start);
      const e = toMinutes(d.sleep_end);
      if (s === null || e === null) continue;
      const dur = e >= s ? e - s : e + 1440 - s; // cruza la medianoche
      if (dur <= 0 || dur > 16 * 60) continue;
      durations.push(dur);
      midpoints.push((s + dur / 2) % 1440);
    }

    return {
      days,
      slots,
      rated,
      best,
      todayRow: days.find((d) => String(d.date).slice(0, 10) === today),
      avgDuration: durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null,
      avgMidpoint: midpoints.length ? midpoints.reduce((a, b) => a + b, 0) / midpoints.length : null,
      focus: mean(days.map((d) => d.focus_hours)),
    };
  }, [all, WINDOW_DAYS, today]);

  const enough = view.rated >= MIN_SAMPLE;
  const { todayRow } = view;

  const editing = picked
    ? view.days.find((d) => String(d.date).slice(0, 10) === picked)
    : todayRow;
  const editingDate = picked || today;
  const isToday = editingDate === today;

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openDay(date: string) {
    setPicked(date === today ? "" : date);
    setTimeout(() => scrollTo("registro"), 60);
  }

  return (
    <>
      <Title>Ritmo</Title>
      <PageHeader
        title="Ritmo"
        subtitle={`${view.days.length} día${view.days.length === 1 ? "" : "s"} registrado${
          view.days.length === 1 ? "" : "s"
        }`}
      />

      <p className="mb-6 rounded-2xl bg-row px-4 py-4 text-[15px] leading-relaxed text-muted">
        Anota el día y con el tiempo aparece cuándo rindes mejor. Eso no lo decide una regla
        general: lo decide tu propio registro.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3">
        {/* Los cuatro números salen de los mismos registros, así que los cuatro
            llevan a donde están: el de energía al desglose por franja, los de
            sueño y foco a los días que los promedian. */}
        <Stat
          label="Franja peak"
          value={enough && view.best?.avg ? view.best.label : "—"}
          tone={enough ? "accent" : "neutral"}
          hint={enough ? `${view.best?.avg?.toFixed(1)} de 5` : `faltan ${MIN_SAMPLE - view.rated} días`}
          onPress={() => scrollTo("energia")}
        />
        <Stat
          label="Sueño promedio"
          value={
            view.avgDuration
              ? `${Math.floor(view.avgDuration / 60)}h ${Math.round(view.avgDuration % 60)}m`
              : "—"
          }
          hint={`de ${view.days.length} día${view.days.length === 1 ? "" : "s"}`}
          onPress={() => scrollTo("dias")}
        />
        <Stat
          label="Punto medio de sueño"
          value={view.avgMidpoint !== null ? fmtMinutes(view.avgMidpoint) : "—"}
          hint="proxy de cronotipo"
          onPress={() => scrollTo("dias")}
        />
        <Stat
          label="Foco promedio"
          value={view.focus?.toFixed(1) ?? "—"}
          hint="horas al día"
          onPress={() => scrollTo("dias")}
        />
      </div>

      <div className="space-y-6">
        <Card
          id="registro"
          title={
            isToday
              ? todayRow
                ? "Editar hoy"
                : "Registrar hoy"
              : `${editing ? "Editar" : "Registrar"} ${fmtDate(editingDate)}`
          }
          action={
            !isToday && (
              <button type="button" onClick={() => setPicked("")} className={btn("ghost", "sm")}>
                Volver a hoy
              </button>
            )
          }
        >
          <Form
            action={saveDaily}
            // Remontar al cambiar de día: los campos no son controlados, así que
            // sin esto abrir otro día mostraría los valores del anterior.
            key={`${editingDate}-${editing?.updated || "nuevo"}`}
            className="grid gap-3.5 sm:grid-cols-2"
          >
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Fecha" className="sm:col-span-2">
              <input
                type="date"
                name="date"
                defaultValue={editingDate}
                className={inputClass}
              />
            </Field>
            <Field label="Me dormí" hint="HH:MM">
              <input
                name="sleep_start"
                placeholder="01:30"
                defaultValue={editing?.sleep_start}
                className={inputClass}
              />
            </Field>
            <Field label="Desperté" hint="HH:MM">
              <input
                name="sleep_end"
                placeholder="09:15"
                defaultValue={editing?.sleep_end}
                className={inputClass}
              />
            </Field>

            <Field label="Energía mañana" hint="1 arrastrándome · 5 lúcido">
              <input
                type="number"
                min={0}
                max={5}
                name="energy_morning"
                defaultValue={editing?.energy_morning || ""}
                className={inputClass}
              />
            </Field>
            <Field label="Energía tarde">
              <input
                type="number"
                min={0}
                max={5}
                name="energy_afternoon"
                defaultValue={editing?.energy_afternoon || ""}
                className={inputClass}
              />
            </Field>
            <Field label="Energía noche">
              <input
                type="number"
                min={0}
                max={5}
                name="energy_evening"
                defaultValue={editing?.energy_evening || ""}
                className={inputClass}
              />
            </Field>
            <Field label="Horas de foco real">
              <input
                name="focus_hours"
                inputMode="decimal"
                defaultValue={editing?.focus_hours || ""}
                className={inputClass}
              />
            </Field>

            <Field label="Notas" className="sm:col-span-2">
              <textarea
                name="notes"
                rows={2}
                defaultValue={editing?.notes}
                className={`${inputClass} resize-y`}
              />
            </Field>

            <div className="sm:col-span-2">
              <button type="submit" className={`${btn("primary")} w-full`}>
                Guardar
              </button>
            </div>
          </Form>
        </Card>

        <Card
          id="energia"
          title="Energía por franja"
          subtitle={`Promedio de ${view.rated} día${view.rated === 1 ? "" : "s"}`}
        >
          {view.rated === 0 ? (
            <Empty>Sin datos de energía todavía.</Empty>
          ) : (
            <div className="space-y-3">
              {view.slots.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-[15px] text-muted">{s.label}</span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-line">
                    <span
                      className={cx(
                        "block h-full rounded-full",
                        enough && s.key === view.best?.key ? "bg-accent" : "bg-line2"
                      )}
                      style={{ width: `${((s.avg || 0) / 5) * 100}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-[13px] tabular-nums text-muted">
                    {s.avg ? s.avg.toFixed(1) : "—"}
                  </span>
                </div>
              ))}
              {!enough && (
                <p className="pt-1 text-[13px] text-faint">
                  Con menos de {MIN_SAMPLE} días esto no dice nada todavía.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* La tabla de cuatro columnas se fue: en un teléfono se desplazaba de
          lado, y la ventana de sueño más las tres notas caben en una línea. */}
      <div className="mt-6">
        <Group id="dias" title="Últimos días">
          {view.days.length === 0 ? (
            <Empty>Sin registros.</Empty>
          ) : (
            view.days.slice(0, 14).map((d) => (
              <Row
                key={d.id}
                label={fmtDate(d.date)}
                onPress={() => openDay(String(d.date).slice(0, 10))}
                className={
                  String(d.date).slice(0, 10) === editingDate
                    ? "ring-1 ring-inset ring-accent/40"
                    : undefined
                }
                hint={[
                  d.sleep_start && d.sleep_end ? `${d.sleep_start}–${d.sleep_end}` : null,
                  `M/T/N ${[d.energy_morning, d.energy_afternoon, d.energy_evening]
                    .map((v) => v || "·")
                    .join(" / ")}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                value={d.focus_hours ? `${d.focus_hours} h` : "—"}
              />
            ))
          )}
        </Group>
      </div>
    </>
  );
}
