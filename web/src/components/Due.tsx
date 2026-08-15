import { daysUntil, fmtDate, fmtRelative } from "@/lib/dates";
import { cx } from "./ui";

/**
 * A bare date carries almost no felt weight when the horizon is short — the
 * deadline stays abstract until it is suddenly imminent. So a date is never
 * rendered alone here: always date + distance + a urgency bar that fills as
 * the deadline approaches, which is the part that reads pre-attentively.
 */
export function Due({
  date,
  horizon = 30,
  showBar = true,
  className,
}: {
  date: string | null | undefined;
  horizon?: number;
  showBar?: boolean;
  className?: string;
}) {
  const n = daysUntil(date);
  if (n === null) return <span className="text-faint">—</span>;

  const tone =
    n < 0 ? "bad" : n <= 3 ? "bad" : n <= 7 ? "warn" : n <= horizon ? "accent" : "muted";

  const text = {
    bad: "text-bad",
    warn: "text-warn",
    accent: "text-accent",
    muted: "text-muted",
  }[tone];

  const fill = {
    bad: "bg-bad",
    warn: "bg-warn",
    accent: "bg-accent",
    muted: "bg-line2",
  }[tone];

  // 0 days left -> full bar; beyond the horizon -> empty.
  const pct = n < 0 ? 100 : Math.max(0, Math.min(100, ((horizon - n) / horizon) * 100));

  return (
    <span className={cx("inline-flex flex-col gap-1", className)}>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap text-[13px]">
        <span className="tabular-nums">{fmtDate(date)}</span>
        <span className={cx("text-[12px] font-semibold", text)}>{fmtRelative(date)}</span>
      </span>
      {showBar && (
        <span className="block h-1 w-full overflow-hidden rounded-full bg-line">
          <span className={cx("block h-full rounded", fill)} style={{ width: `${pct}%` }} />
        </span>
      )}
    </span>
  );
}
