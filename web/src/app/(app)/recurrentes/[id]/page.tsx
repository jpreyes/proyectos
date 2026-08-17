"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Entry, EntrySeries } from "@/lib/types";
import { deleteSeries, toggleSeriesPaused, updateSeries } from "@/lib/local/actions";
import { useConfig } from "@/lib/local/config";
import { useLedgerLists } from "@/lib/local/lists";
import { useCollection, useRecord } from "@/lib/local/store";
import { day, sortBy } from "@/lib/local/query";
import { nextOccurrence } from "@/lib/local/recurring";
import { CADENCE } from "@/lib/labels";
import { useRouteId } from "@/lib/local/route";
import { formatMoney, homeOf } from "@/lib/money";
import { fmtDate, fmtRelative, todayISO } from "@/lib/dates";
import { Form } from "@/components/form";
import { Badge, btn, Empty, Group, PageHeader, Row } from "@/components/ui";
import { SeriesForm } from "@/components/SeriesForm";
import { Title } from "@/components/Title";

export default function SeriesPage() {
  const id = useRouteId();
  const cfg = useConfig();
  const series = useRecord<EntrySeries>("entry_series", id);
  const entries = useCollection<Entry>("entries");
  const lists = useLedgerLists();

  const occurrences = useMemo(
    () => sortBy(entries.filter((e) => e.series === id), "-date"),
    [entries, id]
  );

  if (!series || series.deleted) {
    return (
      <>
        <Title>Recurrente</Title>
        <PageHeader title="No está" subtitle="Esta recurrencia no existe en esta cuenta." />
        <Link href="/recurrentes" className={btn("subtle")}>
          Volver a Recurrentes
        </Link>
      </>
    );
  }

  const next = series.paused ? "" : nextOccurrence(series);
  const today = todayISO();

  return (
    <>
      <Title>{series.description}</Title>
      <PageHeader
        title={series.description}
        subtitle={[
          CADENCE[series.cadence] || series.cadence,
          formatMoney(
            homeOf({
              amount: series.amount,
              amount_clp: 0,
              fx_rate: series.fx_rate || 0,
              currency: series.currency || "CLP",
            })
          ),
          series.paused ? "en pausa" : next ? `próxima ${fmtDate(next)}` : "sin próximas",
        ].join(" · ")}
        action={
          <Form action={toggleSeriesPaused}>
            <input type="hidden" name="id" value={series.id} />
            <button type="submit" className={btn("subtle", "sm")}>
              {series.paused ? "Reanudar" : "Pausar"}
            </button>
          </Form>
        }
      />

      {/* Las repeticiones antes del formulario: al abrir esto uno viene a mirar
          qué anotó la regla, no a editarla. */}
      <Group title={`Repeticiones · ${occurrences.length}`}>
        {occurrences.length === 0 ? (
          <Empty>
            Todavía ninguna. Se anotan al abrir la app, hasta tres meses hacia adelante.
          </Empty>
        ) : (
          occurrences.slice(0, 24).map((e) => (
            <Row
              key={e.id}
              href={`/finanzas/${e.id}`}
              label={fmtDate(e.date)}
              hint={day(e.date) >= today ? fmtRelative(e.date) : undefined}
              value={
                <span className={e.direction === "income" ? "text-ok" : "text-ink"}>
                  {e.direction === "expense" ? "−" : ""}
                  {formatMoney(homeOf(e))}
                </span>
              }
              badge={
                <Badge tone={cfg.tone("entry_status", e.status)}>
                  {cfg.label("entry_status", e.status)}
                </Badge>
              }
            />
          ))
        )}
      </Group>

      <div className="mt-8">
        <SeriesForm action={updateSeries} series={series} {...lists} />
      </div>

      <Form
        action={deleteSeries}
        confirm={`¿Eliminar la recurrencia "${series.description}"? Las repeticiones futuras que todavía no ocurrieron se van con ella; lo ya cobrado o pagado se queda.`}
        className="mt-10 border-t border-line pt-5"
      >
        <input type="hidden" name="id" value={series.id} />
        <button type="submit" className={btn("danger", "sm")}>
          Eliminar recurrencia
        </button>
      </Form>
    </>
  );
}
