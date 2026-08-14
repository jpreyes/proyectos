import { cx } from "./ui";
import { fmtHours, isoWeekNumber, weekSpanLabel, type WeekLoad } from "@/lib/capacity";

/**
 * La carga de las próximas semanas, una fila por semana.
 *
 * Es una grilla y no un calendario mensual porque la pregunta que responde es
 * "¿cuánto me queda libre?", no "¿qué día es". Una cuadrícula de días obliga a
 * sumar mentalmente lo que aquí ya está sumado.
 *
 * La barra se pinta contra la capacidad, no contra el máximo de la ventana:
 * el punto es ver el techo, y una escala relativa haría que una semana tranquila
 * se viera llena solo porque las demás lo están menos.
 */
export function WeekGrid({
  weeks,
  load,
  capacity,
  highlight,
  extraHours = 0,
}: {
  weeks: string[];
  load: Map<string, WeekLoad>;
  capacity: number;
  /** Semanas del calce que se está proponiendo. */
  highlight?: Set<string>;
  /** Horas del calce, dibujadas encima de lo ya comprometido. */
  extraHours?: number;
}) {
  const cap = capacity > 0 ? capacity : 1;

  return (
    <ul className="space-y-1">
      {weeks.map((week) => {
        const row = load.get(week);
        const used = row?.total || 0;
        const marked = highlight?.has(week) || false;
        const added = marked ? extraHours : 0;
        const total = used + added;

        const over = total > cap + 1e-9;
        const usedPct = Math.min(100, (used / cap) * 100);
        const addedPct = Math.min(100 - usedPct, (added / cap) * 100);

        const detail = row?.parts.length
          ? row.parts.map((p) => `${p.label}: ${fmtHours(p.hours)}`).join("\n")
          : "Sin nada comprometido";

        return (
          <li
            key={week}
            className={cx(
              "flex items-center gap-2 rounded px-1.5 py-1",
              marked && "bg-accent/10 ring-1 ring-accent/30"
            )}
            title={detail}
          >
            <span className="w-8 shrink-0 text-right font-mono text-[10px] text-faint">
              S{isoWeekNumber(week)}
            </span>
            <span className="w-28 shrink-0 text-[11px] text-muted">{weekSpanLabel(week)}</span>

            <span className="relative flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-panel2">
              <span
                className={cx("h-full", over ? "bg-bad/70" : "bg-line2")}
                style={{ width: `${usedPct}%` }}
              />
              {added > 0 && (
                <span
                  className={cx("h-full", over ? "bg-bad" : "bg-accent/80")}
                  style={{ width: `${addedPct}%` }}
                />
              )}
            </span>

            <span
              className={cx(
                "w-16 shrink-0 text-right text-[11px] tabular-nums",
                over ? "text-bad" : total > 0 ? "text-muted" : "text-faint"
              )}
            >
              {fmtHours(total)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
