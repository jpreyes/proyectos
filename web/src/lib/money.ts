import type { Currency, Entry } from "./types";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const DECIMAL = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PLAIN = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

export function formatCLP(n: number | null | undefined): string {
  return CLP.format(Math.round(n || 0));
}

/** Compact form for dashboard tiles: $1,2 M / $840 k. */
export function formatCLPShort(n: number | null | undefined): string {
  const v = Math.round(n || 0);
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${DECIMAL.format(abs / 1_000_000).replace(",00", "")} M`;
  if (abs >= 1_000) return `${sign}$${PLAIN.format(Math.round(abs / 1_000))} k`;
  return `${sign}$${PLAIN.format(abs)}`;
}

export function formatAmount(n: number, currency: Currency): string {
  if (currency === "CLP") return formatCLP(n);
  if (currency === "UF") return `UF ${DECIMAL.format(n)}`;
  return `${currency} ${DECIMAL.format(n)}`;
}

/**
 * CLP value of an entry. `amount_clp` is the value frozen at entry time; it is
 * what all reports use so history never shifts when today's UF moves. Falls
 * back to fx_rate, then to the raw amount for CLP entries.
 */
export function clpOf(e: Pick<Entry, "amount" | "amount_clp" | "fx_rate" | "currency">): number {
  if (e.amount_clp) return e.amount_clp;
  if (e.fx_rate) return e.amount * e.fx_rate;
  return e.currency === "CLP" ? e.amount : 0;
}

/** Signed CLP value: expenses count negative. */
export function signedClp(e: Pick<Entry, "amount" | "amount_clp" | "fx_rate" | "currency" | "direction">): number {
  const v = clpOf(e);
  return e.direction === "expense" ? -v : v;
}

/** IVA 19% helper for the entry form. */
export function splitIVA(total: number, rate = 0.19) {
  const net = total / (1 + rate);
  return { net: Math.round(net), tax: Math.round(total - net) };
}
