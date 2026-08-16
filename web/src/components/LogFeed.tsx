"use client";

import type { LogEntry } from "@/lib/types";
import { LOG_KIND_ICON } from "@/lib/labels";
import { useConfig } from "@/lib/local/config";
import { addLog, deleteLog } from "@/lib/local/actions";
import { fmtDate, fmtRelative, todayISO } from "@/lib/dates";
import { Form } from "./form";
import { btn, Empty, inputClass, Select } from "./ui";

/** Lo escrito en esta app es texto plano; lo tecleado en el admin de PocketBase
 *  llega como HTML. Cada uno se pinta como corresponde. */
function Body({ body }: { body: string }) {
  const html = body.trimStart().startsWith("<");
  if (html) {
    return (
      <div
        className="prose-log mt-1.5 text-[15px] leading-relaxed text-muted"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    );
  }
  return (
    <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-muted">{body}</p>
  );
}

export function LogFeed({
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
  const cfg = useConfig();
  const shown = limit ? entries.slice(0, limit) : entries;

  return (
    <div>
      {showForm && (
        <Form action={addLog} reset className="mb-5 rounded-2xl bg-panel2/60 p-3.5">
          <input type="hidden" name="project" value={projectId} />

          <textarea
            name="body"
            rows={2}
            required
            placeholder="¿Qué pasó? Escríbelo como se lo contarías a alguien, no como acta."
            className={`${inputClass} resize-y`}
          />

          {/* Solo el cuerpo es obligatorio. Los ocho campos secundarios estaban
              abiertos en cada workspace, lo que hacía que una nota de dos
              segundos pareciera un formulario que rellenar. */}
          <details className="group mt-2.5">
            <summary className="cursor-pointer list-none px-1 text-[13px] font-semibold text-faint">
              Detalles
              <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
            </summary>

            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              <input name="title" placeholder="Título (opcional)" className={inputClass} />
              <Select name="kind" options={cfg.options("log_kind")} defaultValue="progress" />
              <input type="date" name="date" defaultValue={todayISO()} className={inputClass} />
              <input name="hours" inputMode="decimal" placeholder="horas" className={inputClass} />

              {/* Cerrar la sesión es el momento más barato para dejar el siguiente plan. */}
              <input
                name="next_cue"
                placeholder="Cuando… (dejar disparador para retomar)"
                className={inputClass}
              />
              <input name="next_step" placeholder="entonces…" className={inputClass} />
            </div>
          </details>

          <div className="mt-3 flex justify-end">
            <button type="submit" className={btn("primary")}>
              Registrar
            </button>
          </div>
        </Form>
      )}

      {shown.length === 0 ? (
        <Empty>Sin entradas todavía.</Empty>
      ) : (
        <ol className="space-y-4">
          {shown.map((e) => (
            <li key={e.id} className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="text-[13px] text-muted">
                  {cfg.icon("log_kind", e.kind) || LOG_KIND_ICON[e.kind] || "•"}
                </span>
                <span className="mt-1.5 w-px flex-1 bg-line" />
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {e.title && <span className="text-[15px] font-semibold">{e.title}</span>}
                  <span className="text-[12px] text-faint">
                    {fmtDate(e.date)} · {fmtRelative(e.date)}
                    {e.hours ? ` · ${e.hours} h` : ""}
                    {" · "}
                    {cfg.label("log_kind", e.kind)}
                  </span>
                  <Form action={deleteLog} className="ml-auto">
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      aria-label="Borrar entrada"
                      className="grid h-8 w-8 place-items-center rounded-full text-[12px] text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                    >
                      ✕
                    </button>
                  </Form>
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
