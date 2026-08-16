import type { Currency, Entry } from "./types";

/**
 * La moneda base de la cuenta.
 *
 * Vive en una variable de módulo, no en un parámetro, y es a propósito: estas
 * funciones se llaman desde treinta lugares que no tienen —ni deberían tener—
 * acceso a la configuración. `AppShell` la fija al arrancar, con lo que venga
 * de `settings.default_currency`, y todo lo demás sigue llamando igual.
 *
 * El valor por defecto es CLP porque es de donde viene la app; cambiarlo en
 * Configuración basta para que los números salgan en euros, dólares o soles.
 * Lo que NO cambia es cuánto vale un movimiento viejo: eso quedó congelado al
 * escribirlo (`amount_clp`, que a estas alturas significa "monto en la moneda
 * base" y conserva el nombre porque renombrar una columna de la base a cambio
 * de nada es la clase de riesgo que no paga).
 */
let HOME: Currency = "CLP";

/**
 * El idioma con el que se escriben los números — no la moneda.
 *
 * Son cosas distintas y confundirlas es lo que produce "174.000 CLP" donde
 * debería decir "$174.000": la moneda la pone la cuenta, el formato lo pone
 * quien lee. Un chileno mirando euros quiere "1.234,50 €"; un estadounidense
 * mirando los mismos euros quiere "€1,234.50". Se toma del navegador, que ya
 * sabe la respuesta, y en el servidor —donde no hay navegador y tampoco datos
 * que pintar— cae en español.
 */
function pickLocale(): string {
  const raw = typeof navigator !== "undefined" ? navigator.language : "";
  // "en-US@posix" es lo que entrega un sistema con LANG=en_US.POSIX, y el
  // sufijo hace que `Intl` rechace la etiqueta entera. Quitarlo conserva el
  // idioma real de quien lee, que es mejor que caer al español por un detalle
  // del sistema operativo.
  const tag = String(raw || "").split("@")[0];

  // La única validación que sirve es construir el formateador: preguntar por
  // `supportedLocalesOf` deja pasar etiquetas que después revientan. Y esto se
  // ejecuta al cargar el módulo, así que una excepción acá no rompe una cifra
  // — deja la app en blanco, sin explicación, para todo el que tenga un idioma
  // raro configurado.
  if (tag) {
    try {
      new Intl.NumberFormat(tag);
      return tag;
    } catch {
      // etiqueta que este navegador no entiende
    }
  }
  return "es";
}

const LOCALE = pickLocale();
/** Monedas sin decimales: mostrar "$1.234,00" pesos sería inventar precisión. */
const WHOLE = new Set(["CLP", "JPY", "KRW", "PYG", "ISK", "VND", "COP"]);

let fmtMoney = build(HOME);
const fmtDecimal = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPlain = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

function build(currency: Currency) {
  const whole = WHOLE.has(currency);
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      maximumFractionDigits: whole ? 0 : 2,
      minimumFractionDigits: whole ? 0 : 2,
    });
  } catch {
    // Una moneda que Intl no conoce (UF, o un código inventado) no puede tumbar
    // la pantalla: se cae a un formato simple con el código delante.
    return null;
  }
}

export function setHomeCurrency(currency: Currency | undefined | null): void {
  const next = (currency || "CLP").toUpperCase();
  if (next === HOME) return;
  HOME = next;
  fmtMoney = build(next);
}

export function homeCurrency(): Currency {
  return HOME;
}

export function formatMoney(n: number | null | undefined): string {
  const v = WHOLE.has(HOME) ? Math.round(n || 0) : n || 0;
  return fmtMoney ? fmtMoney.format(v) : `${HOME} ${fmtPlain.format(v)}`;
}

/** Compact form for dashboard tiles: $1,2 M / $840 k. */
export function formatMoneyShort(n: number | null | undefined): string {
  const v = Math.round(n || 0);
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  // El símbolo se saca del propio formateador en vez de escribir "$": en euros
  // va detrás, en libras delante, y adivinarlo es como se producen los "$14 €".
  const symbol = fmtMoney ? fmtMoney.format(0).replace(/[\d.,\s]/g, "") : HOME + " ";
  const head = fmtMoney && fmtMoney.format(1).indexOf(symbol) === 0;
  const body =
    abs >= 1_000_000
      ? `${fmtDecimal.format(abs / 1_000_000).replace(",00", "")} M`
      : abs >= 1_000
        ? `${fmtPlain.format(Math.round(abs / 1_000))} k`
        : fmtPlain.format(abs);
  return head ? `${sign}${symbol}${body}` : `${sign}${body} ${symbol}`;
}

/** Un monto en SU moneda, que puede no ser la de la cuenta. */
export function formatAmount(n: number, currency: Currency): string {
  if (currency === HOME) return formatMoney(n);
  if (!currency) return fmtDecimal.format(n);
  return `${currency} ${fmtDecimal.format(n)}`;
}

/**
 * Valor de un movimiento en la moneda base.
 *
 * `amount_clp` es el valor congelado al escribirlo: es lo que usan todos los
 * reportes, para que la historia no se mueva cuando cambia el tipo de cambio de
 * hoy. Si falta, se reconstruye con el `fx_rate` que se guardó junto al
 * movimiento; y si el movimiento ya estaba en la moneda base, es su propio
 * monto.
 */
export function homeOf(e: Pick<Entry, "amount" | "amount_clp" | "fx_rate" | "currency">): number {
  if (e.amount_clp) return e.amount_clp;
  if (e.fx_rate) return e.amount * e.fx_rate;
  return e.currency === HOME ? e.amount : 0;
}

/** El mismo valor con signo: los egresos restan. */
export function signedHome(
  e: Pick<Entry, "amount" | "amount_clp" | "fx_rate" | "currency" | "direction">
): number {
  const v = homeOf(e);
  return e.direction === "expense" ? -v : v;
}

/**
 * Separa un total en neto e impuesto.
 *
 * Sirve para cualquier impuesto sobre las ventas incluido en el precio —IVA,
 * VAT, GST, IGV— porque la aritmética es la misma y la tasa entra por
 * parámetro. El redondeo va al entero: las monedas con decimales pierden como
 * mucho un centavo, y a cambio el neto más el impuesto siempre suman el total.
 */
export function splitTax(total: number, rate = 0.19) {
  const net = total / (1 + rate);
  return { net: Math.round(net), tax: Math.round(total - net) };
}
