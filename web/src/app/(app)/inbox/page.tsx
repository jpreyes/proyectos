import Link from "next/link";
import type { InboxItem, Project } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { deleteInboxItem, dropInboxItem, triage } from "@/lib/actions";
import { getConfig } from "@/lib/config";
import { alive } from "@/lib/filters";
import { fmtRelative } from "@/lib/dates";
import { btn, Card, Empty, inputClass, PageHeader, Select } from "@/components/ui";

export const metadata = { title: "Bandeja · Proyectos" };

const ACTIVE = ["idea", "active", "paused", "waiting"];

export default async function InboxPage() {
  const pb = await requirePB();

  const cfg = await getConfig();

  const [open, recent, projects] = await Promise.all([
    pb
      .collection("inbox")
      .getFullList<InboxItem>({ filter: alive('status = "open"'), sort: "created" }),
    pb.collection("inbox").getList<InboxItem>(1, 15, {
      filter: alive('status != "open"'),
      sort: "-updated",
      expand: "project",
    }),
    pb.collection("projects").getFullList<Project>({
      filter: alive(`(${ACTIVE.map((s) => `status = "${s}"`).join(" || ")})`),
      sort: "name",
    }),
  ]);

  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  return (
    <>
      <PageHeader
        title="Bandeja"
        subtitle={
          open.length === 0
            ? "Vacía."
            : `${open.length} cosa${open.length === 1 ? "" : "s"} esperando destino`
        }
      />

      <p className="mb-5 max-w-2xl rounded-lg border border-line bg-panel/50 px-4 py-3 text-[13px] leading-relaxed text-muted">
        Anotar no cierra el bucle. Una meta pendiente sigue interrumpiendo — con pensamientos
        intrusivos y peor rendimiento en cosas no relacionadas — hasta que existe un{" "}
        <span className="text-ink">plan concreto</span>, aunque no la hayas hecho. Por eso cada
        ítem sale de acá convertido en algo con destino y momento.
      </p>

      {open.length === 0 ? (
        <Empty>Nada pendiente de clasificar.</Empty>
      ) : (
        <div className="space-y-3">
          {open.map((item) => (
            <Card key={item.id} bodyClassName="px-4 py-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="text-[14px] leading-snug">{item.text}</p>
                <span className="shrink-0 text-[11px] text-faint">
                  {fmtRelative(item.created)}
                </span>
              </div>

              <form action={triage} className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="text" value={item.text} />

                <Select
                  name="dest"
                  defaultValue="task"
                  options={[
                    { value: "plan", label: "Plan si-entonces" },
                    { value: "task", label: "Tarea" },
                    { value: "log", label: "Bitácora" },
                  ]}
                />
                <Select
                  name="project"
                  placeholder="¿En qué workspace?"
                  options={projectOptions}
                  required
                />

                <input
                  name="next_cue"
                  placeholder="Cuando… (solo para plan)"
                  className={`${inputClass} sm:col-span-1`}
                />
                <input
                  name="next_step"
                  placeholder="entonces… (vacío = usa el texto de arriba)"
                  className={inputClass}
                />

                <Select name="priority" options={cfg.options("priority")} defaultValue="normal" />

                <div className="flex flex-wrap gap-2">
                  <input type="date" name="due_date" className={`${inputClass} max-w-[10rem]`} />
                  <button type="submit" className={btn("primary", "sm")}>
                    Darle destino
                  </button>
                  <button
                    type="submit"
                    formAction={dropInboxItem}
                    className={btn("ghost", "sm")}
                    title="Decidir que no se hace"
                  >
                    Descartar
                  </button>
                  <button
                    type="submit"
                    formAction={deleteInboxItem}
                    className={btn("ghost", "sm")}
                  >
                    ✕
                  </button>
                </div>
              </form>
            </Card>
          ))}
        </div>
      )}

      {recent.items.length > 0 && (
        <Card className="mt-6" title="Ya procesado" subtitle={`Últimos ${recent.items.length}`}>
          <ul className="divide-y divide-line">
            {recent.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-muted">{i.text}</span>
                <span className="shrink-0 text-[11px] text-faint">{i.outcome || "—"}</span>
                {i.expand?.project && (
                  <Link
                    href={`/w/${i.project}`}
                    className="shrink-0 text-[11px] text-faint hover:text-accent"
                  >
                    {i.expand.project.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
