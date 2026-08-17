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

import type {
  Account,
  Category,
  ChatMessage,
  Commitment,
  Entity,
  Entry,
  EntrySeries,
  InboxItem,
  LogEntry,
  Project,
  Quote,
  Task,
} from "../types";
import type { Config } from "../config";
// Las fechas viajan al modelo como "2026-09-05" y no como el timestamp que
// guarda PocketBase: el prompt le exige ese formato al contestar, y mandárselo
// mezclado con "2026-09-05 00:00:00.000Z" es pedirle que copie una forma que no
// tiene permitido devolver. `inputDate` ya hace exactamente ese recorte, en UTC.
import { inputDate as day, todayISO } from "../dates";
import { homeOf } from "../money";
import {
  type OrganizeContext,
  type Plan,
  type ProposeResult,
  sanitizePlan,
  type Step,
} from "../organize/plan";
// Los presupuestos se crean con las mismas acciones que usa `/presupuestos`, y no
// con `create` a pelo: de ahí salen el correlativo del número, la validez y los
// porcentajes por defecto de la cuenta, y de ahí sale el congelado de los totales.
// Copiar esa aritmética acá sería la primera copia que se queda atrás.
import { addDeliverable, addQuoteItem, createQuote } from "./actions";
import { materializeSeries } from "./recurring";
import { create, remove, update } from "./mutate";
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
 * La bandeja iba solo cuando se llegaba desde la bandeja, para no gastar
 * contexto con sesenta ítems sueltos mientras la persona escribía de otra cosa.
 * Ahora va siempre, y el cambio no es de eficiencia: desde que el agente
 * contesta, "¿qué tengo pendiente de ordenar?" es una pregunta normal, y un
 * agente que no ve la bandeja la contesta diciendo que no hay nada. El tope de
 * cincuenta ítems sigue puesto, que es lo que evitaba el problema de verdad.
 */
export function buildContext(cfg: Config): OrganizeContext {
  const liveProjects = alive(store.all<Project & { id: string }>("projects")).filter((p) =>
    LIVE.includes(p.status)
  );
  const nameOf = new Map(liveProjects.map((p) => [p.id, p.name]));

  const projects = liveProjects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    kind: p.kind || "",
    due_date: day(p.due_date),
    next_step: p.next_step || "",
  }));

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

  const inbox = sortBy(
    alive(store.all<InboxItem & { id: string }>("inbox")).filter((i) => i.status === "open"),
    "created"
  )
    .slice(0, 50)
    .map((i) => ({ id: i.id, text: i.text }));

  /*
   * Lo que sigue es para que el agente pueda contestar preguntas, no solo
   * anotar. Todo va recortado y en la forma en que se lee en una lista: títulos,
   * fechas y totales. Nunca el cuerpo de una nota ni movimiento por movimiento.
   */
  const today = todayISO();
  const year = today.slice(0, 4);

  const tasks = sortBy(
    alive(store.all<Task & { id: string }>("tasks")).filter((t) => t.status !== "done"),
    "due_date"
  )
    .slice(0, 60)
    .map((t) => ({
      id: t.id,
      title: t.title,
      project: nameOf.get(t.project) || "",
      due_date: day(t.due_date),
      priority: t.priority || "",
    }));

  const recent = sortBy(alive(store.all<LogEntry & { id: string }>("log")), "-date")
    .slice(0, 40)
    .map((l) => ({
      date: day(l.date),
      project: nameOf.get(l.project) || "",
      title: l.title,
    }));

  const commitments = alive(store.all<Commitment & { id: string }>("commitments"))
    .filter((c) => c.status !== "cancelled" && day(c.end_date) >= today)
    .slice(0, 20)
    .map((c) => ({
      id: c.id,
      title: c.title,
      project: nameOf.get(c.project) || "",
      start: day(c.start_date),
      end: day(c.end_date),
      hours: c.hours_per_week,
    }));

  const recurring = alive(store.all<EntrySeries & { id: string }>("entry_series"))
    .filter((s) => !s.paused)
    .slice(0, 20)
    .map((s) => ({
      id: s.id,
      description: s.description,
      direction: s.direction,
      amount: s.amount,
      cadence: s.cadence,
    }));

  /*
   * Lo que está a medio camino: cobros emitidos, pagos comprometidos, plata que
   * se prometió y no se movió. Es lo que hace que "me pagaron la de Andes" tenga
   * a qué apuntar, y **solo** eso — el histórico completo no hace falta para
   * administrar, y mandarlo sería mandar la contabilidad entera para nada.
   */
  const pending = sortBy(
    alive(store.all<Entry & { id: string }>("entries")).filter(
      (e) => e.status === "planned" || e.status === "committed" || e.status === "invoiced"
    ),
    "due_date"
  )
    .slice(0, 40)
    .map((e) => ({
      id: e.id,
      description: e.description,
      direction: e.direction,
      amount: e.amount,
      status: e.status,
      due_date: day(e.due_date),
    }));

  // Con su estado, que es lo que decide si el agente los puede editar: un
  // presupuesto que ya salió es una promesa hecha en una fecha.
  const quotes = sortBy(alive(store.all<Quote & { id: string }>("quotes")), "-date")
    .slice(0, 30)
    .map((q) => ({ id: q.id, number: q.number, title: q.title, status: q.status }));

  // Tres números y no el ledger: "¿cuánto llevo cobrado?" es una suma, y mandar
  // cada movimiento para contestarla sería mandar la contabilidad completa.
  const thisYear = alive(store.all<Entry & { id: string }>("entries")).filter(
    (e) => day(e.date).slice(0, 4) === year
  );
  const money = {
    year,
    received: Math.round(
      thisYear
        .filter((e) => e.status === "paid" && e.direction === "income")
        .reduce((sum, e) => sum + homeOf(e), 0)
    ),
    spent: Math.round(
      thisYear
        .filter((e) => e.status === "paid" && e.direction === "expense")
        .reduce((sum, e) => sum + homeOf(e), 0)
    ),
    receivable: Math.round(
      thisYear
        .filter(
          (e) =>
            e.direction === "income" && (e.status === "invoiced" || e.status === "committed")
        )
        .reduce((sum, e) => sum + homeOf(e), 0)
    ),
  };

  return {
    today,
    currency: cfg.settings.default_currency || "CLP",
    projects: sortBy(projects, "name"),
    entities: sortBy(entities, "name"),
    categories,
    accounts,
    projectKinds: cfg.options("project_kind").map((o) => o.value),
    priorities: cfg.options("priority").map((o) => o.value),
    healths: cfg.options("health").map((o) => o.value),
    logKinds: cfg.options("log_kind").map((o) => o.value),
    inbox,
    tasks,
    recent,
    commitments,
    pending,
    quotes,
    recurring,
    money,
  };
}

/* --------------------------------------------------------------- pedir ----- */

/**
 * Pide el plan al servidor.
 *
 * La respuesta viene por streaming y eso obliga a leerla, no a esperarla: el
 * cuerpo son saltos de línea de relleno —un latido cada diez segundos, para que
 * Cloudflare no corte la petición a los 100— y **la última línea con contenido
 * es el resultado**. Ver el comentario de `app/(app)/organizar/stream/route.ts`
 * para por qué no es un server action.
 *
 * `res.text()` alcanza: espera el cuerpo completo, pero mientras espera hay
 * bytes en vuelo, que es exactamente lo que hacía falta.
 */
/**
 * Los turnos anteriores, en la forma en que se le recuerdan al modelo.
 *
 * Dos decisiones acá, y las dos son de tokens:
 *
 * - **Solo los últimos turnos.** Una conversación de un mes no cabe en el techo
 *   y tampoco ayuda: lo que hace falta para entender "no, los martes" es el
 *   turno de antes, no el de la semana pasada.
 * - **El plan viaja solo con el último turno del agente.** Un plan de veinte
 *   pasos en JSON pesa más que toda la conversación que lo rodea, así que
 *   repetirlo cinco veces gastaría el presupuesto en recordar en vez de en
 *   contestar. Y va **solo si quedó sin aplicar**, porque es justo el caso en
 *   que la persona lo está corrigiendo: lo ya escrito se ve en la app, no hay
 *   que recordárselo.
 */
export function historyFor(messages: ChatMessage[]): { role: "user" | "assistant"; text: string }[] {
  const turns = messages.slice(-TURNS);
  const lastAgent = turns.filter((m) => m.role === "assistant").pop();

  return turns.map((m) => {
    const plan = m.plan as Plan | undefined;
    const carry = m === lastAgent && !m.applied && !!plan?.steps?.length;
    return {
      role: m.role,
      text:
        carry && plan
          ? `${m.text}\n\n${JSON.stringify({ reply: m.text, steps: plan.steps })}`
          : m.text,
    };
  });
}

/** Cuántos turnos se recuerdan. El servidor recorta otra vez; ver `organize/call.ts`. */
const TURNS = 8;

export async function requestPlan(body: {
  text: string;
  context: OrganizeContext;
  history?: { role: "user" | "assistant"; text: string }[];
}): Promise<ProposeResult> {
  let res: Response;
  try {
    res = await fetch("/organizar/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "No se pudo hablar con el servidor. Puede ser la red." };
  }

  if (!res.ok) {
    return {
      ok: false,
      error:
        res.status === 502 || res.status === 504
          ? "El servidor no contestó a tiempo. Prueba con un texto más corto."
          : `El servidor respondió ${res.status}.`,
    };
  }

  const text = await res.text();
  const lines = text.split("\n").filter((line) => line.trim());
  const last = lines[lines.length - 1];

  if (!last) {
    // Cuerpo de puros latidos: la conexión se cortó a mitad de camino. Decirlo
    // así es más útil que un "error inesperado", porque el remedio es reintentar.
    return { ok: false, error: "La conexión se cortó antes de que llegara el plan." };
  }

  try {
    return JSON.parse(last) as ProposeResult;
  } catch {
    return { ok: false, error: "La respuesta del servidor no se entendió." };
  }
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
 * Tres cosas de orden que importan y no son estéticas: los proyectos van
 * primero, porque todo lo demás puede colgar de uno que este mismo plan está
 * creando y el id tiene que existir antes; los cierres de bandeja van después,
 * porque un ítem no se marca resuelto hasta que existe aquello en lo que se
 * convirtió; y **los borrados van al final de todo**, porque un plan que en el
 * mismo turno cierra una tarea y borra otra no puede arriesgarse a escribir
 * sobre una fila que ya no está.
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
  const removals = clean.steps.filter((s): s is Extract<Step, { kind: "remove" }> =>
    s.kind === "remove"
  );
  const middle = clean.steps.filter(
    (s) => s.kind !== "project" && s.kind !== "inbox_close" && s.kind !== "remove"
  );

  let lastProject = "";
  let lastQuote = "";

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

      case "quote": {
        // `createQuote` devuelve la ruta a la que navegar —era un `redirect()`—
        // y de ahí sale el id. Es la misma escritura que usa el formulario de
        // `/presupuestos`, así que trae el correlativo del número, la validez y
        // los porcentajes de la cuenta sin repetirlos acá.
        const fd = new FormData();
        fd.set("title", s.title);
        fd.set("client", s.client);
        fd.set("kind", s.project_kind);
        fd.set("description", s.description);
        fd.set("currency", s.currency);
        const quoteId = String((await createQuote(fd)) || "").split("/").pop() || "";
        if (!quoteId) break;

        // Aparte porque `updateQuote` escribe la cabecera completa: llamarlo con
        // solo esto vaciaría todo lo que acabamos de sembrar.
        if (s.terms) await update("quotes", quoteId, { terms: s.terms });

        for (const it of s.items) {
          const row = new FormData();
          row.set("quote", quoteId);
          row.set("description", it.description);
          row.set("unit", it.unit);
          row.set("qty", String(it.qty));
          row.set("unit_price", String(it.unit_price));
          await addQuoteItem(row);
        }

        for (const d of s.deliverables) {
          const row = new FormData();
          row.set("quote", quoteId);
          row.set("name", d.name);
          row.set("detail", d.detail);
          row.set("lead_days", String(d.lead_days));
          await addDeliverable(row);
        }

        lastQuote = quoteId;
        bump("quotes");
        break;
      }

      case "update":
        // Un parche con los campos que sobrevivieron a la aduana, y nada más: la
        // fila que llegó del otro dispositivo no se pisa entera por escribir un
        // estado.
        await update(s.target, s.id, s.fields);
        bump("updates");
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

  for (const s of removals) {
    await remove(s.target, s.id);
    bump("removed");
  }

  return {
    counts,
    href: destination(projects.length, lastProject, counts.quotes === 1 ? lastQuote : ""),
  };
}

/**
 * A dónde ofrecer ir después de aplicar.
 *
 * Solo cuando hay **un** destino claro. Con dos proyectos nuevos cualquier
 * elección es arbitraria, y mandar a la persona al que la app eligió sola es
 * peor que dejarla donde está: la conversación sigue ahí y desde ahí se ve todo
 * lo que se escribió.
 */
function destination(projectCount: number, project: string, quote: string): string {
  if (projectCount === 1 && project) return `/w/${project}`;
  if (!projectCount && quote) return `/presupuestos/${quote}`;
  return "";
}
