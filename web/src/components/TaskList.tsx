import Link from "next/link";
import type { Task } from "@/lib/types";
import { getConfig } from "@/lib/config";
import { addTask, deleteTask, setTaskStatus } from "@/lib/actions";
import { daysUntil, fmtRelative } from "@/lib/dates";
import { btn, cx, Empty, inputClass, Select } from "./ui";

function urgencyClass(due: string) {
  const n = daysUntil(due);
  if (n === null) return "text-faint";
  if (n < 0) return "text-bad";
  if (n <= 3) return "text-warn";
  return "text-muted";
}

export async function TaskList({
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
  const cfg = await getConfig();
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
                className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-panel2/70"
              >
                <form action={setTaskStatus} className="flex shrink-0">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="project" value={t.project} />
                  <input type="hidden" name="status" value={done ? "todo" : "done"} />
                  <button
                    type="submit"
                    aria-label={done ? "Reabrir" : "Marcar lista"}
                    className={cx(
                      "grid h-4 w-4 place-items-center rounded border text-[10px] transition-colors",
                      done
                        ? "border-ok/50 bg-ok/15 text-ok"
                        : "border-line2 text-transparent hover:border-accent/60"
                    )}
                  >
                    ✓
                  </button>
                </form>

                <div className="min-w-0 flex-1">
                  <span
                    className={cx(
                      "text-[13px]",
                      done && "text-faint line-through decoration-line2"
                    )}
                  >
                    {t.title}
                  </span>
                  {showProject && t.expand?.project && (
                    <Link
                      href={`/w/${t.project}`}
                      className="ml-2 text-[11px] text-faint hover:text-accent"
                    >
                      {t.expand.project.name}
                    </Link>
                  )}
                </div>

                {t.due_date && !done && (
                  <span className={cx("shrink-0 text-[11px]", urgencyClass(t.due_date))}>
                    {fmtRelative(t.due_date)}
                  </span>
                )}

                <form action={deleteTask} className="shrink-0">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="project" value={t.project} />
                  <button
                    type="submit"
                    className="text-[11px] text-faint opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && projectId && (
        <form action={addTask} className="mt-3 grid gap-2 sm:grid-cols-[1fr_7rem_9rem_5rem]">
          <input type="hidden" name="project" value={projectId} />
          <input name="title" required placeholder="Nueva tarea" className={inputClass} />
          <Select name="priority" options={cfg.options("priority")} defaultValue="normal" />
          <input type="date" name="due_date" className={inputClass} />
          <button type="submit" className={btn("subtle", "sm")}>
            Agregar
          </button>
        </form>
      )}
    </div>
  );
}
