import Link from "next/link";
import type { Entry, Project } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { markEntryPaid } from "@/lib/actions";
import { getConfig } from "@/lib/config";
import { ALIVE } from "@/lib/filters";
import { clpOf, formatCLP, formatCLPShort } from "@/lib/money";
import { fmtDate, fmtRelative, monthKey, recentMonths } from "@/lib/dates";
import { Badge, btn, Card, cx, Empty, Group, inputClass, PageHeader, Row, Stat } from "@/components/ui";
import { Bars } from "@/components/Bars";

export const metadata = { title: "Finanzas · Proyectos" };

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; year?: string; direction?: string }>;
}) {
  const sp = await searchParams;
  const pb = await requirePB();

  const year = sp.year || String(new Date().getFullYear());

  const cfg = await getConfig();

  const filters: string[] = [
    ALIVE,
    pb.filter("date >= {:from} && date <= {:to}", {
      from: `${year}-01-01 00:00:00`,
      to: `${year}-12-31 23:59:59`,
    }),
  ];
  if (sp.project) filters.push(pb.filter("project = {:p}", { p: sp.project }));
  if (sp.direction) filters.push(pb.filter("direction = {:d}", { d: sp.direction }));

  const [entries, projects] = await Promise.all([
    pb.collection("entries").getFullList<Entry>({
      filter: filters.join(" && "),
      sort: "-date",
      expand: "project,entity,category",
    }),
    pb.collection("projects").getFullList<Project>({ filter: ALIVE, sort: "name" }),
  ]);

  /* --------------------------------------------------------- aggregates --- */
  const paid = entries.filter((e) => e.status === "paid");
  const income = paid.filter((e) => e.direction === "income").reduce((s, e) => s + clpOf(e), 0);
  const expense = paid.filter((e) => e.direction === "expense").reduce((s, e) => s + clpOf(e), 0);
  const receivable = entries
    .filter(
      (e) => e.direction === "income" && (e.status === "invoiced" || e.status === "committed")
    )
    .reduce((s, e) => s + clpOf(e), 0);

  const months = recentMonths(12);
  const incomeByMonth: Record<string, number> = {};
  const expenseByMonth: Record<string, number> = {};
  for (const e of paid) {
    const k = monthKey(e.date);
    const bucket = e.direction === "income" ? incomeByMonth : expenseByMonth;
    bucket[k] = (bucket[k] || 0) + clpOf(e);
  }

  // Per-project margin — the number a generic accounting app never gives you.
  const byProject = new Map<
    string,
    { name: string; income: number; expense: number; pending: number }
  >();
  for (const e of entries) {
    if (!e.project) continue;
    const row = byProject.get(e.project) || {
      name: e.expand?.project?.name || "—",
      income: 0,
      expense: 0,
      pending: 0,
    };
    const v = clpOf(e);
    if (e.status === "paid") {
      if (e.direction === "income") row.income += v;
      else row.expense += v;
    } else if (e.direction === "income" && (e.status === "invoiced" || e.status === "committed")) {
      row.pending += v;
    }
    byProject.set(e.project, row);
  }
  const projectRows = [...byProject.entries()]
    .map(([id, r]) => ({ id, ...r, margin: r.income - r.expense }))
    .sort((a, b) => b.margin - a.margin);

  // Money lost to slips rather than to decisions: late fees, penalties, things
  // replaced or bought twice, subscriptions nobody cancelled. It stays invisible
  // because it arrives in small unrelated pieces, so the point is the total.
  const taxed = entries.filter((e) => e.friction_cost && e.direction === "expense");
  const taxTotal = taxed.reduce((s, e) => s + clpOf(e), 0);
  const subscriptions = entries.filter((e) => e.recurring && e.direction === "expense");
  const subsTotal = subscriptions.reduce((s, e) => s + clpOf(e), 0);

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
  const filtering = Boolean(sp.project || sp.direction || sp.year);

  return (
    <>
      <PageHeader
        title="Finanzas"
        subtitle={`${entries.length} movimiento${entries.length === 1 ? "" : "s"} en ${year}`}
        action={
          <Link href="/finanzas/nuevo" className={btn("primary", "sm")}>
            + Movimiento
          </Link>
        }
      />

      {/* Three selects that used to greet you before a single number did. */}
      <details open={filtering} className="group mb-6">
        <summary className="cursor-pointer list-none px-1 text-[13px] font-semibold text-faint">
          {year}
          {sp.project ? " · un workspace" : ""}
          {sp.direction ? ` · solo ${cfg.label("direction", sp.direction).toLowerCase()}s` : ""}
          <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
        </summary>
        <form className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <select name="year" defaultValue={year} className={inputClass}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select name="project" defaultValue={sp.project || ""} className={inputClass}>
            <option value="">Todos los workspaces</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select name="direction" defaultValue={sp.direction || ""} className={inputClass}>
            <option value="">Ingresos y egresos</option>
            {cfg.options("direction").map((o) => (
              <option key={o.value} value={o.value}>
                Solo {o.label.toLowerCase()}s
              </option>
            ))}
          </select>
          <button type="submit" className={btn("subtle")}>
            Filtrar
          </button>
        </form>
      </details>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat label="Recibido" value={formatCLPShort(income)} tone="ok" hint={`en ${year}`} />
        <Stat label="Gastado" value={formatCLPShort(expense)} hint={`en ${year}`} />
        <Stat
          label="Margen"
          value={formatCLPShort(income - expense)}
          tone={income - expense >= 0 ? "ok" : "bad"}
        />
        <Stat
          label="Por cobrar"
          value={formatCLPShort(receivable)}
          tone={receivable > 0 ? "warn" : "neutral"}
        />
      </div>

      <Card
        className="mb-6"
        title="Flujo mensual"
        subtitle="Últimos 12 meses, solo lo efectivamente pagado"
      >
        <Bars months={months} income={incomeByMonth} expense={expenseByMonth} />
      </Card>

      <Group title={`Margen por workspace · ${year}`}>
        {projectRows.length === 0 ? (
          <Empty>Sin movimientos asociados a un workspace.</Empty>
        ) : (
          projectRows.map((r) => (
            <Row
              key={r.id}
              href={`/w/${r.id}`}
              label={r.name}
              hint={r.pending > 0 ? `+${formatCLPShort(r.pending)} por cobrar` : undefined}
              value={
                <span className={r.margin >= 0 ? "text-ok" : "text-bad"}>
                  {formatCLPShort(r.margin)}
                </span>
              }
            />
          ))
        )}
      </Group>

      {/* The whole table collapsed into rows: six columns never fitted a phone,
          and the amount plus the status is what you actually scan for. */}
      <Group title="Movimientos">
        {entries.length === 0 ? (
          <Empty>Sin movimientos en este filtro.</Empty>
        ) : (
          entries.map((e) => (
            <Row
              key={e.id}
              href={`/finanzas/${e.id}`}
              label={e.description}
              hint={[
                fmtDate(e.date),
                cfg.label("direction", e.direction),
                e.expand?.entity?.name,
                e.expand?.project?.name,
                e.currency !== "CLP" ? `${e.currency} ${e.amount}` : null,
                e.due_date && e.status !== "paid" ? `vence ${fmtRelative(e.due_date)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              value={
                <span className={cx(e.direction === "income" ? "text-ok" : "text-ink")}>
                  {e.direction === "expense" ? "−" : ""}
                  {formatCLP(clpOf(e))}
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

      {/* The two review panels sit last: they are for a deliberate sit-down,
          not for the glance you open this screen with. */}
      <Group title={`Costo de fricción · ${formatCLP(taxTotal)}`}>
        {taxed.length === 0 ? (
          <Empty>
            Nada marcado en {year}. Multas, recargos, cosas repuestas, compras duplicadas — se marca
            con la casilla al registrar un egreso.
          </Empty>
        ) : (
          taxed
            .slice(0, 8)
            .map((e) => (
              <Row
                key={e.id}
                href={`/finanzas/${e.id}`}
                label={e.description}
                hint={fmtDate(e.date)}
                value={formatCLPShort(clpOf(e))}
              />
            ))
        )}
      </Group>

      <Group title={`Recurrentes · ${formatCLP(subsTotal)}`}>
        {subscriptions.length === 0 ? (
          <Empty>Nada marcado como recurrente. Están acá para revisarlas, no para renovarlas.</Empty>
        ) : (
          subscriptions
            .slice(0, 8)
            .map((e) => (
              <Row
                key={e.id}
                href={`/finanzas/${e.id}`}
                label={e.description}
                hint={e.expand?.entity?.name}
                value={formatCLPShort(clpOf(e))}
              />
            ))
        )}
      </Group>

      {/* Kept out of the rows above: a link that also mutates would make the
          whole row ambiguous to tap. */}
      {receivable > 0 && (
        <Group title="Marcar como pagado">
          {entries
            .filter((e) => e.direction === "income" && e.status !== "paid")
            .map((e) => (
              <form key={e.id} action={markEntryPaid}>
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="project" value={e.project} />
                <button type="submit" className="block w-full text-left">
                  <Row
                    icon="✓"
                    iconTone="ok"
                    label={e.description}
                    hint={e.due_date ? `vence ${fmtRelative(e.due_date)}` : undefined}
                    value={formatCLPShort(clpOf(e))}
                    chevron={false}
                  />
                </button>
              </form>
            ))}
        </Group>
      )}
    </>
  );
}
