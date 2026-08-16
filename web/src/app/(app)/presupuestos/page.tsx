"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Entity, Quote } from "@/lib/types";
import { createQuote } from "@/lib/local/actions";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { index, sortBy } from "@/lib/local/query";
import { formatAmount, formatCLPShort } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { Form } from "@/components/form";
import {
  Badge,
  btn,
  Card,
  cx,
  Empty,
  Field,
  Group,
  inputClass,
  PageHeader,
  Row,
  Select,
  Stat,
} from "@/components/ui";
import { Title } from "@/components/Title";

const STATUS_ORDER = ["draft", "pending", "approved", "rejected"];

export default function QuotesRoute() {
  return (
    <Suspense fallback={null}>
      <QuotesPage />
    </Suspense>
  );
}

function QuotesPage() {
  const cfg = useConfig();
  const sp = useSearchParams();
  const status = sp.get("status") || "";

  const allQuotes = useCollection<Quote>("quotes");
  const entities = useCollection<Entity>("entities");

  const view = useMemo(() => {
    const quotes = sortBy(
      allQuotes.filter((q) => !status || q.status === status),
      "-date",
      "-created"
    );

    const pending = quotes.filter((q) => q.status === "pending");
    const approved = quotes.filter((q) => q.status === "approved");
    // Solo sobre los decididos: contar los borradores y los pendientes como
    // fracasos castigaría por tener trabajo en curso.
    const decided = quotes.filter((q) => q.status === "approved" || q.status === "rejected");

    return {
      quotes,
      pending,
      approved,
      clientById: index(entities),
      clientOptions: sortBy(entities, "name").map((e) => ({ value: e.id, label: e.name })),
      pendingTotal: pending.reduce((s, q) => s + (q.net_total_clp || 0), 0),
      approvedTotal: approved.reduce((s, q) => s + (q.net_total_clp || 0), 0),
      decided,
      hitRate: decided.length ? Math.round((approved.length / decided.length) * 100) : null,
    };
  }, [allQuotes, entities, status]);

  return (
    <>
      <Title>Presupuestos</Title>
      <PageHeader
        title="Presupuestos"
        subtitle={`${view.quotes.length} documento${view.quotes.length === 1 ? "" : "s"}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat
          label="Pendiente de respuesta"
          value={formatCLPShort(view.pendingTotal)}
          hint={`${view.pending.length} esperando`}
          tone={view.pending.length ? "warn" : "neutral"}
        />
        <Stat
          label="Aprobado"
          value={formatCLPShort(view.approvedTotal)}
          hint={`${view.approved.length} con el sí puesto`}
          tone="ok"
        />
        <Stat
          label="Tasa de cierre"
          value={view.hitRate === null ? "—" : `${view.hitRate}%`}
          hint={
            view.hitRate === null
              ? "todavía sin respuestas"
              : `${view.approved.length} de ${view.decided.length} respondidos`
          }
        />
      </div>

      {/* Un campo, no seis. Cliente, tipo, horas y moneda se eligen adentro, con
          el presupuesto ya delante; pedirlos antes de que exista obligaba a
          decidirlo todo en el peor momento, que es antes de empezar. */}
      <Card className="mb-6" bodyClassName="px-4 py-3.5">
        <Form action={createQuote} className="flex flex-wrap items-center gap-2">
          <input
            name="title"
            required
            placeholder="¿Qué hay que cotizar?"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button type="submit" className={btn("primary")}>
            Empezar
          </button>
        </Form>
      </Card>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/presupuestos" className={cx(btn(status ? "ghost" : "subtle", "sm"))}>
          Todos
        </Link>
        {STATUS_ORDER.map((value) => (
          <Link
            key={value}
            href={`/presupuestos?status=${value}`}
            className={cx(btn(status === value ? "subtle" : "ghost", "sm"))}
          >
            {cfg.label("quote_status", value)}
          </Link>
        ))}
      </div>

      {view.quotes.length === 0 ? (
        <Empty>No hay presupuestos con ese filtro.</Empty>
      ) : (
        <Group>
          {view.quotes.map((q) => (
            <Row
              key={q.id}
              href={`/presupuestos/${q.id}`}
              label={q.title}
              hint={[
                q.number || null,
                view.clientById.get(q.client)?.name || "sin cliente",
                q.kind ? cfg.label("project_kind", q.kind) : null,
                q.status === "pending" && q.valid_until
                  ? `vence ${fmtDate(q.valid_until)}`
                  : fmtDate(q.date),
              ]
                .filter(Boolean)
                .join(" · ")}
              value={formatAmount(q.net_total || 0, q.currency || "CLP")}
              badge={
                <Badge tone={cfg.tone("quote_status", q.status)}>
                  {cfg.label("quote_status", q.status)}
                </Badge>
              }
            />
          ))}
        </Group>
      )}
    </>
  );
}
