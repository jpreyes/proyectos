"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Category, Entity, Entry, Project } from "@/lib/types";
import { markEntryPaid } from "@/lib/local/actions";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { day, index, sortBy } from "@/lib/local/query";
import { clpOf, formatCLP, formatCLPShort } from "@/lib/money";
import { fmtDate, fmtRelative, monthKey, recentMonths } from "@/lib/dates";
import { Form } from "@/components/form";
import { Badge, btn, Card, cx, Empty, Group, inputClass, PageHeader, Row, Stat } from "@/components/ui";
import { Bars } from "@/components/Bars";
import { Title } from "@/components/Title";

export default function FinanceRoute() {
  return (
    <Suspense fallback={null}>
      <FinancePage />
    </Suspense>
  );
}

function FinancePage() {
  const cfg = useConfig();
  const router = useRouter();
  const sp = useSearchParams();

  const year = sp.get("year") || String(new Date().getFullYear());
  const project = sp.get("project") || "";
  const direction = sp.get("direction") || "";

  const allEntries = useCollection<Entry>("entries");
  const allProjects = useCollection<Project>("projects");
  const allEntities = useCollection<Entity>("entities");
  useCollection<Category>("categories"); // se replica igual; hoy no se muestra en la lista

  const view = useMemo(() => {
    const projectById = index(allProjects);
    const entityById = index(allEntities);

    const entries = sortBy(
      allEntries.filter((e) => {
        const d = day(e.date);
        if (d < `${year}-01-01` || d > `${year}-12-31`) return false;
        if (project && e.project !== project) return false;
        if (direction && e.direction !== direction) return false;
        return true;
      }),
      "-date"
    );

    const paid = entries.filter((e) => e.status === "paid");
    const income = paid.filter((e) => e.direction === "income").reduce((s, e) => s + clpOf(e), 0);
    const expense = paid.filter((e) => e.direction === "expense").reduce((s, e) => s + clpOf(e), 0);
    const receivable = entries
      .filter(
        (e) => e.direction === "income" && (e.status === "invoiced" || e.status === "committed")
      )
      .reduce((s, e) => s + clpOf(e), 0);

    const incomeByMonth: Record<string, number> = {};
    const expenseByMonth: Record<string, number> = {};
    for (const e of paid) {
      const k = monthKey(e.date);
      const bucket = e.direction === "income" ? incomeByMonth : expenseByMonth;
      bucket[k] = (bucket[k] || 0) + clpOf(e);
    }

    // Margen por proyecto — el número que una app de contabilidad genérica
    // nunca te da.
    const byProject = new Map<
      string,
      { name: string; income: number; expense: number; pending: number }
    >();
    for (const e of entries) {
      if (!e.project) continue;
      const row = byProject.get(e.project) || {
        name: projectById.get(e.project)?.name || "—",
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

    // Plata que se fue por roces y no por decisiones: multas, recargos, cosas
    // repuestas o compradas dos veces, suscripciones que nadie canceló. Queda
    // invisible porque llega en pedacitos inconexos, así que el punto es el total.
    const taxed = entries.filter((e) => e.friction_cost && e.direction === "expense");
    const subscriptions = entries.filter((e) => e.recurring && e.direction === "expense");

    return {
      entries,
      entityById,
      projectById,
      income,
      expense,
      receivable,
      incomeByMonth,
      expenseByMonth,
      projectRows: [...byProject.entries()]
        .map(([id, r]) => ({ id, ...r, margin: r.income - r.expense }))
        .sort((a, b) => b.margin - a.margin),
      taxed,
      taxTotal: taxed.reduce((s, e) => s + clpOf(e), 0),
      subscriptions,
      subsTotal: subscriptions.reduce((s, e) => s + clpOf(e), 0),
    };
  }, [allEntries, allProjects, allEntities, year, project, direction]);

  const months = recentMonths(12);
  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
  const filtering = Boolean(project || direction || sp.get("year"));

  function filter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["year", "project", "direction"]) {
      const value = String(fd.get(key) || "");
      if (value) params.set(key, value);
    }
    router.replace(params.size ? `/finanzas?${params}` : "/finanzas");
  }

  return (
    <>
      <Title>Finanzas</Title>
      <PageHeader
        title="Finanzas"
        subtitle={`${view.entries.length} movimiento${view.entries.length === 1 ? "" : "s"} en ${year}`}
        action={
          <Link href="/finanzas/nuevo" className={btn("primary", "sm")}>
            + Movimiento
          </Link>
        }
      />

      {/* Tres selectores que antes te recibían antes que cualquier número. */}
      <details open={filtering} className="group mb-6">
        <summary className="cursor-pointer list-none px-1 text-[13px] font-semibold text-faint">
          {year}
          {project ? " · un workspace" : ""}
          {direction ? ` · solo ${cfg.label("direction", direction).toLowerCase()}s` : ""}
          <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
        </summary>
        <form onSubmit={filter} className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <select name="year" defaultValue={year} className={inputClass}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select name="project" defaultValue={project} className={inputClass}>
            <option value="">Todos los workspaces</option>
            {sortBy(allProjects, "name").map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select name="direction" defaultValue={direction} className={inputClass}>
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
        <Stat label="Recibido" value={formatCLPShort(view.income)} tone="ok" hint={`en ${year}`} />
        <Stat label="Gastado" value={formatCLPShort(view.expense)} hint={`en ${year}`} />
        <Stat
          label="Margen"
          value={formatCLPShort(view.income - view.expense)}
          tone={view.income - view.expense >= 0 ? "ok" : "bad"}
        />
        <Stat
          label="Por cobrar"
          value={formatCLPShort(view.receivable)}
          tone={view.receivable > 0 ? "warn" : "neutral"}
        />
      </div>

      <Card
        className="mb-6"
        title="Flujo mensual"
        subtitle="Últimos 12 meses, solo lo efectivamente pagado"
      >
        <Bars months={months} income={view.incomeByMonth} expense={view.expenseByMonth} />
      </Card>

      <Group title={`Margen por workspace · ${year}`}>
        {view.projectRows.length === 0 ? (
          <Empty>Sin movimientos asociados a un workspace.</Empty>
        ) : (
          view.projectRows.map((r) => (
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

      {/* La tabla entera colapsada en filas: seis columnas nunca cupieron en un
          teléfono, y lo que uno busca es el monto y el estado. */}
      <Group title="Movimientos">
        {view.entries.length === 0 ? (
          <Empty>Sin movimientos en este filtro.</Empty>
        ) : (
          view.entries.map((e) => (
            <Row
              key={e.id}
              href={`/finanzas/${e.id}`}
              label={e.description}
              hint={[
                fmtDate(e.date),
                cfg.label("direction", e.direction),
                view.entityById.get(e.entity)?.name,
                view.projectById.get(e.project)?.name,
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

      {/* Los dos paneles de revisión van al final: son para sentarse a mirar,
          no para el vistazo con el que uno abre esta pantalla. */}
      <Group title={`Costo de fricción · ${formatCLP(view.taxTotal)}`}>
        {view.taxed.length === 0 ? (
          <Empty>
            Nada marcado en {year}. Multas, recargos, cosas repuestas, compras duplicadas — se marca
            con la casilla al registrar un egreso.
          </Empty>
        ) : (
          view.taxed
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

      <Group title={`Recurrentes · ${formatCLP(view.subsTotal)}`}>
        {view.subscriptions.length === 0 ? (
          <Empty>Nada marcado como recurrente. Están acá para revisarlas, no para renovarlas.</Empty>
        ) : (
          view.subscriptions
            .slice(0, 8)
            .map((e) => (
              <Row
                key={e.id}
                href={`/finanzas/${e.id}`}
                label={e.description}
                hint={view.entityById.get(e.entity)?.name}
                value={formatCLPShort(clpOf(e))}
              />
            ))
        )}
      </Group>

      {/* Fuera de las filas de arriba: un enlace que además escribe volvería
          ambigua la fila entera al tocarla. */}
      {view.receivable > 0 && (
        <Group title="Marcar como pagado">
          {view.entries
            .filter((e) => e.direction === "income" && e.status !== "paid")
            .map((e) => (
              <Form key={e.id} action={markEntryPaid}>
                <input type="hidden" name="id" value={e.id} />
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
              </Form>
            ))}
        </Group>
      )}
    </>
  );
}
