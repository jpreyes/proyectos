import Link from "next/link";
import type { Entry, Project } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { markEntryPaid } from "@/lib/actions";
import { getConfig } from "@/lib/config";
import { alive, ALIVE } from "@/lib/filters";
import { clpOf, formatCLP, formatCLPShort } from "@/lib/money";
import { fmtDate, fmtRelative, monthKey, recentMonths } from "@/lib/dates";
import { Badge, btn, Card, cx, Empty, inputClass, PageHeader, Stat } from "@/components/ui";
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
  const byProject = new Map<string, { name: string; income: number; expense: number; pending: number }>();
  for (const e of entries) {
    if (!e.project) continue;
    const row =
      byProject.get(e.project) || {
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

      <form className="mb-5 flex flex-wrap gap-2">
        <select name="year" defaultValue={year} className={`${inputClass} max-w-[7rem]`}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          name="project"
          defaultValue={sp.project || ""}
          className={`${inputClass} max-w-[14rem]`}
        >
          <option value="">Todos los workspaces</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          name="direction"
          defaultValue={sp.direction || ""}
          className={`${inputClass} max-w-[9rem]`}
        >
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

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Flujo mensual" subtitle="Últimos 12 meses, solo lo efectivamente pagado">
          <Bars months={months} income={incomeByMonth} expense={expenseByMonth} />
        </Card>

        <Card title="Margen por workspace" subtitle={`Año ${year}`}>
          {projectRows.length === 0 ? (
            <Empty>Sin movimientos asociados a un workspace.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {projectRows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <Link
                    href={`/w/${r.id}`}
                    className="min-w-0 flex-1 truncate text-[13px] hover:text-accent"
                  >
                    {r.name}
                  </Link>
                  {r.pending > 0 && (
                    <span className="shrink-0 text-[11px] text-warn">
                      +{formatCLPShort(r.pending)} por cobrar
                    </span>
                  )}
                  <span
                    className={cx(
                      "w-24 shrink-0 text-right text-[13px] tabular-nums",
                      r.margin >= 0 ? "text-ok" : "text-bad"
                    )}
                  >
                    {formatCLPShort(r.margin)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card
          title="Costo de fricción"
          subtitle="Multas, recargos, cosas repuestas, compras duplicadas, suscripciones olvidadas"
        >
          {taxed.length === 0 ? (
            <Empty>
              Nada marcado en {year}. Se marca con la casilla al registrar un egreso.
            </Empty>
          ) : (
            <>
              <div className="mb-3 flex items-baseline justify-between border-b border-line pb-3">
                <span className="text-[13px] text-muted">
                  {taxed.length} movimiento{taxed.length === 1 ? "" : "s"} en {year}
                </span>
                <span className="text-xl font-semibold tabular-nums text-bad">
                  {formatCLP(taxTotal)}
                </span>
              </div>
              <ul className="divide-y divide-line">
                {taxed.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-1.5 text-[13px]">
                    <span className="w-16 shrink-0 text-[11px] tabular-nums text-faint">
                      {fmtDate(e.date)}
                    </span>
                    <Link href={`/finanzas/${e.id}`} className="min-w-0 flex-1 truncate hover:text-accent">
                      {e.description}
                    </Link>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatCLPShort(clpOf(e))}
                    </span>
                  </li>
                ))}
              </ul>
              {taxed.length > 8 && (
                <p className="mt-2 text-[11px] text-faint">y {taxed.length - 8} más</p>
              )}
            </>
          )}
        </Card>

        <Card
          title="Recurrentes"
          subtitle="Para revisarlas, no para renovarlas por inercia"
        >
          {subscriptions.length === 0 ? (
            <Empty>Nada marcado como recurrente.</Empty>
          ) : (
            <>
              <div className="mb-3 flex items-baseline justify-between border-b border-line pb-3">
                <span className="text-[13px] text-muted">
                  {subscriptions.length} en {year}
                </span>
                <span className="text-xl font-semibold tabular-nums">
                  {formatCLP(subsTotal)}
                </span>
              </div>
              <ul className="divide-y divide-line">
                {subscriptions.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-1.5 text-[13px]">
                    <Link href={`/finanzas/${e.id}`} className="min-w-0 flex-1 truncate hover:text-accent">
                      {e.description}
                    </Link>
                    <span className="shrink-0 text-[11px] text-faint">
                      {e.expand?.entity?.name || ""}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatCLPShort(clpOf(e))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card className="mt-5" title="Movimientos">
        {entries.length === 0 ? (
          <Empty>Sin movimientos en este filtro.</Empty>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[52rem] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Descripción</th>
                  <th className="py-2 pr-3 font-medium">Workspace</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 pr-3 text-right font-medium">Monto</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((e) => (
                  <tr key={e.id} className="group hover:bg-panel2/50">
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted">
                      {fmtDate(e.date)}
                    </td>
                    <td className="py-2 pr-3">
                      <Link href={`/finanzas/${e.id}`} className="hover:text-accent">
                        {e.description}
                      </Link>
                      <span className="block text-[11px] text-faint">
                        {cfg.label("direction", e.direction)}
                        {e.expand?.entity ? ` · ${e.expand.entity.name}` : ""}
                        {e.currency !== "CLP" ? ` · ${e.currency} ${e.amount}` : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted">
                      {e.expand?.project ? (
                        <Link href={`/w/${e.project}`} className="hover:text-accent">
                          {e.expand.project.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={cfg.tone("entry_status", e.status)}>
                        {cfg.label("entry_status", e.status)}
                      </Badge>
                      {e.due_date && e.status !== "paid" && (
                        <span className="ml-1.5 text-[11px] text-faint">
                          {fmtRelative(e.due_date)}
                        </span>
                      )}
                    </td>
                    <td
                      className={cx(
                        "whitespace-nowrap py-2 pr-3 text-right tabular-nums",
                        e.direction === "income" ? "text-ok" : "text-ink"
                      )}
                    >
                      {e.direction === "expense" ? "−" : ""}
                      {formatCLP(clpOf(e))}
                    </td>
                    <td className="py-2 text-right">
                      {e.direction === "income" && e.status !== "paid" && (
                        <form action={markEntryPaid}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="project" value={e.project} />
                          <button
                            type="submit"
                            title="Marcar pagado"
                            className="text-[11px] text-faint opacity-0 transition-opacity hover:text-ok group-hover:opacity-100"
                          >
                            ✓ pagado
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
