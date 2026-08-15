import Link from "next/link";
import type { InboxItem, Project } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { deleteInboxItem, dropInboxItem, triage } from "@/lib/actions";
import { getConfig } from "@/lib/config";
import { alive } from "@/lib/filters";
import { fmtRelative } from "@/lib/dates";
import { btn, Card, Empty, Group, inputClass, PageHeader, Row, Select } from "@/components/ui";

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

      <p className="mb-6 rounded-2xl bg-row px-4 py-4 text-[15px] leading-relaxed text-muted">
        Anotar no cierra el bucle. Una meta pendiente sigue interrumpiendo — con pensamientos
        intrusivos y peor rendimiento en cosas no relacionadas — hasta que existe un{" "}
        <span className="font-semibold text-ink">plan concreto</span>, aunque no la hayas hecho. Por
        eso cada ítem sale de acá convertido en algo con destino y momento.
      </p>

      {open.length === 0 ? (
        <Empty>Nada pendiente de clasificar.</Empty>
      ) : (
        <div className="space-y-4">
          {open.map((item) => (
            <Card key={item.id}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <p className="text-[17px] font-semibold leading-snug">{item.text}</p>
                <span className="shrink-0 text-[12px] text-faint">{fmtRelative(item.created)}</span>
              </div>

              <form action={triage} className="grid gap-2.5 sm:grid-cols-2">
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
                  className={inputClass}
                />
                <input
                  name="next_step"
                  placeholder="entonces… (vacío = usa el texto de arriba)"
                  className={inputClass}
                />

                <Select name="priority" options={cfg.options("priority")} defaultValue="normal" />
                <input type="date" name="due_date" className={inputClass} />

                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  <button type="submit" className={btn("primary")}>
                    Darle destino
                  </button>
                  <button
                    type="submit"
                    formAction={dropInboxItem}
                    className={btn("ghost")}
                    title="Decidir que no se hace"
                  >
                    Descartar
                  </button>
                  <button
                    type="submit"
                    formAction={deleteInboxItem}
                    className={btn("ghost")}
                    aria-label="Borrar"
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
        <div className="mt-8">
          <Group title="Ya procesado">
            {recent.items.map((i) => (
              <Row
                key={i.id}
                href={i.expand?.project ? `/w/${i.project}` : undefined}
                label={i.text}
                hint={[i.outcome || "—", i.expand?.project?.name].filter(Boolean).join(" · ")}
              />
            ))}
          </Group>
        </div>
      )}

      {open.length === 0 && recent.items.length === 0 && (
        <p className="mt-6 text-center text-[13px] text-faint">
          Captura con el botón ＋ y vuelve acá a darle destino.{" "}
          <Link href="/" className="text-accent">
            Ir a Hoy
          </Link>
        </p>
      )}
    </>
  );
}
