// PocketBase stores dates as UTC ("2026-08-09 00:00:00.000Z"). Date-only fields
// land on midnight UTC, so they MUST be formatted in UTC — rendering them in
// America/Santiago (UTC-4) would shift every one of them to the previous day.
// Pinning the zone also keeps server and client output identical, which avoids
// hydration mismatches.

const ZONE = "UTC";

export function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value: string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("es-CL", {
    timeZone: ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateShort(value: string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("es-CL", { timeZone: ZONE, day: "2-digit", month: "2-digit" });
}

export function fmtMonth(value: string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("es-CL", { timeZone: ZONE, month: "short", year: "2-digit" });
}

/** Value for <input type="date">. */
export function inputDate(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? d.toISOString().slice(0, 10) : "";
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Calendar days from today. Negative = in the past. */
export function daysUntil(value: string | null | undefined): number | null {
  const d = toDate(value);
  if (!d) return null;
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const now = new Date();
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / 86_400_000);
}

export function isOverdue(value: string | null | undefined): boolean {
  const n = daysUntil(value);
  return n !== null && n < 0;
}

/** "hoy", "ayer", "en 3 días", "hace 12 días", "hace 2 meses" */
export function fmtRelative(value: string | null | undefined): string {
  const n = daysUntil(value);
  if (n === null) return "—";
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  if (n === -1) return "ayer";

  const abs = Math.abs(n);
  const past = n < 0;
  let unit: string;
  if (abs < 30) unit = `${abs} día${abs === 1 ? "" : "s"}`;
  else if (abs < 365) {
    const m = Math.round(abs / 30);
    unit = `${m} mes${m === 1 ? "" : "es"}`;
  } else {
    const y = Math.round((abs / 365) * 10) / 10;
    unit = `${y} año${y === 1 ? "" : "s"}`;
  }
  return past ? `hace ${unit}` : `en ${unit}`;
}

/** "2026-08" bucket key, used by the cash-flow chart. */
export function monthKey(value: string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last `count` month keys ending with the current month. */
export function recentMonths(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-CL", {
    timeZone: ZONE,
    month: "short",
  });
}
