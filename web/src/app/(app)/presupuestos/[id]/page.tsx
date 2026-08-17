"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Deliverable, Entity, Project, Quote, QuoteItem } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { useCollection, useRecord } from "@/lib/local/store";
import { useRouteId } from "@/lib/local/route";
import { sortBy } from "@/lib/local/query";
import { proposeSlotForQuote, storedSlot } from "@/lib/local/schedule";
import { formatAmount } from "@/lib/money";
import { inputDate } from "@/lib/dates";
import { fmtHours, weekStart } from "@/lib/capacity";
import {
  addDeliverable,
  addQuoteItem,
  approveQuote,
  clearQuotePlan,
  deleteDeliverable,
  deleteQuote,
  deleteQuoteItem,
  setQuotePlan,
  setQuoteStatus,
  updateDeliverable,
  updateQuote,
  updateQuoteItem,
} from "@/lib/local/actions";
import { Form } from "@/components/form";
import { Badge, btn, Card, cx, Empty, Field, inputClass, PageHeader, Select } from "@/components/ui";
import { WeekGrid } from "@/components/WeekGrid";
import { Title } from "@/components/Title";

/** Cuántas semanas de contexto se muestran alrededor del calce propuesto. */
const GRID_WEEKS = 18;

export default function QuotePage() {
  const id = useRouteId();
  const cfg = useConfig();

  const quote = useRecord<Quote>("quotes", id);
  const allItems = useCollection<QuoteItem>("quote_items");
  const allDeliverables = useCollection<Deliverable>("deliverables");
  const entities = useCollection<Entity>("entities");
  const projects = useCollection<Project>("projects");
  const commitments = useCollection("commitments");
  const events = useCollection("calendar_events");

  const view = useMemo(() => {
    const items = sortBy(
      allItems.filter((it) => it.quote === id),
      "position"
    );
    const deliverables = sortBy(
      allDeliverables.filter((d) => d.quote === id),
      "position"
    );

    // El calce fijado manda; si no hay, se propone uno contra el calendario de
    // hoy. Nada de esto se guarda al mirar la página: fijarlo es un acto aparte.
    const fixed = quote ? storedSlot(quote) : null;
    const proposed = quote
      ? proposeSlotForQuote(cfg.settings, quote)
      : { slot: null, window: null };
    const slot = fixed ?? proposed.slot;
    const window = proposed.window;

    const gridWeeks = (() => {
      if (!window) return [];
      if (!slot) return window.weeks.slice(0, GRID_WEEKS);
      const firstIdx = Math.max(0, window.weeks.indexOf(weekStart(slot.start)));
      return window.weeks.slice(firstIdx, firstIdx + Math.max(GRID_WEEKS, slot.weeks.length + 3));
    })();

    return {
      items,
      deliverables,
      fixed,
      slot,
      window,
      gridWeeks,
      highlight: new Set(slot?.weeks || []),
      clients: sortBy(entities, "name").map((e) => ({ value: e.id, label: e.name })),
    };
    // commitments y events entran para que el calce se recalcule cuando cambia
    // la carga del calendario, aunque la ventana los lea del store.
  }, [id, quote, allItems, allDeliverables, entities, cfg.settings, commitments, events]);

  if (!quote || quote.deleted) {
    return (
      <>
        <Title>Presupuesto</Title>
        <PageHeader title="No está" subtitle="Este presupuesto no existe en esta cuenta." />
        <Link href="/presupuestos" className={btn("subtle")}>
          Volver a Presupuestos
        </Link>
      </>
    );
  }

  const { slot, fixed, window } = view;
  const client = entities.find((e) => e.id === quote.client);
  const project = projects.find((p) => p.id === quote.project);
  const isApproved = quote.status === "approved";
  const capacity = window?.capacity ?? cfg.settings.capacity_hours_week;

  return (
    <>
      <Title>{quote.title || "Presupuesto"}</Title>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-faint">{quote.number || "s/n"}</span>
            {quote.title}
            <Badge tone={cfg.tone("quote_status", quote.status)}>
              {cfg.label("quote_status", quote.status)}
            </Badge>
          </span>
        }
        subtitle={client?.name || "sin cliente"}
        // Acá había un «Volver» al listado. Se fue cuando el volver pasó a estar
        // en el layout (`components/BackLink.tsx`): dos controles con la misma
        // palabra y distinto destino en la misma pantalla es peor que ninguno.
        action={
          <Link href={`/presupuestos/${id}/imprimir`} className={btn("subtle", "sm")}>
            Imprimir
          </Link>
        }
      />

      {/* ------------------------------------------------------------ estado */}
      <Card
        className="mb-5"
        title="Estado"
        subtitle={
          isApproved
            ? "Ya está aprobado: el proyecto, la reserva de tiempo y el ingreso proyectado existen."
            : "Aprobar crea el proyecto, reserva las horas en el calendario y deja el ingreso proyectado."
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {!isApproved && (
            <Form action={approveQuote}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className={btn("primary", "sm")}>
                Aprobar
              </button>
            </Form>
          )}

          {(["draft", "pending", "rejected"] as const)
            .filter((s) => s !== quote.status)
            .map((s) => (
              <Form key={s} action={setQuoteStatus}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="previous" value={quote.status} />
                <input type="hidden" name="status" value={s} />
                <button type="submit" className={btn(s === "rejected" ? "danger" : "subtle", "sm")}>
                  {s === "pending"
                    ? "Marcar enviado"
                    : s === "draft"
                      ? "Volver a borrador"
                      : "Rechazado"}
                </button>
              </Form>
            ))}

          <span className="ml-auto" />

          <Form action={deleteQuote} confirm={`¿Eliminar el presupuesto "${quote.title}"?`}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className={btn("ghost", "sm")}>
              Eliminar
            </button>
          </Form>
        </div>

        {isApproved && project && (
          <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">
            Proyecto:{" "}
            <Link href={`/w/${quote.project}`} className="text-accent hover:underline">
              {project.name}
            </Link>
            . Si lo rechazas ahora, se anula la reserva de tiempo y el ingreso proyectado; el
            proyecto queda.
          </p>
        )}
      </Card>

      {/* -------------------------------------------------------------- datos */}
      <Card className="mb-5" title="Datos">
        <Form action={updateQuote} key={quote.updated} className="grid gap-3.5 sm:grid-cols-2">
          <input type="hidden" name="id" value={id} />

          <Field label="Número">
            <input name="number" defaultValue={quote.number} className={inputClass} />
          </Field>
          <Field label="Título">
            <input name="title" required defaultValue={quote.title} className={inputClass} />
          </Field>

          <Field label="Cliente">
            <Select name="client" defaultValue={quote.client} placeholder="—" options={view.clients} />
          </Field>
          <Field label="Tipo">
            <Select
              name="kind"
              defaultValue={quote.kind}
              placeholder="—"
              options={cfg.options("project_kind")}
            />
          </Field>
          <Field label="Fecha">
            <input
              type="date"
              name="date"
              defaultValue={inputDate(quote.date)}
              className={inputClass}
            />
          </Field>
          <Field label="Válido hasta">
            <input
              type="date"
              name="valid_until"
              defaultValue={inputDate(quote.valid_until)}
              className={inputClass}
            />
          </Field>

          <Field label="Descripción" className="col-span-full">
            <textarea
              name="description"
              rows={3}
              defaultValue={quote.description}
              placeholder="Qué se hace y por qué, en un párrafo."
              className={inputClass}
            />
          </Field>

          <Field label="Moneda">
            <Select name="currency" defaultValue={quote.currency} options={cfg.options("currency")} />
          </Field>
          <Field label="Valor en CLP" hint="1 si presupuestas en pesos">
            <input name="fx_rate" defaultValue={quote.fx_rate || 1} className={inputClass} />
          </Field>
          <Field label="Gastos generales" hint="% del costo directo">
            <input
              name="overhead_pct"
              defaultValue={Math.round((quote.overhead_pct || 0) * 10000) / 100}
              className={inputClass}
            />
          </Field>
          <Field label="Utilidades" hint="% del costo directo">
            <input
              name="profit_pct"
              defaultValue={Math.round((quote.profit_pct || 0) * 10000) / 100}
              className={inputClass}
            />
          </Field>

          <Field label="Horas de trabajo" hint="tangible, sin reuniones ni espera">
            <input name="work_hours" defaultValue={quote.work_hours || ""} className={inputClass} />
          </Field>
          <Field label="Ritmo máximo" hint="horas por semana para esto">
            <input
              name="max_hours_week"
              defaultValue={quote.max_hours_week || ""}
              className={inputClass}
            />
          </Field>
          <Field label="No antes de" className="sm:col-span-2">
            <input
              type="date"
              name="earliest_start"
              defaultValue={inputDate(quote.earliest_start)}
              className={inputClass}
            />
          </Field>

          <Field label="Condiciones del servicio" className="col-span-full">
            <textarea
              name="terms"
              rows={5}
              defaultValue={quote.terms}
              placeholder={
                "Forma de pago, qué incluye y qué no, vigencia de los valores, " +
                "quién entrega los antecedentes…"
              }
              className={inputClass}
            />
          </Field>

          <Field label="Notas internas" className="col-span-full" hint="no salen en el documento">
            <textarea name="notes" rows={2} defaultValue={quote.notes} className={inputClass} />
          </Field>

          <button type="submit" className={`${btn("primary")} sm:col-span-2`}>
            Guardar
          </button>
        </Form>
      </Card>

      {/* -------------------------------------------------------------- ítems */}
      <Card
        className="mb-5"
        title="Presupuesto"
        subtitle={`${view.items.length} ítem${view.items.length === 1 ? "" : "es"}`}
      >
        <div className="hidden grid-cols-[1fr_4rem_5rem_7rem_6rem_auto] gap-2 border-b border-line pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted sm:grid">
          <span>Descripción</span>
          <span>Unidad</span>
          <span className="text-right">Cantidad</span>
          <span className="text-right">P. unitario</span>
          <span className="text-right">Total</span>
          <span />
        </div>

        <ul className="divide-y divide-line">
          {view.items.map((item) => (
            <li key={item.id} className="group flex items-center gap-2 py-1.5">
              <Form
                action={updateQuoteItem}
                key={item.updated}
                className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-[1fr_4rem_5rem_7rem_6rem_auto]"
              >
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="quote" value={id} />
                <input type="hidden" name="position" value={item.position} />

                <input
                  name="description"
                  defaultValue={item.description}
                  className={cx(inputClass, "col-span-2 sm:col-span-1")}
                />
                <input name="unit" defaultValue={item.unit} className={inputClass} placeholder="gl" />
                <input name="qty" defaultValue={item.qty} className={cx(inputClass, "text-right")} />
                <input
                  name="unit_price"
                  defaultValue={item.unit_price}
                  className={cx(inputClass, "text-right")}
                />
                <span className="flex items-center justify-end px-1 text-[13px] tabular-nums">
                  {formatAmount(item.total || 0, quote.currency || "CLP")}
                </span>
                <button type="submit" className={btn("subtle", "sm")}>
                  ✓
                </button>
              </Form>

              {/* Estaba solo en hover: inalcanzable en una pantalla táctil. */}
              <Form action={deleteQuoteItem}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="quote" value={id} />
                <button
                  type="submit"
                  aria-label={`Eliminar ítem: ${item.description}`}
                  className="grid h-9 w-9 place-items-center rounded-full text-[13px] text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                >
                  ✕
                </button>
              </Form>
            </li>
          ))}
        </ul>

        <Form
          action={addQuoteItem}
          reset
          className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_4rem_5rem_7rem_6rem_auto]"
        >
          <input type="hidden" name="quote" value={id} />
          <input
            name="description"
            required
            placeholder="Nuevo ítem…"
            className={cx(inputClass, "col-span-2 sm:col-span-1")}
          />
          <input name="unit" placeholder="gl" className={inputClass} />
          <input name="qty" placeholder="1" className={cx(inputClass, "text-right")} />
          <input name="unit_price" placeholder="0" className={cx(inputClass, "text-right")} />
          <span className="hidden sm:block" />
          <button type="submit" className={btn("subtle", "sm")}>
            Agregar
          </button>
        </Form>

        {/* ------------------------------------------------------- totales -- */}
        <dl className="mt-4 ml-auto max-w-sm space-y-1 border-t border-line pt-3 text-[13px]">
          <Total label="Costo directo" value={quote.direct_total} currency={quote.currency} />
          <Total
            label={`Gastos generales (${Math.round((quote.overhead_pct || 0) * 100)}%)`}
            value={quote.overhead_amount}
            currency={quote.currency}
          />
          <Total
            label={`Utilidades (${Math.round((quote.profit_pct || 0) * 100)}%)`}
            value={quote.profit_amount}
            currency={quote.currency}
          />
          <Total label="Total neto" value={quote.net_total} currency={quote.currency} strong />
        </dl>
      </Card>

      {/* ------------------------------------------------------- programación */}
      <Card
        className="mb-5"
        title="Cuándo cabe"
        subtitle={
          quote.work_hours
            ? `${fmtHours(quote.work_hours)} de trabajo · techo ${fmtHours(capacity)} por semana`
            : "Pon las horas de trabajo en Datos y acá aparece dónde calzan."
        }
      >
        {!quote.work_hours || !slot || !window ? (
          <Empty>Sin horas declaradas no hay nada que buscar.</Empty>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="text-[13px]">
                <span className="text-muted">Calce: </span>
                <span className="font-medium tabular-nums">
                  {slot.start} → {slot.end}
                </span>
                <span className="text-muted">
                  {" "}
                  · {slot.weeks.length} semana{slot.weeks.length === 1 ? "" : "s"} a{" "}
                  {fmtHours(slot.hoursPerWeek)} por semana
                </span>
              </div>

              {fixed ? (
                <Badge tone="accent">fijado</Badge>
              ) : slot.fits ? (
                <Badge tone="ok">propuesto</Badge>
              ) : (
                <Badge tone="bad">no cabe</Badge>
              )}

              <span className="ml-auto flex gap-2">
                {fixed ? (
                  <Form action={clearQuotePlan}>
                    <input type="hidden" name="id" value={id} />
                    <button type="submit" className={btn("ghost", "sm")}>
                      Soltar el calce
                    </button>
                  </Form>
                ) : (
                  <Form action={setQuotePlan}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="plan_start" value={slot.start} />
                    <input type="hidden" name="plan_end" value={slot.end} />
                    <input type="hidden" name="plan_hours_week" value={slot.hoursPerWeek} />
                    <button type="submit" className={btn("subtle", "sm")}>
                      Fijar este calce
                    </button>
                  </Form>
                )}
              </span>
            </div>

            {!slot.fits && (
              <p className="mb-3 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-[13px] text-bad">
                No hay ningún tramo en el horizonte donde esto quepa sin pasar tu capacidad semanal.
                Si lo apruebas igual, queda reservado lo antes posible y marcado como tentativo — que
                es más honesto que dejarlo sin agendar.
              </p>
            )}

            <WeekGrid
              weeks={view.gridWeeks}
              load={window.load}
              capacity={window.capacity}
              highlight={view.highlight}
              extraHours={slot.hoursPerWeek}
            />

            <p className="mt-4 border-t border-line pt-3 text-[13px] leading-relaxed text-faint">
              Gris: lo que ya tienes comprometido, incluidos los eventos de tus calendarios.
              Verde: este trabajo. Rojo: la semana se pasa del techo.
            </p>
          </>
        )}
      </Card>

      {/* -------------------------------------------------------- entregables */}
      <Card
        title="Entregables"
        subtitle="Qué recibe el cliente y en cuánto tiempo desde que parte el trabajo."
      >
        <ul className="divide-y divide-line">
          {view.deliverables.map((d) => (
            <li key={d.id} className="group flex items-center gap-2 py-1.5">
              <Form
                action={updateDeliverable}
                key={d.updated}
                className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_1.5fr_6rem_auto]"
              >
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="quote" value={id} />
                <input type="hidden" name="position" value={d.position} />
                <input name="name" defaultValue={d.name} className={inputClass} />
                <input
                  name="detail"
                  defaultValue={d.detail}
                  placeholder="formato, alcance…"
                  className={inputClass}
                />
                <input
                  name="lead_days"
                  defaultValue={d.lead_days || ""}
                  placeholder="días"
                  className={cx(inputClass, "text-right")}
                />
                <button type="submit" className={btn("subtle", "sm")}>
                  ✓
                </button>
              </Form>

              {/* Estaba solo en hover: inalcanzable en una pantalla táctil. */}
              <Form action={deleteDeliverable}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="quote" value={id} />
                <button
                  type="submit"
                  aria-label={`Eliminar entregable: ${d.name}`}
                  className="grid h-9 w-9 place-items-center rounded-full text-[13px] text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                >
                  ✕
                </button>
              </Form>
            </li>
          ))}
        </ul>

        <Form
          action={addDeliverable}
          reset
          className="mt-3 grid grid-cols-1 gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1.5fr_6rem_auto]"
        >
          <input type="hidden" name="quote" value={id} />
          <input name="name" required placeholder="Informe estructural…" className={inputClass} />
          <input name="detail" placeholder="PDF firmado, 20 págs." className={inputClass} />
          <input name="lead_days" placeholder="días" className={cx(inputClass, "text-right")} />
          <button type="submit" className={btn("subtle", "sm")}>
            Agregar
          </button>
        </Form>
      </Card>
    </>
  );
}

function Total({
  label,
  value,
  currency,
  strong,
}: {
  label: string;
  value: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex justify-between gap-4",
        strong && "border-t border-line pt-1.5 text-[15px] font-semibold"
      )}
    >
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd className="tabular-nums">{formatAmount(value || 0, currency || "CLP")}</dd>
    </div>
  );
}
