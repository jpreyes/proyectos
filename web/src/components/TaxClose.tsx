"use client";

/**
 * El cierre del período de impuestos.
 *
 * Es la pantalla que se abre una vez al mes —o al trimestre— para saber cuánto
 * hay que declarar, y por eso lo único que no puede hacer es **inventar**. Tres
 * reglas la gobiernan:
 *
 *   1. **Solo suma lo que está anotado.** Si un movimiento no trae impuesto
 *      escrito, aporta cero. Y como eso puede significar tanto "está exento"
 *      como "no lo anoté", el cierre dice cuántos son y cuánto valen. Un total
 *      que se calla lo que le falta es peor que no tener total.
 *   2. **No mezcla monedas.** Cada moneda se suma por separado; el total en
 *      moneda base se arma con el tipo de cambio congelado de cada movimiento,
 *      nunca con el de hoy.
 *   3. **No dice "esto es lo que debes pagar".** Dice lo que registraste. Lo
 *      que se declara depende de reglas que esta app no conoce —exenciones,
 *      remanentes, prorrateos— y presentarlo como cifra final invitaría a
 *      copiarla sin mirar.
 *
 * Sirve en cualquier país porque la mecánica es la misma en todos: un impuesto
 * que cobras sobre tus ventas, otro tanto que pagaste en tus compras y que en
 * casi todas partes —no en el "sales tax" estadounidense— se descuenta del
 * primero, y una retención que quien te paga adelanta a cuenta de tu renta.
 * Cómo se llame cada cosa, con qué tasa, cada cuánto se declara y si el gasto
 * da crédito son ajustes de la cuenta, no constantes del código.
 */

import { useMemo, useState } from "react";
import type { Entry } from "@/lib/types";
import type { Settings } from "@/lib/config";
import { formatMoney, formatAmount, homeOf } from "@/lib/money";
import { btn, Card, cx } from "./ui";

/* --------------------------------------------------------------- período -- */

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const LENGTH: Record<string, number> = { monthly: 1, bimonthly: 2, quarterly: 3 };

export interface Period {
  /** Primer día, "YYYY-MM-DD". */
  from: string;
  /** Último día, inclusive. */
  to: string;
  label: string;
}

/** El período que contiene a `day`, desplazado `shift` períodos. */
export function periodOf(day: string, kind: string, shift = 0): Period {
  const size = LENGTH[kind] || 1;
  const [y, m] = day.split("-").map(Number);

  // El primer mes del período: los de dos o tres meses se anclan al inicio del
  // año, que es como los definen todas las administraciones que los usan.
  const index = Math.floor((m - 1) / size) + shift;
  const year = y + Math.floor(index / (12 / size));
  const first = ((index % (12 / size)) + (12 / size)) % (12 / size) * size;

  const from = new Date(Date.UTC(year, first, 1));
  const to = new Date(Date.UTC(year, first + size, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const label =
    size === 1
      ? `${MONTHS[first]} ${year}`
      : `${MONTHS[first]}–${MONTHS[first + size - 1]} ${year}`;

  return { from: iso(from), to: iso(to), label };
}

/* ----------------------------------------------------------------- suma --- */

interface Bucket {
  currency: string;
  taxOut: number;
  taxIn: number;
  withheldFromMe: number;
  withheldByMe: number;
  docsOut: number;
  docsIn: number;
}

interface Close {
  period: Period;
  buckets: Bucket[];
  /** Totales en moneda base, con el cambio congelado de cada movimiento. */
  home: { taxOut: number; taxIn: number; withheldFromMe: number; withheldByMe: number };
  /** Movimientos del período sin impuesto anotado: lo que el total no ve. */
  silent: { count: number; amount: number };
  entries: number;
}

/** La fecha con la que un movimiento entra al período. */
function dateFor(e: Entry, basis: string): string {
  if (basis === "payment") return String(e.paid_date || "").slice(0, 10);
  return String(e.date || "").slice(0, 10);
}

function build(entries: Entry[], settings: Settings, period: Period): Close {
  const basis = settings.tax_basis || "document";
  const home = settings.default_currency || "CLP";

  const byCurrency = new Map<string, Bucket>();
  const totals = { taxOut: 0, taxIn: 0, withheldFromMe: 0, withheldByMe: 0 };
  let silentCount = 0;
  let silentAmount = 0;
  let used = 0;

  for (const e of entries) {
    if (e.status === "cancelled") continue;
    // Con criterio de caja, lo que no se ha pagado todavía no existe para el
    // impuesto: incluirlo adelantaría una deuda que aún no nace.
    if (basis === "payment" && e.status !== "paid") continue;

    const day = dateFor(e, basis);
    if (!day || day < period.from || day > period.to) continue;

    used++;
    const currency = e.currency || home;
    const rate = e.fx_rate || (currency === home ? 1 : 0);

    const bucket =
      byCurrency.get(currency) ||
      { currency, taxOut: 0, taxIn: 0, withheldFromMe: 0, withheldByMe: 0, docsOut: 0, docsIn: 0 };

    const tax = Number(e.tax) || 0;
    const withholding = Number(e.withholding) || 0;

    if (e.direction === "income") {
      bucket.taxOut += tax;
      bucket.withheldFromMe += withholding;
      if (tax) bucket.docsOut++;
      totals.taxOut += tax * rate;
      totals.withheldFromMe += withholding * rate;
    } else {
      bucket.taxIn += tax;
      bucket.withheldByMe += withholding;
      if (tax) bucket.docsIn++;
      totals.taxIn += tax * rate;
      totals.withheldByMe += withholding * rate;
    }

    if (!tax) {
      silentCount++;
      silentAmount += homeOf(e);
    }

    byCurrency.set(currency, bucket);
  }

  return {
    period,
    buckets: [...byCurrency.values()].sort((a, b) => (a.currency === home ? -1 : a.currency.localeCompare(b.currency))),
    home: totals,
    silent: { count: silentCount, amount: silentAmount },
    entries: used,
  };
}

/* ------------------------------------------------------------ la tarjeta -- */

export function TaxClose({ entries, settings }: { entries: Entry[]; settings: Settings }) {
  const [shift, setShift] = useState(0);

  const close = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return build(entries, settings, periodOf(today, settings.tax_period || "monthly", shift));
  }, [entries, settings, shift]);

  const taxLabel = settings.tax_label || "IVA";
  const withholdingLabel = settings.withholding_label || "Retención";
  const credit = settings.tax_on_expenses !== false;
  const balance = close.home.taxOut - (credit ? close.home.taxIn : 0);
  const multi = close.buckets.length > 1;

  return (
    <Card
      className="mb-6"
      title={`Cierre de ${taxLabel}`}
      subtitle={
        settings.tax_basis === "payment"
          ? "Por fecha de pago, y solo lo efectivamente pagado."
          : "Por fecha del documento."
      }
      action={
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShift((s) => s - 1)}
            aria-label="Período anterior"
            className={btn("ghost", "sm")}
          >
            ‹
          </button>
          <button type="button" onClick={() => setShift(0)} className={btn("ghost", "sm")}>
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setShift((s) => s + 1)}
            aria-label="Período siguiente"
            className={btn("ghost", "sm")}
          >
            ›
          </button>
        </span>
      }
    >
      <p className="mb-3 text-[17px] font-semibold first-letter:uppercase">{close.period.label}</p>

      <dl className="space-y-1.5 text-[15px]">
        <Line
          term={`${taxLabel} cobrado`}
          hint={`en ${close.buckets.reduce((s, b) => s + b.docsOut, 0)} documento(s) de venta`}
          value={formatMoney(close.home.taxOut)}
        />
        {credit && (
          <Line
            term={`${taxLabel} pagado en gastos`}
            hint={`en ${close.buckets.reduce((s, b) => s + b.docsIn, 0)} documento(s) de compra`}
            value={close.home.taxIn ? "−" + formatMoney(close.home.taxIn) : formatMoney(0)}
            tone="muted"
          />
        )}
        <div className="!mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <dt className="text-[15px] font-semibold">
            {balance >= 0 ? "Diferencia a pagar" : "Saldo a favor"}
          </dt>
          <dd
            className={cx(
              "text-[20px] font-bold tabular-nums",
              balance > 0 ? "text-warn" : "text-ok"
            )}
          >
            {formatMoney(Math.abs(balance))}
          </dd>
        </div>
      </dl>

      <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[15px]">
        <Line
          term={`${withholdingLabel} que te hicieron`}
          hint="anticipo de tu impuesto a la renta"
          value={formatMoney(close.home.withheldFromMe)}
        />
        {close.home.withheldByMe > 0 && (
          <Line
            term={`${withholdingLabel} que hiciste tú`}
            hint="la retuviste al pagar y la declaras aparte"
            value={formatMoney(close.home.withheldByMe)}
          />
        )}
      </dl>

      {multi && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-faint">
            Por moneda
          </p>
          <ul className="space-y-1 text-[13px] text-muted">
            {close.buckets.map((b) => (
              <li key={b.currency} className="flex justify-between gap-3 tabular-nums">
                <span>{b.currency}</span>
                <span>
                  cobrado {formatAmount(b.taxOut, b.currency)}
                  {credit && ` · pagado ${formatAmount(b.taxIn, b.currency)}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-relaxed text-faint">
            El total de arriba usa el tipo de cambio que quedó guardado con cada movimiento, no el
            de hoy.
          </p>
        </div>
      )}

      {/* Lo que el total NO ve. Va con el mismo peso visual que los números,
          porque es lo que decide si el número sirve. */}
      {close.silent.count > 0 && (
        <p className="mt-4 rounded-xl bg-warn/10 px-3.5 py-3 text-[13px] leading-relaxed text-warn">
          {close.silent.count} de los {close.entries} movimientos del período no tienen{" "}
          {taxLabel} anotado ({formatMoney(close.silent.amount)} en total). Si están exentos, está
          bien; si es que faltó escribirlo, este cierre se queda corto.
        </p>
      )}

      {close.entries === 0 && (
        <p className="mt-4 text-[13px] text-faint">Ningún movimiento en este período.</p>
      )}
    </Card>
  );
}

function Line({
  term,
  hint,
  value,
  tone,
}: {
  term: string;
  hint?: string;
  value: string;
  tone?: "muted";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0">
        <span className={cx("block", tone === "muted" ? "text-muted" : "text-ink")}>{term}</span>
        {hint && <span className="block text-[12px] text-faint">{hint}</span>}
      </dt>
      <dd className={cx("shrink-0 tabular-nums", tone === "muted" ? "text-muted" : "text-ink")}>
        {value}
      </dd>
    </div>
  );
}
