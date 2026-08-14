import Link from "next/link";
import { notFound } from "next/navigation";
import type { Deliverable, Quote, QuoteItem } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { getConfig } from "@/lib/config";
import { formatAmount } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Presupuesto" };

/**
 * El documento que se manda al cliente.
 *
 * Sin portada, por pedido explícito: quien recibe esto quiere ver el número en
 * los primeros diez segundos, no una carátula. La hoja es blanca aunque el
 * resto de la app sea oscura — se imprime, o se guarda como PDF desde el
 * diálogo del navegador, y en ambos casos el fondo importa.
 */
export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pb = await requirePB();
  const cfg = await getConfig();
  const s = cfg.settings;

  let quote: Quote;
  try {
    quote = await pb.collection("quotes").getOne<Quote>(id, { expand: "client" });
  } catch {
    notFound();
  }
  if (quote.deleted) notFound();

  const [items, deliverables] = await Promise.all([
    pb
      .collection("quote_items")
      .getFullList<QuoteItem>({ filter: pb.filter("quote = {:q}", { q: id }), sort: "position" }),
    pb
      .collection("deliverables")
      .getFullList<Deliverable>({ filter: pb.filter("quote = {:q}", { q: id }), sort: "position" }),
  ]);

  const currency = quote.currency || "CLP";
  const client = quote.expand?.client;

  // El plazo total que se promete: el entregable más lejano manda.
  const maxLead = deliverables.reduce((m, d) => Math.max(m, d.lead_days || 0), 0);

  const contact = [s.issuer_email, s.issuer_phone, s.issuer_web].filter(Boolean).join(" · ");

  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4">
        <Link href={`/presupuestos/${id}`} className="text-[13px] text-neutral-700 hover:underline">
          ← Volver al presupuesto
        </Link>
        <PrintButton />
      </div>

      {/* Los márgenes en milímetros son para el papel. En un teléfono se comen
          media pantalla, así que en pantalla chica el relleno es normal y los
          milímetros vuelven recién en sm. Al imprimir manda @page, no esto. */}
      <article className="sheet mx-auto max-w-[210mm] px-5 py-7 shadow-lg sm:px-[16mm] sm:py-[14mm] print:max-w-none print:px-0 print:py-0 print:shadow-none">
        {/* ------------------------------------------------------- encabezado */}
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-300 pb-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">{s.issuer_name || "—"}</h1>
            {s.issuer_role && <p className="text-[13px] text-neutral-600">{s.issuer_role}</p>}
            {s.issuer_tax_id && (
              <p className="text-[12px] text-neutral-600">RUT {s.issuer_tax_id}</p>
            )}
            {s.issuer_address && (
              <p className="text-[12px] text-neutral-600">{s.issuer_address}</p>
            )}
            {contact && <p className="text-[12px] text-neutral-600">{contact}</p>}
          </div>

          <div className="text-right text-[12px]">
            <p className="text-[15px] font-semibold tracking-tight">PRESUPUESTO</p>
            <p className="font-mono text-[13px]">{quote.number || "s/n"}</p>
            <p className="text-neutral-600">Fecha: {fmtDate(quote.date)}</p>
            {quote.valid_until && (
              <p className="text-neutral-600">Válido hasta: {fmtDate(quote.valid_until)}</p>
            )}
          </div>
        </header>

        {/* ---------------------------------------------------------- cliente */}
        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Cliente
            </h2>
            <p className="text-[13px] font-medium">{client?.name || "—"}</p>
            {client?.tax_id && <p className="text-[12px] text-neutral-600">RUT {client.tax_id}</p>}
            {client?.address && <p className="text-[12px] text-neutral-600">{client.address}</p>}
            {client?.email && <p className="text-[12px] text-neutral-600">{client.email}</p>}
          </div>

          <div>
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Servicio
            </h2>
            <p className="text-[13px] font-medium">{quote.title}</p>
            {quote.kind && (
              <p className="text-[12px] text-neutral-600">{cfg.label("project_kind", quote.kind)}</p>
            )}
          </div>
        </section>

        {quote.description && (
          <section className="mt-5">
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Descripción
            </h2>
            <p className="whitespace-pre-line text-[13px] leading-relaxed">{quote.description}</p>
          </section>
        )}

        {/* ------------------------------------------------------------ ítems */}
        <section className="mt-6">
          {/* Una tabla de seis columnas no cabe en 390 px. Se desplaza dentro de
              su propia caja en vez de romper el ancho de la página; al imprimir
              vuelve a ser una tabla normal. */}
          <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[27rem] border-collapse text-[12px] print:min-w-0">
            <thead>
              <tr className="border-y border-neutral-400 text-left">
                <th className="w-6 py-1.5 font-semibold">#</th>
                <th className="py-1.5 font-semibold">Descripción</th>
                <th className="w-12 py-1.5 font-semibold">Unidad</th>
                <th className="w-14 py-1.5 text-right font-semibold">Cant.</th>
                <th className="w-24 py-1.5 text-right font-semibold">P. unitario</th>
                <th className="w-24 py-1.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className="border-b border-neutral-200 align-top">
                  <td className="py-1.5 text-neutral-500">{i + 1}</td>
                  <td className="py-1.5 pr-3">{item.description}</td>
                  <td className="py-1.5 text-neutral-600">{item.unit}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {(item.qty || 0).toLocaleString("es-CL", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatAmount(item.unit_price || 0, currency)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatAmount(item.total || 0, currency)}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-neutral-400">
                    Sin ítems.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          <dl className="mt-3 ml-auto w-full space-y-1 text-[12px] sm:max-w-[74mm]">
            <Row label="Costo directo" value={formatAmount(quote.direct_total || 0, currency)} />
            <Row
              label={`Gastos generales (${Math.round((quote.overhead_pct || 0) * 100)}%)`}
              value={formatAmount(quote.overhead_amount || 0, currency)}
            />
            <Row
              label={`Utilidades (${Math.round((quote.profit_pct || 0) * 100)}%)`}
              value={formatAmount(quote.profit_amount || 0, currency)}
            />
            <div className="flex justify-between gap-4 border-t border-neutral-400 pt-1.5 text-[14px] font-semibold">
              <dt>Total neto</dt>
              <dd className="tabular-nums">{formatAmount(quote.net_total || 0, currency)}</dd>
            </div>
          </dl>

          {currency !== "CLP" && quote.net_total_clp > 0 && (
            <p className="mt-1 text-right text-[11px] text-neutral-500">
              Equivalente a {formatAmount(quote.net_total_clp, "CLP")} al valor de{" "}
              {currency} {formatAmount(quote.fx_rate || 0, "CLP")}.
            </p>
          )}
        </section>

        {/* ------------------------------------------------------ entregables */}
        {deliverables.length > 0 && (
          <section className="mt-6 break-inside-avoid">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Entregables y plazos
            </h2>
            <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[22rem] border-collapse text-[12px] print:min-w-0">
              <tbody>
                {deliverables.map((d) => (
                  <tr key={d.id} className="border-b border-neutral-200 align-top">
                    <td className="py-1.5 pr-3 font-medium">{d.name}</td>
                    <td className="py-1.5 pr-3 text-neutral-600">{d.detail}</td>
                    <td className="w-28 py-1.5 text-right tabular-nums">
                      {d.lead_days ? `${d.lead_days} días` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {maxLead > 0 && (
              <p className="mt-2 text-[12px]">
                <span className="font-medium">Plazo total de ejecución:</span> {maxLead} días
                corridos contados desde la fecha de inicio acordada.
              </p>
            )}
          </section>
        )}

        {/* ------------------------------------------------------ condiciones */}
        {quote.terms && (
          <section className="mt-6 break-inside-avoid">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Condiciones del servicio
            </h2>
            <p className="whitespace-pre-line text-[12px] leading-relaxed">{quote.terms}</p>
          </section>
        )}

        <footer className="mt-10 break-inside-avoid border-t border-neutral-300 pt-8 text-[12px]">
          <div className="ml-auto w-[70mm] border-t border-neutral-500 pt-1.5 text-center">
            {s.issuer_name || "—"}
            {s.issuer_role && (
              <span className="block text-[11px] text-neutral-600">{s.issuer_role}</span>
            )}
          </div>
        </footer>
      </article>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
