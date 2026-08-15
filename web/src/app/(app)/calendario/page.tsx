import Link from "next/link";
import type { CalendarFeed, Commitment, Entity, Project } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { getConfig } from "@/lib/config";
import { ALIVE } from "@/lib/filters";
import { fmtDate } from "@/lib/dates";
import { inputDate } from "@/lib/dates";
import { fmtHours, weekStart } from "@/lib/capacity";
import { loadCalendarWindow } from "@/lib/schedule";
import { syncStaleFeeds } from "@/lib/ics";
import {
  createCommitment,
  deleteCalendarFeed,
  deleteCommitment,
  saveCalendarFeed,
  setCommitmentStatus,
  syncCalendarFeeds,
  updateCommitment,
} from "@/lib/actions";
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

export const metadata = { title: "Calendario · Proyectos" };

const VIEWS = [
  { weeks: 13, label: "3 meses" },
  { weeks: 26, label: "6 meses" },
  { weeks: 52, label: "1 año" },
];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string }>;
}) {
  const sp = await searchParams;
  const pb = await requirePB();
  const cfg = await getConfig();

  // Refresco perezoso: si el .ics lleva más de seis horas sin mirarse, se
  // vuelve a leer al abrir la página. No hay proceso aparte que mantener vivo,
  // y la sincronización explícita sigue estando en el botón.
  try {
    await syncStaleFeeds(pb, 6);
  } catch {
    // el error queda guardado en el feed y se muestra más abajo
  }

  const weeks = Number(sp.weeks) || 26;

  const [window, feeds, projects, entities] = await Promise.all([
    loadCalendarWindow(pb, cfg.settings, { weeks }),
    pb
      .collection("calendar_feeds")
      .getFullList<CalendarFeed>({ sort: "label" })
      .catch(() => [] as CalendarFeed[]),
    pb.collection("projects").getFullList<Project>({ filter: ALIVE, sort: "name" }),
    pb.collection("entities").getFullList<Entity>({ filter: ALIVE, sort: "name" }),
  ]);

  const commitments = await pb.collection("commitments").getFullList<Commitment>({
    filter: ALIVE,
    sort: "start_date",
    expand: "project,quote,entity",
  });

  const today = new Date().toISOString().slice(0, 10);
  const thisWeek = weekStart(today);

  const active = commitments.filter(
    (c) => c.status !== "cancelled" && String(c.end_date).slice(0, 10) >= today
  );
  const past = commitments.filter(
    (c) => c.status === "cancelled" || String(c.end_date).slice(0, 10) < today
  );

  const nowLoad = window.load.get(thisWeek)?.total || 0;
  const overloaded = window.weeks.filter(
    (w) => (window.load.get(w)?.total || 0) > window.capacity + 1e-9
  );
  const committedNext = window.weeks
    .slice(0, 4)
    .reduce((s, w) => s + (window.load.get(w)?.total || 0), 0);

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle={`Techo de ${fmtHours(window.capacity)} por semana · ${active.length} compromiso${
          active.length === 1 ? "" : "s"
        } vigente${active.length === 1 ? "" : "s"}`}
        action={
          <form action={syncCalendarFeeds}>
            <button type="submit" className={btn("subtle", "sm")}>
              Sincronizar Outlook
            </button>
          </form>
        }
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
        subtitle="Horas por semana entre dos fechas. Las clases, las inspecciones, la investigación."
      >
        {active.length === 0 ? (
          <Empty>Nada comprometido todavía.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {active.map((c) => (
              <CommitmentRow
                key={c.id}
                commitment={c}
                projects={projects}
                entities={entities}
                kinds={cfg.options("project_kind")}
                statuses={cfg.options("commitment_status")}
                tone={cfg.tone("commitment_status", c.status)}
                statusLabel={cfg.label("commitment_status", c.status)}
              />
            ))}
          </ul>
        )}

        <details className="mt-5 border-t border-line pt-4">
          <summary className={`${btn("subtle")} list-none`}>+ Nuevo compromiso</summary>
          <form action={createCommitment} className="mt-3 grid gap-3.5 sm:grid-cols-2">
            <Field label="Qué es" className="sm:col-span-2">
              <input
                name="title"
                required
                placeholder="Inspecciones Cliente X · Hormigón Armado…"
                className={inputClass}
              />
            </Field>
            <Field label="Tipo">
              <Select name="kind" placeholder="—" options={cfg.options("project_kind")} />
            </Field>
            <Field label="Horas por semana">
              <input name="hours_per_week" required placeholder="4" className={inputClass} />
            </Field>
            <Field label="Desde">
              <input type="date" name="start_date" required className={inputClass} />
            </Field>
            <Field label="Hasta">
              <input type="date" name="end_date" required className={inputClass} />
            </Field>
            <Field label="Workspace">
              <Select
                name="project"
                placeholder="—"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
            <Field label="Contraparte">
              <Select
                name="entity"
                placeholder="—"
                options={entities.map((e) => ({ value: e.id, label: e.name }))}
              />
            </Field>
            <Field label="Notas" className="sm:col-span-2">
              <input name="notes" className={inputClass} />
            </Field>
            <button type="submit" className={`${btn("primary")} sm:col-span-2`}>
              Agregar
            </button>
          </form>
        </details>

        {past.length > 0 && (
          <details className="mt-4 border-t border-line pt-4">
            <summary className="cursor-pointer text-[15px] text-muted hover:text-ink">
              Terminados y anulados ({past.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {past.map((c) => (
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
                <form action={saveCalendarFeed} className="grid gap-2.5 sm:grid-cols-2">
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
                </form>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
                  {f.last_error ? (
                    <span className="text-bad">⚠ {f.last_error}</span>
                  ) : (
                    <span className="text-faint">
                      {f.event_count || 0} eventos · última lectura{" "}
                      {f.last_sync ? fmtDate(f.last_sync) : "nunca"}
                    </span>
                  )}
                  {/* Was hover-only, i.e. unreachable on a phone. */}
                  <form action={deleteCalendarFeed} className="ml-auto">
                    <input type="hidden" name="id" value={f.id} />
                    <button
                      type="submit"
                      className="rounded-full px-3 py-1.5 text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                    >
                      Quitar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          action={saveCalendarFeed}
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
        </form>

        <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-faint">
          En Outlook web: Calendario → Configuración → Calendarios compartidos → Publicar un
          calendario → permiso <span className="text-muted">Puede ver todos los detalles</span> →
          copiar el enlace <span className="text-muted">ICS</span> (no el HTML). Se relee sola
          cada seis horas. Si la UACh tiene bloqueada la publicación, el enlace no se genera:
          en ese caso descarga el .ics y usa una URL propia, o carga los exámenes como
          compromisos manuales.
        </p>
      </Card>
    </>
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
  projects: Project[];
  entities: Entity[];
  kinds: { value: string; label: string }[];
  statuses: { value: string; label: string }[];
  tone: "neutral" | "accent" | "ok" | "warn" | "bad";
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

        <form
          action={updateCommitment}
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
            <Select
              name="project"
              defaultValue={c.project}
              placeholder="—"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Contraparte">
            <Select
              name="entity"
              defaultValue={c.entity}
              placeholder="—"
              options={entities.map((e) => ({ value: e.id, label: e.name }))}
            />
          </Field>
          <Field label="Notas" className="col-span-full">
            <input name="notes" defaultValue={c.notes} className={inputClass} />
          </Field>

          <div className="col-span-full flex flex-wrap items-center gap-2">
            <button type="submit" className={btn("primary")}>
              Guardar
            </button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {statuses
            .filter((s) => s.value !== c.status)
            .map((s) => (
              <form key={s.value} action={setCommitmentStatus}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="status" value={s.value} />
                <button type="submit" className={btn("ghost", "sm")}>
                  {s.label}
                </button>
              </form>
            ))}

          {fromQuote && c.quote && (
            <Link href={`/presupuestos/${c.quote}`} className={btn("ghost", "sm")}>
              Ver presupuesto
            </Link>
          )}

          <form action={deleteCommitment} className="ml-auto">
            <input type="hidden" name="id" value={c.id} />
            <button type="submit" className={btn("ghost", "sm")}>
              Eliminar
            </button>
          </form>
        </div>
      </details>
    </li>
  );
}
