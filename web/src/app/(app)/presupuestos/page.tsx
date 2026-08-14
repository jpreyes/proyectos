import Link from "next/link";
import type { Entity, Quote } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { getConfig } from "@/lib/config";
import { alive, ALIVE } from "@/lib/filters";
import { formatAmount, formatCLPShort } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { createQuote } from "@/lib/actions";
import { Badge, btn, Card, cx, Empty, Field, inputClass, PageHeader, Select, Stat } from "@/components/ui";
import { Due } from "@/components/Due";

export const metadata = { title: "Presupuestos · Proyectos" };

const STATUS_ORDER = ["draft", "pending", "approved", "rejected"];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const pb = await requirePB();
  const cfg = await getConfig();

  const [quotes, entities] = await Promise.all([
    pb.collection("quotes").getFullList<Quote>({
      filter: alive(sp.status && pb.filter("status = {:s}", { s: sp.status })),
      sort: "-date,-created",
      expand: "client",
    }),
    pb.collection("entities").getFullList<Entity>({ filter: ALIVE, sort: "name" }),
  ]);

  const pending = quotes.filter((q) => q.status === "pending");
  const approved = quotes.filter((q) => q.status === "approved");

  const pendingTotal = pending.reduce((s, q) => s + (q.net_total_clp || 0), 0);
  const approvedTotal = approved.reduce((s, q) => s + (q.net_total_clp || 0), 0);

  // Solo sobre los decididos: contar los borradores y los pendientes como
  // fracasos castigaría por tener trabajo en curso.
  const decided = quotes.filter((q) => q.status === "approved" || q.status === "rejected");
  const hitRate = decided.length ? Math.round((approved.length / decided.length) * 100) : null;

  return (
    <>
      <PageHeader
        title="Presupuestos"
        subtitle={`${quotes.length} documento${quotes.length === 1 ? "" : "s"}`}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Pendiente de respuesta"
          value={formatCLPShort(pendingTotal)}
          hint={`${pending.length} presupuesto${pending.length === 1 ? "" : "s"} esperando`}
          tone={pending.length ? "warn" : "neutral"}
        />
        <Stat
          label="Aprobado"
          value={formatCLPShort(approvedTotal)}
          hint={`${approved.length} con el sí puesto`}
          tone="ok"
        />
        <Stat
          label="Tasa de cierre"
          value={hitRate === null ? "—" : `${hitRate}%`}
          hint={
            hitRate === null
              ? "todavía sin respuestas"
              : `${approved.length} de ${decided.length} respondidos`
          }
        />
      </div>

      <Card className="mb-5" title="Nuevo presupuesto" subtitle="Lo demás se llena adentro.">
        <form action={createQuote} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Título" className="sm:col-span-2">
            <input
              name="title"
              required
              placeholder="Revisión estructural galpón…"
              className={inputClass}
            />
          </Field>
          <Field label="Cliente">
            <Select
              name="client"
              placeholder="—"
              options={entities.map((e) => ({ value: e.id, label: e.name }))}
            />
          </Field>
          <Field label="Tipo">
            <Select name="kind" placeholder="—" options={cfg.options("project_kind")} />
          </Field>
          <Field label="Horas de trabajo" hint="tangible, para buscar el hueco">
            <input name="work_hours" placeholder="60" className={inputClass} />
          </Field>
          <Field label="Ritmo máximo" hint="horas por semana">
            <input name="max_hours_week" placeholder="12" className={inputClass} />
          </Field>
          <Field label="Moneda">
            <Select
              name="currency"
              defaultValue={cfg.settings.default_currency}
              options={cfg.options("currency")}
            />
          </Field>
          <div className="flex items-end">
            <button type="submit" className={`${btn("primary")} w-full`}>
              Crear
            </button>
          </div>
        </form>
      </Card>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Link
          href="/presupuestos"
          className={cx(btn(sp.status ? "ghost" : "subtle", "sm"))}
        >
          Todos
        </Link>
        {STATUS_ORDER.map((value) => (
          <Link
            key={value}
            href={`/presupuestos?status=${value}`}
            className={cx(btn(sp.status === value ? "subtle" : "ghost", "sm"))}
          >
            {cfg.label("quote_status", value)}
          </Link>
        ))}
      </div>

      {quotes.length === 0 ? (
        <Empty>No hay presupuestos con ese filtro.</Empty>
      ) : (
        <Card bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/presupuestos/${q.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-panel2"
                >
                  <span className="w-24 shrink-0 font-mono text-[11px] text-faint">
                    {q.number || "—"}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{q.title}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {q.expand?.client?.name || "sin cliente"}
                      {q.kind && ` · ${cfg.label("project_kind", q.kind)}`}
                    </span>
                  </span>

                  <span className="w-28 shrink-0 text-right text-[13px] tabular-nums">
                    {formatAmount(q.net_total || 0, q.currency || "CLP")}
                  </span>

                  <span className="w-32 shrink-0">
                    {q.status === "pending" && q.valid_until ? (
                      <Due date={q.valid_until} horizon={30} />
                    ) : (
                      <span className="text-[11px] text-faint">{fmtDate(q.date)}</span>
                    )}
                  </span>

                  <Badge tone={cfg.tone("quote_status", q.status)}>
                    {cfg.label("quote_status", q.status)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
