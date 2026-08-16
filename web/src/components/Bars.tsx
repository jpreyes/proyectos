import { monthLabel } from "@/lib/dates";
import { formatMoneyShort } from "@/lib/money";

/**
 * Monthly cash flow. Deliberately a plain pair of bars — no library, no
 * animation, no tooltips to hunt for. The shape should be readable in the first
 * second of looking at it.
 */
export function Bars({
  months,
  income,
  expense,
}: {
  months: string[];
  income: Record<string, number>;
  expense: Record<string, number>;
}) {
  const max = Math.max(
    1,
    ...months.map((m) => Math.max(income[m] || 0, expense[m] || 0))
  );

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 132 }}>
        {months.map((m) => {
          const inc = income[m] || 0;
          const exp = expense[m] || 0;
          return (
            <div key={m} className="flex min-w-0 flex-1 flex-col justify-end gap-1">
              <div className="flex items-end justify-center gap-0.5" style={{ height: 116 }}>
                <div
                  className="w-1/2 rounded-t-sm bg-ok/70"
                  style={{ height: `${(inc / max) * 100}%` }}
                  title={`Ingresos ${monthLabel(m)}: ${formatMoneyShort(inc)}`}
                />
                <div
                  className="w-1/2 rounded-t-sm bg-line2"
                  style={{ height: `${(exp / max) * 100}%` }}
                  title={`Egresos ${monthLabel(m)}: ${formatMoneyShort(exp)}`}
                />
              </div>
              <span className="truncate text-center text-[11px] text-faint">{monthLabel(m)}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ok/70" /> Ingresos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line2" /> Egresos
        </span>
        <span className="ml-auto text-faint">Máximo: {formatMoneyShort(max)}</span>
      </div>
    </div>
  );
}
