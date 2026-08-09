import type { LogEntry } from "@/lib/types";
import { LOG_KIND_ICON } from "@/lib/labels";
import { getConfig } from "@/lib/config";
import { addLog, deleteLog } from "@/lib/actions";
import { fmtDate, fmtRelative, todayISO } from "@/lib/dates";
import { btn, Empty, inputClass, Select } from "./ui";

/** Entries written in this app are plain text; ones typed in the PocketBase
 *  admin editor arrive as HTML. Render each accordingly. */
function Body({ body }: { body: string }) {
  const html = body.trimStart().startsWith("<");
  if (html) {
    return (
      <div
        className="prose-log mt-1 text-[13px] leading-relaxed text-muted"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    );
  }
  return (
    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{body}</p>
  );
}

export async function LogFeed({
  projectId,
  entries,
  limit,
  showForm = true,
}: {
  projectId: string;
  entries: LogEntry[];
  limit?: number;
  showForm?: boolean;
}) {
  const cfg = await getConfig();
  const shown = limit ? entries.slice(0, limit) : entries;

  return (
    <div>
      {showForm && (
        <form
          action={addLog}
          className="mb-4 rounded-lg border border-line bg-panel2/50 px-3 py-3"
        >
          <input type="hidden" name="project" value={projectId} />

          <textarea
            name="body"
            rows={2}
            required
            placeholder="¿Qué pasó? Escríbelo como se lo contarías a alguien, no como acta."
            className={`${inputClass} resize-y`}
          />

          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_8rem_6rem]">
            <input name="title" placeholder="Título (opcional)" className={inputClass} />
            <Select name="kind" options={cfg.options("log_kind")} defaultValue="progress" />
            <input
              type="date"
              name="date"
              defaultValue={todayISO()}
              className={inputClass}
            />
            <input
              name="hours"
              inputMode="decimal"
              placeholder="horas"
              className={inputClass}
            />
          </div>

          {/* Closing the session is the cheapest moment to leave the next plan. */}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              name="next_cue"
              placeholder="Cuando… (dejar disparador para retomar)"
              className={inputClass}
            />
            <input name="next_step" placeholder="entonces…" className={inputClass} />
          </div>

          <div className="mt-2 flex justify-end">
            <button type="submit" className={btn("primary", "sm")}>
              Registrar
            </button>
          </div>
        </form>
      )}

      {shown.length === 0 ? (
        <Empty>Sin entradas todavía.</Empty>
      ) : (
        <ol className="space-y-3">
          {shown.map((e) => (
            <li key={e.id} className="group flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="text-[11px] text-muted">
                  {cfg.icon("log_kind", e.kind) || LOG_KIND_ICON[e.kind] || "•"}
                </span>
                <span className="mt-1 w-px flex-1 bg-line" />
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {e.title && <span className="text-[13px] font-medium">{e.title}</span>}
                  <span className="text-[11px] text-faint">
                    {fmtDate(e.date)} · {fmtRelative(e.date)}
                    {e.hours ? ` · ${e.hours} h` : ""}
                    {" · "}
                    {cfg.label("log_kind", e.kind)}
                  </span>
                  <form action={deleteLog} className="ml-auto">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="project" value={e.project} />
                    <button
                      type="submit"
                      className="text-[11px] text-faint opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </form>
                </div>
                {e.body && <Body body={e.body} />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
