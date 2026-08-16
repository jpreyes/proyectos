"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CalendarEvent, CalendarFeed, Commitment, Entity, Project } from "@/lib/types";
import type { Tone } from "@/lib/labels";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { day, sortBy } from "@/lib/local/query";
import { calendarWindow } from "@/lib/local/schedule";
import { eventDayKey, fmtClock, fmtDate, fmtDayLong, inputDate } from "@/lib/dates";
import {
  buildWeekLoad,
  fmtHours,
  type WeekLoad,
  weekEnd,
  weekSpanLabel,
  monthTitle,
  monthWeeks,
  shiftMonth,
  weekStart,
} from "@/lib/capacity";
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
import { MonthGrid, MonthLegend } from "@/components/MonthGrid";
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

  // Dos maneras de mirar lo mismo. La de semanas responde "¿cuánto me queda
  // libre?"; la de mes, "¿qué pasa el jueves?". Ninguna reemplaza a la otra, y
  // cuál estabas mirando va en la URL para que volver no te devuelva a la otra.
  const monthView = sp.get("vista") === "mes";
  const month = sp.get("mes") || new Date().toISOString().slice(0, 7);
  const [pickedDay, setPickedDay] = useState("");
  const [pickedWeek, setPickedWeek] = useState("");
  /** Fechas con las que se abre el formulario de comprometer horas. */
  const [prefill, setPrefill] = useState<{ start: string; end: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const formRef = useRef<HTMLDetailsElement>(null);

  /**
   * Abrir el formulario ya rellenado con un tramo del calendario.
   *
   * Es la mitad que faltaba: la grilla decía dónde hay hueco y después había
   * que bajar, abrir el formulario y volver a escribir a mano las fechas que
   * uno acababa de mirar.
   */
  function commitRange(start: string, end: string) {
    setPrefill({ start, end });
    setFormOpen(true);
    // El navegador necesita el cuadro ya abierto para saber dónde está.
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }

  const allCommitments = useCollection<Commitment>("commitments");
  const events = useCollection<CalendarEvent>("calendar_events");
  const feeds = useCollection<CalendarFeed>("calendar_feeds");
  const projects = useCollection<Project>("projects");
  const entities = useCollection<Entity>("entities");

  // Refresco perezoso de los .ics. Es lo único de esta pantalla que necesita
  // servidor —los calendarios viven en otro origen— así que se pide y se
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
      today,
      thisWeek: weekStart(today),
      active: commitments.filter((c) => c.status !== "cancelled" && day(c.end_date) >= today),
      past: commitments.filter((c) => c.status === "cancelled" || day(c.end_date) < today),
      projectOptions: sortBy(projects, "name").map((p) => ({ value: p.id, label: p.name })),
      entityOptions: sortBy(entities, "name").map((e) => ({ value: e.id, label: e.name })),
    };
    // `events` entra en las dependencias aunque no se use directamente: la carga
    // de la ventana los suma, y sin esto la grilla no se redibujaría al llegar
    // una sincronización de los calendarios.
  }, [cfg.settings, weeks, allCommitments, events, projects, entities]);

  /**
   * La carga del mes se calcula aparte, no se saca de `window`.
   *
   * `window` arranca en la semana actual y mira hacia adelante, así que un mes
   * pasado —o uno más allá del horizonte— vendría con todas sus semanas en
   * cero, y una columna de horas en cero es peor que no tenerla: parece un mes
   * libre.
   */
  const monthLoad = useMemo(
    () => buildWeekLoad(monthWeeks(month), allCommitments, events),
    [month, allCommitments, events]
  );

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
        title={monthView ? "Mes" : "Carga semanal"}
        action={
          <span className="flex gap-1.5">
            <Link href="/calendario" className={btn(monthView ? "ghost" : "subtle", "sm")}>
              Semanas
            </Link>
            <Link
              href={`/calendario?vista=mes&mes=${month}`}
              className={btn(monthView ? "subtle" : "ghost", "sm")}
            >
              Mes
            </Link>
          </span>
        }
      >
        {monthView ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              {/* `capitalize` pondría "Agosto De 2026": solo la primera letra. */}
              <span className="text-[17px] font-semibold first-letter:uppercase">
                {monthTitle(month)}
              </span>
              <span className="flex gap-1">
                <Link
                  href={`/calendario?vista=mes&mes=${shiftMonth(month, -1)}`}
                  aria-label="Mes anterior"
                  className={btn("ghost", "sm")}
                >
                  ‹
                </Link>
                <Link href="/calendario?vista=mes" className={btn("ghost", "sm")}>
                  Hoy
                </Link>
                <Link
                  href={`/calendario?vista=mes&mes=${shiftMonth(month, 1)}`}
                  aria-label="Mes siguiente"
                  className={btn("ghost", "sm")}
                >
                  ›
                </Link>
              </span>
            </div>

            <MonthGrid
              month={month}
              commitments={allCommitments}
              events={events}
              load={monthLoad}
              capacity={window.capacity}
              today={view.today}
              selected={pickedDay}
              onSelect={setPickedDay}
            />

            {pickedDay && (
              <DayDetail
                day={pickedDay}
                commitments={allCommitments}
                events={events}
                tone={(c: Commitment) => cfg.tone("commitment_status", c.status)}
                statusLabel={(c: Commitment) => cfg.label("commitment_status", c.status)}
                onCommit={() => commitRange(pickedDay, pickedDay)}
              />
            )}

            <MonthLegend capacity={window.capacity} />
          </>
        ) : (
          <>
            <div className="mb-3 flex gap-1.5">
              {VIEWS.map((v) => (
                <Link
                  key={v.weeks}
                  href={`/calendario?weeks=${v.weeks}`}
                  className={btn(weeks === v.weeks ? "subtle" : "ghost", "sm")}
                >
                  {v.label}
                </Link>
              ))}
            </div>
            <WeekGrid
              weeks={window.weeks}
              load={window.load}
              capacity={window.capacity}
              selected={pickedWeek}
              onSelect={(w) => setPickedWeek((prev) => (prev === w ? "" : w))}
            />

            {pickedWeek ? (
              <WeekDetail
                week={pickedWeek}
                load={window.load}
                capacity={window.capacity}
                onCommit={() => commitRange(pickedWeek, weekEnd(pickedWeek))}
                onMonth={`/calendario?vista=mes&mes=${pickedWeek.slice(0, 7)}`}
              />
            ) : (
              <p className="mt-4 border-t border-line pt-3 text-[13px] leading-relaxed text-faint">
                Toca una semana para ver qué la llena y comprometer horas ahí mismo. Los eventos de
                los calendarios que conectes cuentan como horas ocupadas, igual que un compromiso.
              </p>
            )}
          </>
        )}
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
        <details
          ref={formRef}
          open={formOpen}
          onToggle={(e) => setFormOpen((e.target as HTMLDetailsElement).open)}
          className="mt-5 border-t border-line pt-4"
        >
          <summary className={`${btn("subtle")} list-none`}>+ Comprometer horas</summary>
          <Form
            action={createCommitment}
            reset
            // Remontar al cambiar el tramo: son campos no controlados, así que
            // sin esto el segundo "comprometer esta semana" mostraría las fechas
            // del primero.
            key={prefill ? `${prefill.start}-${prefill.end}` : "libre"}
            className="mt-3 grid gap-3.5 sm:grid-cols-2"
          >
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
              <input
                type="date"
                name="start_date"
                required
                defaultValue={prefill?.start || ""}
                className={inputClass}
              />
            </Field>
            <Field label="Hasta" className="sm:col-span-2">
              <input
                type="date"
                name="end_date"
                required
                defaultValue={prefill?.end || ""}
                className={inputClass}
              />
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
        title="Calendarios conectados"
        subtitle="Cualquier calendario que publique una dirección iCal: el de tu organización, el personal, el de la universidad. Se leen, nunca se escriben, y sus horas se suman a las de tus compromisos."
      >
        {feeds.length === 0 ? (
          <Empty>Ninguno conectado todavía.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {feeds.map((f) => (
              <li key={f.id} className="py-3">
                <Form action={saveCalendarFeed} className="grid gap-2.5 sm:grid-cols-2">
                  <input type="hidden" name="id" value={f.id} />
                  {/* Con `title` la explicación solo existía al pasar el mouse,
                      o sea en ningún teléfono. Va en el marcador de posición. */}
                  <input
                    name="label"
                    defaultValue={f.label}
                    aria-label="Nombre del calendario"
                    placeholder="Nombre"
                    className={inputClass}
                  />
                  <input
                    name="default_hours"
                    defaultValue={f.default_hours || ""}
                    aria-label="Horas por evento de día completo"
                    placeholder="Horas por evento de día completo"
                    className={inputClass}
                  />
                  <input
                    name="url"
                    defaultValue={f.url}
                    aria-label="Dirección iCal"
                    placeholder="https://…/calendar.ics"
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
          <Field label="Nombre" hint="cómo lo vas a reconocer acá">
            <input name="label" required placeholder="Universidad · Personal · Familia" className={inputClass} />
          </Field>
          <Field label="Horas por evento de día completo" hint="cuánto ocupa uno que no trae hora">
            <input name="default_hours" defaultValue="4" className={inputClass} />
          </Field>
          <Field label="Dirección del calendario" className="sm:col-span-2" hint="termina en .ics — sirve http, https o webcal">
            <input
              name="url"
              required
              placeholder="https://…/basic.ics"
              className={cx(inputClass, "font-mono text-[12px]")}
            />
          </Field>
          <button type="submit" className={`${btn("subtle")} sm:col-span-2`}>
            Conectar
          </button>
        </Form>

        {/* Plegado: quien ya tiene el enlace no necesita leer nada, y quien no
            lo tiene necesita justo el clic que su proveedor esconde. */}
        <details className="mt-4 border-t border-line pt-4">
          <summary className="cursor-pointer list-none text-[13px] font-semibold text-faint">
            ¿Dónde encuentro esa dirección?
            <span className="ml-1 inline-block transition-transform">›</span>
          </summary>
          <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-faint">
            <li>
              <span className="font-semibold text-muted">Google Calendar</span> — Configuración del
              calendario → Integrar calendario → <span className="text-ink">Dirección secreta en
              formato iCal</span>. Es privada: quien la tenga ve tu calendario.
            </li>
            <li>
              <span className="font-semibold text-muted">Outlook / Microsoft 365</span> — Calendario →
              Configuración → Calendarios compartidos → Publicar un calendario → permiso{" "}
              <span className="text-ink">Puede ver todos los detalles</span> → copiar el enlace{" "}
              <span className="text-ink">ICS</span>, no el HTML. Si tu organización tiene bloqueada la
              publicación, el enlace no se genera y hay que pedírselo a quien administra el correo.
            </li>
            <li>
              <span className="font-semibold text-muted">Apple / iCloud</span> — Calendario →
              Compartir → Calendario público → copiar el enlace{" "}
              <span className="text-ink">webcal://</span>.
            </li>
            <li>
              <span className="font-semibold text-muted">Cualquier otro</span> — sirve cualquier
              dirección que entregue un archivo iCal: Nextcloud, Zimbra, Proton, el calendario de un
              equipo deportivo. Se releen solas cada seis horas y esta app nunca escribe en ellas.
            </li>
          </ul>
        </details>
      </Card>
    </>
  );
}

/* ---------------------------------------------------------- semana suelta --- */

/**
 * Qué hay dentro de una semana.
 *
 * La grilla respondía "cuánto" y no "de qué": una barra al 90% no dice si es un
 * ramo, tres inspecciones o un examen de grado que llegó de un calendario
 * externo. `buildWeekLoad` ya guardaba ese desglose y nadie lo mostraba.
 */
function WeekDetail({
  week,
  load,
  capacity,
  onCommit,
  onMonth,
}: {
  week: string;
  load: Map<string, WeekLoad>;
  capacity: number;
  onCommit: () => void;
  onMonth: string;
}) {
  const row = load.get(week);
  const total = row?.total || 0;
  const free = capacity - total;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[17px] font-semibold">{weekSpanLabel(week)}</h3>
        <span
          className={cx(
            "text-[13px] tabular-nums",
            free < 0 ? "font-semibold text-bad" : "text-muted"
          )}
        >
          {fmtHours(total)} de {fmtHours(capacity)}
          {free >= 0 ? ` · quedan ${fmtHours(free)}` : ` · te pasas por ${fmtHours(-free)}`}
        </span>
      </div>

      {row && row.parts.length > 0 ? (
        <ul className="space-y-1.5 text-[13px]">
          {row.parts.map((p, i) => (
            <li key={`${p.id}-${i}`} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 flex-1 truncate">
                {p.label}
                {p.source === "event" && <span className="ml-2 text-faint">calendario</span>}
                {p.status === "tentative" && <span className="ml-2 text-warn">tentativo</span>}
              </span>
              <span className="shrink-0 tabular-nums text-muted">{fmtHours(p.hours)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-faint">Esta semana está libre.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onCommit} className={btn("primary", "sm")}>
          Comprometer horas acá
        </button>
        <Link href={onMonth} className={btn("subtle", "sm")}>
          Ver el mes
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ día suelto --- */

/**
 * Lo que ocupa un día concreto.
 *
 * En la cuadrícula una celda del teléfono mide unos 50 px: ahí no cabe un
 * título, así que las bandas son color y los eventos son puntos. En vez de
 * achicar el texto hasta volverlo decorativo, el detalle se lee acá abajo al
 * tocar el día.
 *
 * Del compromiso se muestra su ritmo semanal y no una fracción diaria inventada:
 * «12 h/sem» es lo que se contrató; repartirlo en 1,7 h el martes sería precisión
 * falsa sobre un dato que nadie prometió así.
 */
function DayDetail({
  day,
  commitments,
  events,
  tone,
  statusLabel,
  onCommit,
}: {
  day: string;
  commitments: Commitment[];
  events: CalendarEvent[];
  tone: (c: Commitment) => Tone;
  statusLabel: (c: Commitment) => string;
  onCommit: () => void;
}) {
  const active = commitments.filter(
    (c) =>
      c.status !== "cancelled" &&
      String(c.start_date).slice(0, 10) <= day &&
      String(c.end_date).slice(0, 10) >= day
  );
  const dayEvents = events
    .filter((e) => eventDayKey(e.start, e.all_day) === day)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h3 className="mb-2 text-[15px] font-semibold first-letter:uppercase">{fmtDayLong(day)}</h3>

      {active.length === 0 && dayEvents.length === 0 ? (
        <p className="text-[13px] text-faint">Nada ocupa este día.</p>
      ) : (
        <ul className="space-y-2">
          {dayEvents.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span className="w-12 shrink-0 tabular-nums text-warn">
                {e.all_day ? "todo" : fmtClock(e.start)}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{e.title || "(sin título)"}</span>
              <span className="tabular-nums text-faint">{fmtHours(e.hours || 0)}</span>
            </li>
          ))}
          {active.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span className="w-12 shrink-0 text-faint">—</span>
              <span className="min-w-0 flex-1 truncate text-ink">{c.title}</span>
              <span className="tabular-nums text-muted">
                {fmtHours(c.hours_per_week || 0)}/sem
              </span>
              <Badge tone={tone(c)}>{statusLabel(c)}</Badge>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onCommit} className={`${btn("subtle", "sm")} mt-3`}>
        Comprometer horas desde este día
      </button>
    </div>
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
      {state === "busy" ? "Leyendo…" : state === "error" ? "Sin conexión — reintentar" : "Leer calendarios"}
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
