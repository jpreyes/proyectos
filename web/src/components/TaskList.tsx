"use client";

import Link from "next/link";
import type { Project, Task } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { index } from "@/lib/local/query";
import { addTask, deleteTask, setTaskStatus } from "@/lib/local/actions";
import { daysUntil, fmtRelative } from "@/lib/dates";
import { Form } from "./form";
import { btn, cx, Empty, Field, inputClass, Select } from "./ui";

function urgencyClass(due: string) {
  const n = daysUntil(due);
  if (n === null) return "text-faint";
  if (n < 0) return "text-bad";
  if (n <= 3) return "text-warn";
  return "text-muted";
}

export function TaskList({
  tasks,
  projectId,
  showProject = false,
  showForm = true,
}: {
  tasks: Task[];
  projectId?: string;
  showProject?: boolean;
  showForm?: boolean;
}) {
  const cfg = useConfig();
  // Lo que antes venía en `expand`: con la réplica en memoria, resolver una
  // relación es buscar en un mapa.
  const projects = index(useCollection<Project>("projects"));

  return (
    <div>
      {tasks.length === 0 ? (
        <Empty>Nada pendiente.</Empty>
      ) : (
        <ul className="space-y-0.5">
          {tasks.map((t) => {
            const done = t.status === "done";
            return (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-panel2/70"
              >
                {/* 24px, no 16: es el control más tocado de la app y estaba por
                    debajo de toda guía de área táctil. */}
                <Form action={setTaskStatus} className="flex shrink-0">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="status" value={done ? "todo" : "done"} />
                  <button
                    type="submit"
                    aria-label={done ? "Reabrir" : "Marcar lista"}
                    className={cx(
                      "grid h-6 w-6 place-items-center rounded-md border-2 text-[13px] transition-colors",
                      done
                        ? "border-ok/50 bg-ok/15 text-ok"
                        : "border-line2 text-transparent hover:border-accent/60"
                    )}
                  >
                    ✓
                  </button>
                </Form>

                <div className="min-w-0 flex-1 py-1">
                  <span
                    className={cx("text-[15px]", done && "text-faint line-through decoration-line2")}
                  >
                    {t.title}
                  </span>
                  {showProject && projects.get(t.project) && (
                    <Link href={`/w/${t.project}`} className="ml-2 text-[13px] text-faint">
                      {projects.get(t.project)?.name}
                    </Link>
                  )}
                </div>

                {/* "en 2 días" a secas se lee igual de bien como "esto empieza en dos
                    días", que es justo lo contrario: acá el comienzo lo codifican
                    `next_cue` + `next_step`, no esta fecha. La palabra "Plazo" es la
                    que ya usa la ficha del proyecto para `due_date`, y el color se
                    queda en la parte que cuenta los días para que la urgencia siga
                    leyéndose de un vistazo. */}
                {t.due_date && !done && (
                  <span
                    className={cx(
                      "shrink-0 whitespace-nowrap text-[13px]",
                      urgencyClass(t.due_date)
                    )}
                  >
                    <span className="text-faint">Plazo · </span>
                    {fmtRelative(t.due_date)}
                  </span>
                )}

                {/* Estaba en opacity-0 hasta el hover, o sea que en una pantalla
                    táctil no existía. Atenuado pero presente. */}
                <Form action={deleteTask} className="shrink-0">
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    type="submit"
                    aria-label={`Borrar tarea: ${t.title}`}
                    className="grid h-8 w-8 place-items-center rounded-full text-[13px] text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                  >
                    ✕
                  </button>
                </Form>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && projectId && (
        <Form action={addTask} reset className="mt-4 grid gap-2.5 sm:grid-cols-2">
          <input type="hidden" name="project" value={projectId} />
          <input
            name="title"
            required
            placeholder="Nueva tarea"
            className={`${inputClass} sm:col-span-2`}
          />
          <Field label="Prioridad">
            <Select name="priority" options={cfg.options("priority")} defaultValue="normal" />
          </Field>
          <Field label="Plazo" hint="cuándo tiene que estar lista">
            <input type="date" name="due_date" className={inputClass} />
          </Field>
          <button type="submit" className={`${btn("subtle")} sm:col-span-2`}>
            Agregar
          </button>
        </Form>
      )}
    </div>
  );
}
