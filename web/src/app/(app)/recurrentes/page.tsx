"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Entity, EntrySeries, Project } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { index, sortBy } from "@/lib/local/query";
import { nextOccurrence, perMonth } from "@/lib/local/recurring";
import { CADENCE } from "@/lib/labels";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { fmtDate, fmtRelative } from "@/lib/dates";
import { Badge, btn, Empty, Group, PageHeader, Row, Stat } from "@/components/ui";
import { Title } from "@/components/Title";

/**
 * Lo que se repite, en un solo lugar.
 *
 * La pregunta que contesta esta pantalla no es "¿cuánto gasté?" —esa es
 * Finanzas— sino "¿con qué estoy comprometido todos los meses?". Por eso los
 * dos números de arriba son promedios mensuales y no totales del año: es lo
 * único que pone en la misma escala el arriendo, el seguro semestral y el
 * dominio que se paga una vez al año.
 */
export default function SeriesListPage() {
  const cfg = useConfig();
  const all = useCollection<EntrySeries>("entry_series");
  const projects = useCollection<Project>("projects");
  const entities = useCollection<Entity>("entities");

  const view = useMemo(() => {
    const projectById = index(projects);
    const entityById = index(entities);
    const list = sortBy(all, "direction", "description");
    const live = list.filter((s) => !s.paused);

    return {
      projectById,
      entityById,
      income: list.filter((s) => s.direction === "income"),
      expense: list.filter((s) => s.direction === "expense"),
      inPerMonth: live
        .filter((s) => s.direction === "income")
        .reduce((sum, s) => sum + perMonth(s), 0),
      outPerMonth: live
        .filter((s) => s.direction === "expense")
        .reduce((sum, s) => sum + perMonth(s), 0),
    };
  }, [all, projects, entities]);

  function row(s: EntrySeries) {
    const next = s.paused ? "" : nextOccurrence(s);
    return (
      <Row
        key={s.id}
        href={`/recurrentes/${s.id}`}
        label={s.description}
        hint={[
          CADENCE[s.cadence] || s.cadence,
          next ? `próxima ${fmtDate(next)} · ${fmtRelative(next)}` : null,
          view.projectById.get(s.project)?.name,
          view.entityById.get(s.entity)?.name,
          s.currency && s.currency !== cfg.settings.default_currency
            ? `${s.currency} ${s.amount}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        value={
          <span className={s.direction === "income" ? "text-ok" : "text-ink"}>
            {s.direction === "expense" ? "−" : ""}
            {formatMoney(perMonth(s))}
            <span className="text-faint">/mes</span>
          </span>
        }
        badge={
          s.paused ? (
            <Badge tone="warn">En pausa</Badge>
          ) : s.auto_paid ? (
            <Badge tone="ok">Se da por pagado</Badge>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <Title>Recurrentes</Title>
      <PageHeader
        title="Recurrentes"
        subtitle="Sueldos, arriendos, cuotas y proyectos que se cobran por mes. La app los anota sola."
        action={
          <Link href="/recurrentes/nuevo" className={btn("primary", "sm")}>
            + Recurrente
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat label="Entra al mes" value={formatMoneyShort(view.inPerMonth)} tone="ok" hint="promedio" />
        <Stat
          label="Sale al mes"
          value={formatMoneyShort(view.outPerMonth)}
          hint={`neto ${formatMoneyShort(view.inPerMonth - view.outPerMonth)}`}
        />
      </div>

      <Group title="Ingresos">
        {view.income.length === 0 ? (
          <Empty>
            Nada programado. Un sueldo, una asignación, un proyecto largo que se cobra por mes.
          </Empty>
        ) : (
          view.income.map(row)
        )}
      </Group>

      <Group title="Egresos">
        {view.expense.length === 0 ? (
          <Empty>
            Nada programado. El arriendo, un seguro, las suscripciones, la cuota de un crédito.
          </Empty>
        ) : (
          view.expense.map(row)
        )}
      </Group>

      <p className="mt-6 px-1 text-[13px] leading-relaxed text-faint">
        Cada repetición se anota como un movimiento normal en Finanzas, así que se puede corregir,
        marcar pagada o borrar una sola sin tocar las demás. La app mantiene anotados los próximos
        tres meses.
      </p>
    </>
  );
}
