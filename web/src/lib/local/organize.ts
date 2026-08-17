"use client";

/**
 * El lado del dispositivo del asistente: qué se le manda y qué se hace con lo
 * que devuelve.
 *
 * El contexto se arma **acá** y no en el servidor porque acá está la réplica —
 * el servidor tendría que ir a buscar a PocketBase lo que el navegador ya
 * tiene—, pero sobre todo porque así hay un solo lugar donde se decide qué sale
 * de esta máquina, y se puede leer de una sentada. Es un índice: nombres e ids.
 * No van los cuerpos de la bitácora, ni las notas, ni los montos, ni las rutas
 * de tus carpetas.
 *
 * Aplicar el plan pasa por las mismas escrituras que usa el resto de la app, y
 * eso no es prolijidad: es lo que hace que aceptar un plan funcione sin red,
 * entre a la cola en orden y quede con dueño. Un camino especial para el
 * asistente sería el primer sitio donde se rompería alguna de las tres cosas.
 */

import type { Account, Category, Entity, EntrySeries, InboxItem, Project } from "../types";
import type { Config } from "../config";
import { type OrganizeContext, sanitizePlan, type Plan, type Step } from "../organize/plan";
import { materializeSeries } from "./recurring";
import { create, update } from "./mutate";
import { sortBy } from "./query";
import * as store from "./store";

/** Estados que valen la pena mostrarle al modelo. Un archivado no recibe tareas. */
const LIVE = ["idea", "active", "paused", "waiting"];

function alive<T extends { deleted?: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deleted);
}

/**
 * El índice de la cuenta que viaja al modelo.
 *
 * `withInbox` solo cuando se está ordenando la bandeja: mandar sesenta ítems
 * sueltos cuando la persona está escribiendo sobre otra cosa gasta contexto y
 * lo invita a mezclar cosas que no tienen que ver.
 */
export function buildContext(cfg: Config, withInbox: boolean): OrganizeContext {
  const projects = alive(store.all<Project & { id: string }>("projects"))
    .filter((p) => LIVE.includes(p.status))
    .map((p) => ({ id: p.id, name: p.name, status: p.status }));

  const entities = alive(store.all<Entity & { id: string }>("entities")).map((e) => ({
    id: e.id,
    name: e.name,
  }));

  const categories = store.all<Category & { id: string }>("categories").map((c) => ({
    id: c.id,
    name: c.name,
    direction: c.direction || "",
  }));

  const accounts = store.all<Account & { id: string }>("accounts").map((a) => ({
    id: a.id,
    name: a.name,
  }));

  const inbox = withInbox
    ? sortBy(
        alive(store.all<InboxItem & { id: string }>("inbox")).filter((i) => i.status === "open"),
        "created"
      ).map((i) => ({ id: i.id, text: i.text }))
    : [];

  return {
    today: new Date().toISOString().slice(0, 10),
    currency: cfg.settings.default_currency || "CLP",
    projects: sortBy(projects, "name"),
    entities: sortBy(entities, "name"),
    categories,
    accounts,
    projectKinds: cfg.options("project_kind").map((o) => o.value),
    priorities: cfg.options("priority").map((o) => o.value),
    logKinds: cfg.options("log_kind").map((o) => o.value),
    inbox,
  };
}

/* ------------------------------------------------------------- aplicar ----- */

export interface Applied {
  /** Cuántos registros se escribieron, por colección. */
  counts: Record<string, number>;
  /** A dónde ir a ver lo que se creó, cuando hay un solo destino claro. */
  href: string;
}

/**
 * Escribe los pasos aceptados.
 *
 * Dos cosas de orden que importan y no son estéticas: los proyectos van
 * primero, porque todo lo demás puede colgar de uno que este mismo plan está
 * creando y el id tiene que existir antes; y los cierres de bandeja van
 * últimos, porque un ítem no se marca resuelto hasta que existe aquello en lo
 * que se convirtió.
 *
 * El plan vuelve a pasar por la aduana antes de escribir. Ya pasó en el
 * servidor, y da lo mismo: entre una y otra estuvo en la memoria del navegador,
 * y validar de nuevo cuesta microsegundos.
 */
export async function applyPlan(plan: Plan, ctx: OrganizeContext): Promise<Applied> {
  const clean = sanitizePlan(plan as unknown, ctx);
  const counts: Record<string, number> = {};
  const bump = (key: string) => {
    counts[key] = (counts[key] || 0) + 1;
  };

  /** Nombre del proyecto creado en este plan -> su id definitivo. */
  const born = new Map<string, string>();
  const known = new Set(ctx.projects.map((p) => p.id));

  /** Un `project` puede venir como id existente o como nombre recién nacido. */
  const resolve = (value: string): string => {
    if (!value) return "";
    if (known.has(value)) return value;
    return born.get(value) || "";
  };

  const projects = clean.steps.filter((s): s is Extract<Step, { kind: "project" }> =>
    s.kind === "project"
  );
  const closes = clean.steps.filter((s): s is Extract<Step, { kind: "inbox_close" }> =>
    s.kind === "inbox_close"
  );
  const middle = clean.steps.filter((s) => s.kind !== "project" && s.kind !== "inbox_close");

  let lastProject = "";

  for (const s of projects) {
    const id = await create("projects", {
      name: s.name,
      code: "",
      kind: s.project_kind,
      status: "active",
      priority: s.priority,
      health: "ok",
      client: s.client,
      parent: "",
      start_date: s.start_date,
      due_date: s.due_date,
      budget: 0,
      budget_currency: ctx.currency,
      summary: s.summary,
      next_cue: s.next_cue,
      next_step: s.next_step,
      tags: [],
    });
    born.set(s.name, id);
    lastProject = id;
    bump("projects");
  }

  for (const s of middle) {
    switch (s.kind) {
      case "task":
        await create("tasks", {
          title: s.title,
          project: resolve(s.project),
          status: "todo",
          priority: s.priority,
          due_date: s.due_date,
        });
        bump("tasks");
        break;

      case "log": {
        const project = resolve(s.project);
        if (!project) break; // el proyecto del que colgaba no llegó a existir
        await create("log", {
          project,
          date: s.date,
          kind: s.log_kind,
          title: s.title,
          body: s.body,
          hours: 0,
        });
        bump("log");
        break;
      }

      case "entry": {
        // El cambio no lo sabe el modelo y no debe inventarlo: para la moneda
        // base es 1 por definición, y para el resto queda en 0 hasta que la
        // persona lo escriba. `homeOf` trata el 0 como "todavía no se sabe".
        const fx = s.currency === ctx.currency ? 1 : 0;
        await create("entries", {
          date: s.date,
          direction: s.direction,
          description: s.description,
          amount: s.amount,
          currency: s.currency,
          fx_rate: fx,
          amount_clp: Math.round(s.amount * fx),
          net: 0,
          tax: 0,
          withholding: 0,
          status: s.status,
          due_date: s.due_date,
          paid_date: "",
          project: resolve(s.project),
          entity: s.entity,
          account: "",
          category: s.category,
          doc_type: "",
          doc_number: "",
          notes: "",
          friction_cost: false,
          recurring: false,
        });
        bump("entries");
        break;
      }

      case "series": {
        const fx = s.currency === ctx.currency ? 1 : 0;
        const id = await create("entry_series", {
          direction: s.direction,
          description: s.description,
          amount: s.amount,
          currency: s.currency,
          fx_rate: fx,
          net: 0,
          tax: 0,
          withholding: 0,
          cadence: s.cadence,
          start_date: s.start_date,
          end_date: s.end_date,
          occurrences: s.occurrences,
          due_days: 0,
          status: "planned",
          auto_paid: false,
          paused: false,
          project: resolve(s.project),
          entity: s.entity,
          account: "",
          category: "",
          doc_type: "",
          notes: "",
        });
        bump("entry_series");

        // Las cuotas se anotan enseguida, igual que al crear una recurrencia a
        // mano: si no, el plan dice "listo" y en Finanzas no hay nada.
        const row = store.get<EntrySeries & { id: string }>("entry_series", id);
        if (row) await materializeSeries(row);
        break;
      }

      case "commitment":
        await create("commitments", {
          title: s.title,
          kind: "",
          project: resolve(s.project),
          quote: "",
          entity: "",
          start_date: s.start_date,
          end_date: s.end_date,
          hours_per_week: s.hours_per_week,
          status: "tentative",
          source: "manual",
          notes: "Propuesto por el asistente. Confírmalo si va.",
        });
        bump("commitments");
        break;

      case "inbox":
        await create("inbox", { text: s.text, status: "open", project: "", outcome: "" });
        bump("inbox");
        break;

      default:
        break;
    }
  }

  for (const s of closes) {
    await update("inbox", s.id, { status: "planned", outcome: s.outcome });
    bump("inbox_close");
  }

  return { counts, href: projects.length === 1 ? `/w/${lastProject}` : "" };
}
