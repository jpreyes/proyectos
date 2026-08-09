import type { Daily } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { saveDaily } from "@/lib/actions";
import { getConfig } from "@/lib/config";
import { ALIVE } from "@/lib/filters";
import { fmtDate, todayISO } from "@/lib/dates";
import { btn, Card, cx, Empty, Field, inputClass, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Ritmo · Proyectos" };

/** "23:45" -> 1425. Returns null for anything unparseable. */
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

export default async function RhythmPage() {
  const pb = await requirePB();
  const cfg = await getConfig();
  const WINDOW_DAYS = cfg.settings.rhythm_window_days;
  const MIN_SAMPLE = cfg.settings.rhythm_min_sample;

  const rows = await pb
    .collection("daily")
    .getList<Daily>(1, WINDOW_DAYS, { filter: ALIVE, sort: "-date" });
  const days = rows.items;

  const today = todayISO();
  const todayRow = days.find((d) => d.date.slice(0, 10) === today);

  /* ------------------------------------------------------------ energy --- */
  const slots = [
    { key: "morning", label: "Mañana", avg: mean(days.map((d) => d.energy_morning)) },
    { key: "afternoon", label: "Tarde", avg: mean(days.map((d) => d.energy_afternoon)) },
    { key: "evening", label: "Noche", avg: mean(days.map((d) => d.energy_evening)) },
  ];
  const rated = days.filter(
    (d) => d.energy_morning > 0 || d.energy_afternoon > 0 || d.energy_evening > 0
  ).length;
  const best = slots.filter((s) => s.avg !== null).sort((a, b) => (b.avg || 0) - (a.avg || 0))[0];

  /* ------------------------------------------------------------- sleep --- */
  const durations: number[] = [];
  const midpoints: number[] = [];
  for (const d of days) {
    const s = toMinutes(d.sleep_start);
    const e = toMinutes(d.sleep_end);
    if (s === null || e === null) continue;
    const dur = e >= s ? e - s : e + 1440 - s; // crosses midnight
    if (dur <= 0 || dur > 16 * 60) continue;
    durations.push(dur);
    midpoints.push((s + dur / 2) % 1440);
  }
  const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const avgMidpoint = midpoints.length ? midpoints.reduce((a, b) => a + b, 0) / midpoints.length : null;

  const enough = rated >= MIN_SAMPLE;

  return (
    <>
      <PageHeader
        title="Ritmo"
        subtitle={`${days.length} día${days.length === 1 ? "" : "s"} registrado${days.length === 1 ? "" : "s"}`}
      />

      <p className="mb-5 max-w-2xl rounded-lg border border-line bg-panel/50 px-4 py-3 text-[13px] leading-relaxed text-muted">
        El cronotipo varía mucho entre personas, y el rango es lo bastante amplio como para que
        el consejo estándar de “levántate temprano y haz lo difícil primero” esté{" "}
        <span className="text-ink">al revés</span> para buena parte de la gente. Esto no lo
        decide una regla general: lo decide tu propio registro.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Franja peak"
          value={enough && best?.avg ? best.label : "—"}
          tone={enough ? "accent" : "neutral"}
          hint={enough ? `${best?.avg?.toFixed(1)} de 5` : `faltan ${MIN_SAMPLE - rated} días`}
        />
        <Stat
          label="Sueño promedio"
          value={avgDuration ? `${Math.floor(avgDuration / 60)}h ${Math.round(avgDuration % 60)}m` : "—"}
        />
        <Stat
          label="Punto medio de sueño"
          value={avgMidpoint !== null ? fmtMinutes(avgMidpoint) : "—"}
          hint="proxy de cronotipo"
        />
        <Stat
          label="Foco promedio"
          value={mean(days.map((d) => d.focus_hours))?.toFixed(1) ?? "—"}
          hint="horas al día"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card title={todayRow ? "Editar hoy" : "Registrar hoy"}>
          <form action={saveDaily} className="grid gap-3 sm:grid-cols-2">
            {todayRow && <input type="hidden" name="id" value={todayRow.id} />}
            <Field label="Fecha" className="sm:col-span-2">
              <input
                type="date"
                name="date"
                defaultValue={todayRow?.date.slice(0, 10) || today}
                className={inputClass}
              />
            </Field>
            <Field label="Me dormí" hint="HH:MM">
              <input
                name="sleep_start"
                placeholder="01:30"
                defaultValue={todayRow?.sleep_start}
                className={inputClass}
              />
            </Field>
            <Field label="Desperté" hint="HH:MM">
              <input
                name="sleep_end"
                placeholder="09:15"
                defaultValue={todayRow?.sleep_end}
                className={inputClass}
              />
            </Field>

            <Field label="Energía mañana" hint="1 arrastrándome · 5 lúcido">
              <input
                type="number"
                min={0}
                max={5}
                name="energy_morning"
                defaultValue={todayRow?.energy_morning || ""}
                className={inputClass}
              />
            </Field>
            <Field label="Energía tarde">
              <input
                type="number"
                min={0}
                max={5}
                name="energy_afternoon"
                defaultValue={todayRow?.energy_afternoon || ""}
                className={inputClass}
              />
            </Field>
            <Field label="Energía noche">
              <input
                type="number"
                min={0}
                max={5}
                name="energy_evening"
                defaultValue={todayRow?.energy_evening || ""}
                className={inputClass}
              />
            </Field>
            <Field label="Horas de foco real">
              <input
                name="focus_hours"
                inputMode="decimal"
                defaultValue={todayRow?.focus_hours || ""}
                className={inputClass}
              />
            </Field>

            <Field label="Notas" className="sm:col-span-2">
              <textarea
                name="notes"
                rows={2}
                defaultValue={todayRow?.notes}
                className={`${inputClass} resize-y`}
              />
            </Field>

            <div className="sm:col-span-2">
              <button type="submit" className={`${btn("primary")} w-full`}>
                Guardar
              </button>
            </div>
          </form>
        </Card>

        <div className="space-y-5">
          <Card title="Energía por franja" subtitle={`Promedio de ${rated} día${rated === 1 ? "" : "s"}`}>
            {rated === 0 ? (
              <Empty>Sin datos de energía todavía.</Empty>
            ) : (
              <div className="space-y-2.5">
                {slots.map((s) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-[13px] text-muted">{s.label}</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded bg-line">
                      <span
                        className={cx(
                          "block h-full rounded",
                          enough && s.key === best?.key ? "bg-accent" : "bg-line2"
                        )}
                        style={{ width: `${((s.avg || 0) / 5) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right text-[12px] tabular-nums text-muted">
                      {s.avg ? s.avg.toFixed(1) : "—"}
                    </span>
                  </div>
                ))}
                {!enough && (
                  <p className="pt-1 text-[11px] text-faint">
                    Con menos de {MIN_SAMPLE} días esto no dice nada todavía.
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card title="Últimos días">
            {days.length === 0 ? (
              <Empty>Sin registros.</Empty>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full min-w-[26rem] text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                      <th className="py-1.5 pr-3 font-medium">Día</th>
                      <th className="py-1.5 pr-3 font-medium">Sueño</th>
                      <th className="py-1.5 pr-3 font-medium">M / T / N</th>
                      <th className="py-1.5 text-right font-medium">Foco</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {days.slice(0, 14).map((d) => (
                      <tr key={d.id}>
                        <td className="py-1.5 pr-3 text-muted">{fmtDate(d.date)}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-faint">
                          {d.sleep_start && d.sleep_end ? `${d.sleep_start}–${d.sleep_end}` : "—"}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {[d.energy_morning, d.energy_afternoon, d.energy_evening]
                            .map((v) => v || "·")
                            .join(" / ")}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-muted">
                          {d.focus_hours || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
