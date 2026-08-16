"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CalendarFeed, Commitment, Entity, Project } from "@/lib/types";
import type { Tone } from "@/lib/labels";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { day, sortBy } from "@/lib/local/query";
import { calendarWindow } from "@/lib/local/schedule";
import { fmtDate, inputDate } from "@/lib/dates";
import { fmtHours, weekStart } from "@/lib/capacity";
import {
  createCommitment,
  deleteCalendarFeed,
  deleteCommitment,
  saveCalendarFeed,
  setCommitmentStatus,
  updateCommitment,
} from "@/lib/local/actions";
import { refreshStaleFeeds, syncCalendarFeeds } from "@/lib/actions.server";
import { Form } from "@/components/form";
import {
  Badge,
  btn,
  Card,
  cx,
  Empty,
  Field,
  inputClass,
  PageHeader,
  Select,
  Stat,
} from "@/components/ui";
import { WeekGrid } from "@/components/WeekGrid";
import { Title } from "@/components/Title";

const VIEWS = [
  { weeks: 13, label: "3 meses" },
  { weeks: 26, label: "6 meses" },
  { weeks: 52, label: "1 año" },
];

export default function CalendarRoute() {
  return (
    <Suspense fallback={null}>
      <CalendarPage />
    </Suspense>
  );
}

function CalendarPage() {
  const cfg = useConfig();
  const sp = useSearchParams();
  const weeks = Number(sp.get("weeks")) || 26;

  const allCommitments = useCollection<Commitment>("commitments");
  const events = useCollection("calendar_events");
  const feeds = useCollection<CalendarFeed>("calendar_feeds");
  const projects = useCollection<Project>("projects");
  const entities = useCollection<Entity>("entities");

  // Refresco perezoso del .ics. Es lo único de esta pantalla que necesita
  // servidor —el calendario de la UACh vive afuera— así que se pide y se
  // olvida: si no hay red, la grilla igual se dibuja con lo ya replicado.
  useEffect(() => {
    if (navigator.onLine) void refreshStaleFeeds().catch(() => undefined);
  }, []);

  const view = useMemo(() => {
    const window = calendarWindow(cfg.settings, { weeks });
    const commitments = sortBy(allCommitments, "start_date");
    const today = new Date().toISOString().slice(0, 10);

    return {
      window,
      thisWeek: weekStart(today),
      active: commitments.filter((c) => c.status !== "cancelled" && day(c.end_date) >= today),
      past: commitments.filter((c) => c.status === "cancelled" || day(c.end_date) < today),
      projectOptions: sortBy(projects, "name").map((p) => ({ value: p.id, label: p.name })),
      entityOptions: sortBy(entities, "name").map((e) => ({ value: e.id, label: e.name })),
    };
    // `events` entra en las dependencias aunque no se use directamente: la carga
    // de la ventana los suma, y sin esto la grilla no se redibujaría al llegar
    // una sincronización de Outlook.
  }, [cfg.settings, weeks, allCommitments, events, projects, entities]);

  const { window } = view;
  const nowLoad = window.load.get(view.thisWeek)?.total || 0;
  const overloaded = window.weeks.filter(
    (w) => (window.load.get(w)?.total || 0) > window.capacity + 1e-9
  );
  const committedNext = window.weeks
    .slice(0, 4)
    .reduce((s, w) => s + (window.load.get(w)?.total || 0), 0);

  return (
    <>
      <Title>Calendario</Title>
      <PageHeader
        title="Calendario"
        subtitle={`Techo de ${fmtHours(window.capacity)} por semana · ${view.active.length} compromiso${
          view.active.length === 1 ? "" : "s"
        } vigente${view.active.length === 1 ? "" : "s"}`}
        action={<SyncButton />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat
          label="Esta semana"
          value={fmtHours(nowLoad)}
          hint={`de ${fmtHours(window.capacity)}`}
          tone={nowLoad > window.capacity ? "bad" : nowLoad > window.capacity * 0.85 ? "warn" : "ok"}
        />
        <Stat
          label="Próximo mes"
          value={fmtHours(committedNext)}
          hint="comprometido en cuatro semanas"
        />
        <Stat
          label="Semanas pasadas de techo"
          value={overloaded.length}
          hint={overloaded.length ? "revisa dónde apretaste" : "todo dentro de capacidad"}
          tone={overloaded.length ? "bad" : "ok"}
        />
      </div>

      {/* ---------------------------------------------------------- la grilla */}
      <Card
        className="mb-5"
        title="Carga semanal"
        action={
          <span className="flex gap-1.5">
            {VIEWS.map((v) => (
              <Link
                key={v.weeks}
                href={`/calendario?weeks=${v.weeks}`}
                className={btn(weeks === v.weeks ? "subtle" : "ghost", "sm")}
              >
                {v.label}
              </Link>
            ))}
          </span>
        }
      >
        <WeekGrid weeks={window.weeks} load={window.load} capacity={window.capacity} />
        <p className="mt-4 border-t border-line pt-3 text-[13px] leading-relaxed text-faint">
          Mantén pulsada una semana para ver qué la llena. Los exámenes y comisiones que llegan de
          Outlook entran acá como horas ocupadas, igual que cualquier compromiso.
        </p>
      </Card>

      {/* ------------------------------------------------------- compromisos */}
      <Card
        className="mb-5"
        title="Compromisos vigentes"
        subtitle="Lo que ya tienes tomado: un ramo, unas inspecciones, una investigación. Cada uno ocupa unas horas de cada semana entre dos fechas."
      >
        {view.active.length === 0 ? (
          <Empty>Nada comprometido todavía.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {view.active.map((c) => (
              <CommitmentRow
                key={c.id}
                commitment={c}
                projects={view.projectOptions}
                entities={view.entityOptions}
                kinds={cfg.options("project_kind")}
                statuses={cfg.options("commitment_status")}
                tone={cfg.tone("commitment_status", c.status)}
                statusLabel={cfg.label("commitment_status", c.status)}
              />
            ))}
          </ul>
        )}

        {/* Cuatro campos a la vista, no ocho: son los únicos que la semana
            necesita para ocuparse. Tipo, workspace, contraparte y notas se
            agregan después, si es que hacen falta. */}
        <details className="mt-5 border-t border-line pt-4">
          <summary className={`${btn("subtle")} list-none`}>+ Comprometer horas</summary>
          <Form action={createCommitment} reset className="mt-3 grid gap-3.5 sm:grid-cols-2">
            <Field label="Qué es" className="sm:col-span-2">
              <input
                name="title"
                required
                placeholder="Inspecciones Cliente X · Hormigón Armado…"
                className={inputClass}
              />
            </Field>
            <Field label="Horas por semana" hint="cuánto le vas a dedicar cada semana">
              <input name="hours_per_week" required placeholder="4" className={inputClass} />
            </Field>
            <Field label="Desde">
              <input type="date" name="start_date" required className={inputClass} />
            </Field>
            <Field label="Hasta" className="sm:col-span-2">
              <input type="date" name="end_date" required className={inputClass} />
            </Field>

            <details className="group sm:col-span-2">
              <summary className="cursor-pointer list-none text-[13px] font-semibold text-faint">
                Detalles
                <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="mt-2.5 grid gap-3.5 sm:grid-cols-2">
                <Field label="Tipo">
                  <Select name="kind" placeholder="—" options={cfg.options("project_kind")} />
                </Field>
                <Field label="Workspace">
                  <Select name="project" placeholder="—" options={view.projectOptions} />
                </Field>
                <Field label="Contraparte">
                  <Select name="entity" placeholder="—" options={view.entityOptions} />
                </Field>
                <Field label="Notas">
                  <input name="notes" className={inputClass} />
                </Field>
              </div>
            </details>

            <button type="submit" className={`${btn("primary")} sm:col-span-2`}>
              Agregar
            </button>
          </Form>
        </details>

        {view.past.length > 0 && (
          <details className="mt-4 border-t border-line pt-4">
            <summary className="cursor-pointer text-[15px] text-muted hover:text-ink">
              Terminados y anulados ({view.past.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {view.past.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-[13px] text-faint"
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="tabular-nums">
                    {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                  </span>
                  <Badge tone={cfg.tone("commitment_status", c.status)}>
                    {cfg.label("commitment_status", c.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {/* ------------------------------------------------------------- feeds */}
      <Card
        title="Calendarios externos"
        subtitle="Solo lectura. Los exámenes de grado y comisiones que programa la UACh."
      >
        {feeds.length === 0 ? (
          <Empty>Sin calendarios conectados.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {feeds.map((f) => (
              <li key={f.id} className="py-3">
                <Form action={saveCalendarFeed} className="grid gap-2.5 sm:grid-cols-2">
                  <input type="hidden" name="id" value={f.id} />
                  <input name="label" defaultValue={f.label} className={inputClass} />
                  <input
                    name="default_hours"
                    defaultValue={f.default_hours || ""}
                    title="Horas que se le imputan a un evento de día completo"
                    className={inputClass}
                  />
                  <input
                    name="url"
                    defaultValue={f.url}
                    className={cx(inputClass, "font-mono text-[12px] sm:col-span-2")}
                  />
                  <label className="flex items-center gap-2 text-[13px] text-muted">
                    <input type="checkbox" name="inactive" defaultChecked={!f.active} />
                    pausado
                  </label>
                  <button type="submit" className={btn("subtle")}>
                    Guardar
                  </button>
                </Form>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
                  {f.last_error ? (
                    <span className="text-bad">⚠ {f.last_error}</span>
                  ) : (
                    <span className="text-faint">
                      {f.event_count || 0} eventos · última lectura{" "}
                      {f.last_sync ? fmtDate(f.last_sync) : "nunca"}
                    </span>
                  )}
                  {/* Estaba solo en hover, o sea inalcanzable en un teléfono. */}
                  <Form
                    action={deleteCalendarFeed}
                    confirm={`¿Quitar el calendario "${f.label}"?`}
                    className="ml-auto"
                  >
                    <input type="hidden" name="id" value={f.id} />
                    <button
                      type="submit"
                      className="rounded-full px-3 py-1.5 text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                    >
                      Quitar
                    </button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Form
          action={saveCalendarFeed}
          reset
          className="mt-4 grid gap-2.5 border-t border-line pt-4 sm:grid-cols-2"
        >
          <input name="label" required placeholder="UACh" className={inputClass} />
          <input
            name="default_hours"
            defaultValue="4"
            title="Horas por evento de día completo"
            className={inputClass}
          />
          <input
            name="url"
            required
            placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
            className={cx(inputClass, "font-mono text-[12px] sm:col-span-2")}
          />
          <button type="submit" className={`${btn("subtle")} sm:col-span-2`}>
            Conectar
          </button>
        </Form>

        <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-faint">
          En Outlook web: Calendario → Configuración → Calendarios compartidos → Publicar un
          calendario → permiso <span className="text-muted">Puede ver todos los detalles</span> →
          copiar el enlace <span className="text-muted">ICS</span> (no el HTML). Se relee sola cada
          seis horas. Si la UACh tiene bloqueada la publicación no se genera el enlace: en ese caso
          carga los exámenes como compromisos manuales.
        </p>
      </Card>
    </>
  );
}

/**
 * Leer el .ics es de las pocas cosas que sí puede fallar por falta de red, así
 * que este botón dice en qué está en vez de fingir que fue instantáneo.
 */
function SyncButton() {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function run() {
    setState("busy");
    try {
      await syncCalendarFeeds();
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <button type="button" onClick={run} disabled={state === "busy"} className={btn("subtle", "sm")}>
      {state === "busy" ? "Leyendo…" : state === "error" ? "Sin conexión — reintentar" : "Sincronizar Outlook"}
    </button>
  );
}

/* ------------------------------------------------------------------ fila --- */

function CommitmentRow({
  commitment: c,
  projects,
  entities,
  kinds,
  statuses,
  tone,
  statusLabel,
}: {
  commitment: Commitment;
  projects: { value: string; label: string }[];
  entities: { value: string; label: string }[];
  kinds: { value: string; label: string }[];
  statuses: { value: string; label: string }[];
  tone: Tone;
  statusLabel: string;
}) {
  const fromQuote = c.source === "quote";

  return (
    <li className="py-3">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
          <span className="min-w-0 flex-1 truncate font-semibold">{c.title}</span>
          <span className="shrink-0 tabular-nums text-muted">{fmtHours(c.hours_per_week)}/sem</span>
          <span className="shrink-0 text-[13px] tabular-nums text-faint">
            {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
          </span>
          <Badge tone={tone}>{statusLabel}</Badge>
        </summary>

        <Form
          action={updateCommitment}
          key={c.updated}
          className="mt-3 grid gap-3.5 rounded-xl bg-panel2/60 p-3.5 sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="status" value={c.status} />

          <Field label="Qué es" className="sm:col-span-2">
            <input name="title" defaultValue={c.title} className={inputClass} />
          </Field>
          <Field label="Tipo">
            <Select name="kind" defaultValue={c.kind} placeholder="—" options={kinds} />
          </Field>
          <Field label="Horas por semana">
            <input name="hours_per_week" defaultValue={c.hours_per_week} className={inputClass} />
          </Field>
          <Field label="Desde">
            <input
              type="date"
              name="start_date"
              defaultValue={inputDate(c.start_date)}
              className={inputClass}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              name="end_date"
              defaultValue={inputDate(c.end_date)}
              className={inputClass}
            />
          </Field>
          <Field label="Workspace">
            <Select name="project" defaultValue={c.project} placeholder="—" options={projects} />
          </Field>
          <Field label="Contraparte">
            <Select name="entity" defaultValue={c.entity} placeholder="—" options={entities} />
          </Field>
          <Field label="Notas" className="col-span-full">
            <input name="notes" defaultValue={c.notes} className={inputClass} />
          </Field>

          <div className="col-span-full flex flex-wrap items-center gap-2">
            <button type="submit" className={btn("primary")}>
              Guardar
            </button>
          </div>
        </Form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {statuses
            .filter((s) => s.value !== c.status)
            .map((s) => (
              <Form key={s.value} action={setCommitmentStatus}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="status" value={s.value} />
                <button type="submit" className={btn("ghost", "sm")}>
                  {s.label}
                </button>
              </Form>
            ))}

          {fromQuote && c.quote && (
            <Link href={`/presupuestos/${c.quote}`} className={btn("ghost", "sm")}>
              Ver presupuesto
            </Link>
          )}

          <Form
            action={deleteCommitment}
            confirm={`¿Eliminar el compromiso "${c.title}"?`}
            className="ml-auto"
          >
            <input type="hidden" name="id" value={c.id} />
            <button type="submit" className={btn("ghost", "sm")}>
              Eliminar
            </button>
          </Form>
        </div>
      </details>
    </li>
  );
}
