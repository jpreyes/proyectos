import Link from "next/link";
import type { Entity, Quote } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { getConfig } from "@/lib/config";
import { alive, ALIVE } from "@/lib/filters";
import { formatAmount, formatCLPShort } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { createQuote } from "@/lib/actions";
import { Badge, btn, Card, cx, Empty, Field, Group, inputClass, PageHeader, Row, Select, Stat } from "@/components/ui";

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

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat
          label="Pendiente de respuesta"
          value={formatCLPShort(pendingTotal)}
          hint={`${pending.length} esperando`}
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

      {/* Eight fields that used to sit open above the list of real quotes. */}
      <details className="group mb-6">
        <summary className={`${btn("primary")} list-none`}>+ Nuevo presupuesto</summary>
        <Card className="mt-3" subtitle="Lo demás se llena adentro.">
          <form action={createQuote} className="grid gap-3.5 sm:grid-cols-2">
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
            <Field label="Moneda" className="sm:col-span-2">
              <Select
                name="currency"
                defaultValue={cfg.settings.default_currency}
                options={cfg.options("currency")}
              />
            </Field>
            <button type="submit" className={`${btn("primary")} sm:col-span-2`}>
              Crear
            </button>
          </form>
        </Card>
      </details>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/presupuestos" className={cx(btn(sp.status ? "ghost" : "subtle", "sm"))}>
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
        <Group>
          {quotes.map((q) => (
            <Row
              key={q.id}
              href={`/presupuestos/${q.id}`}
              label={q.title}
              hint={[
                q.number || null,
                q.expand?.client?.name || "sin cliente",
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
