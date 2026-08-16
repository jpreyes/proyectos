"use client";

/**
 * Las escrituras de la app.
 *
 * Eran server actions; ahora escriben en la réplica local y la cola las sube
 * cuando puede. Lo que **no** cambió es la forma: siguen recibiendo un
 * `FormData`, así que los formularios siguen siendo formularios con sus campos
 * ocultos y su envío, en vez de veinte estados controlados de React. Esa parte
 * era buena y se quedó.
 *
 * Lo que sí se perdió es el funcionamiento sin JavaScript: un formulario que
 * escribe en IndexedDB necesita JavaScript por definición. Es el precio de que
 * todo lo demás funcione sin red, que en un teléfono pasa mucho más seguido que
 * tener JavaScript apagado.
 *
 * Una acción que devuelve un `string` está pidiendo navegar a esa ruta (antes
 * era `redirect()`); el ayudante `useAction` de `components/form.tsx` la lleva.
 */

import { DEFAULT_SETTINGS, type Settings, type TaxRow } from "../config";
import { splitIVA } from "../money";
import type { CalendarFeed, Commitment, Entry, Quote, QuoteItem } from "../types";
import { create, remove, update, upsert } from "./mutate";
import { proposeSlotForQuote, storedSlot } from "./schedule";
import * as store from "./store";

/* ------------------------------------------------------------- helpers ---- */

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/**
 * Número simple. Acá el punto es decimal — "3.5" tiene que seguir siendo 3,5.
 * La coma también se acepta como marca decimal, que es lo que produce un
 * teclado chileno.
 */
function num(fd: FormData, key: string): number {
  const raw = str(fd, key).replace(/\s/g, "").replace(",", ".");
  if (raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Plata, escrita como se escribe en Chile: "1.234.567" o "1.234.567,89".
 * Los puntos solo son separador de miles cuando cada grupo tiene exactamente
 * tres dígitos — así "39.150" (valor UF) es 39150, y "3.5" sigue siendo 3,5.
 */
function money(fd: FormData, key: string): number {
  let raw = str(fd, key).replace(/\s/g, "");
  if (raw === "") return 0;

  if (raw.includes(",")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, "");
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function bool(fd: FormData, key: string): boolean {
  return fd.get(key) != null;
}

/** "Boleta de honorarios" -> "boleta_de_honorarios" (valor máquina de respaldo). */
function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "") // saca los diacríticos: "Ñandú" -> "Nandu"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function tags(fd: FormData, key: string): string[] {
  return str(fd, key)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Los ajustes de la cuenta, con los valores por defecto donde falte algo. */
function settings(): Settings {
  const row = store.all<Settings & { id: string }>("settings")[0];
  return { ...DEFAULT_SETTINGS, ...(row || {}) };
}

function alive<T extends { deleted?: boolean }>(list: T[]): T[] {
  return list.filter((r) => !r.deleted);
}

/** La posición siguiente dentro de un grupo, para no encabezar la lista. */
function nextPosition(collection: string, match: (row: Record<string, unknown>) => boolean): number {
  const rows = store.all(collection).filter(match);
  let max = -1;
  for (const r of rows) max = Math.max(max, Number(r.position || 0));
  return max + 1;
}

/* ------------------------------------------------------------ projects ---- */

function projectPayload(fd: FormData) {
  return {
    name: str(fd, "name"),
    code: str(fd, "code"),
    kind: str(fd, "kind"),
    status: str(fd, "status"),
    priority: str(fd, "priority"),
    health: str(fd, "health"),
    client: str(fd, "client"),
    parent: str(fd, "parent"),
    start_date: str(fd, "start_date"),
    due_date: str(fd, "due_date"),
    budget: money(fd, "budget"),
    budget_currency: str(fd, "budget_currency"),
    summary: str(fd, "summary"),
    next_cue: str(fd, "next_cue"),
    next_step: str(fd, "next_step"),
    tags: tags(fd, "tags"),
  };
}

export async function createProject(fd: FormData) {
  const id = await create("projects", projectPayload(fd));
  return `/w/${id}`;
}

export async function updateProject(fd: FormData) {
  const id = str(fd, "id");
  await update("projects", id, projectPayload(fd));
  return `/w/${id}`;
}

/**
 * Edición en línea del plan si-entonces — la escritura más usada de la app.
 * Deliberadamente barata: un formulario, sin navegación ni confirmación.
 */
export async function setNextStep(fd: FormData) {
  await update("projects", str(fd, "id"), {
    next_cue: str(fd, "next_cue"),
    next_step: str(fd, "next_step"),
  });
}

export async function setProjectStatus(fd: FormData) {
  await update("projects", str(fd, "id"), { status: str(fd, "status") });
}

export async function deleteProject(fd: FormData) {
  await remove("projects", str(fd, "id"));
  return "/w";
}

/* ----------------------------------------------------------- resources ---- */

function resourcePayload(fd: FormData) {
  return {
    project: str(fd, "project"),
    label: str(fd, "label"),
    kind: str(fd, "kind"),
    path: str(fd, "path"),
    purpose: str(fd, "purpose"),
    state: str(fd, "state") || "active",
    pinned: bool(fd, "pinned"),
    position: num(fd, "position"),
  };
}

export async function addResource(fd: FormData) {
  await create("resources", resourcePayload(fd));
}

export async function updateResource(fd: FormData) {
  await update("resources", str(fd, "id"), resourcePayload(fd));
}

export async function deleteResource(fd: FormData) {
  await remove("resources", str(fd, "id"));
}

export async function toggleResourcePin(fd: FormData) {
  await update("resources", str(fd, "id"), { pinned: str(fd, "pinned") === "1" });
}

/* ----------------------------------------------------------------- log ---- */

export async function addLog(fd: FormData) {
  const project = str(fd, "project");
  await create("log", {
    project,
    date: str(fd, "date") || today(),
    kind: str(fd, "kind") || "note",
    title: str(fd, "title"),
    body: str(fd, "body"),
    hours: num(fd, "hours"),
  });

  // Cerrar una sesión de trabajo es el momento más barato para dejarle el
  // siguiente plan si-entonces a tu yo futuro — por eso vive en este formulario.
  const next = str(fd, "next_step");
  if (next) {
    await update("projects", project, { next_step: next, next_cue: str(fd, "next_cue") });
  }
}

export async function deleteLog(fd: FormData) {
  await remove("log", str(fd, "id"));
}

/* --------------------------------------------------------------- tasks ---- */

export async function addTask(fd: FormData) {
  await create("tasks", {
    title: str(fd, "title"),
    project: str(fd, "project"),
    status: "todo",
    priority: str(fd, "priority") || "normal",
    due_date: str(fd, "due_date"),
  });
}

export async function setTaskStatus(fd: FormData) {
  const status = str(fd, "status");
  await update("tasks", str(fd, "id"), {
    status,
    done_date: status === "done" ? today() : "",
  });
}

export async function deleteTask(fd: FormData) {
  await remove("tasks", str(fd, "id"));
}

/* ------------------------------------------------------------- entries ---- */

function entryPayload(fd: FormData) {
  const amount = money(fd, "amount");
  const currency = str(fd, "currency") || "CLP";

  // fx_rate es el valor en CLP de una unidad de `currency` en la fecha del
  // movimiento. Para CLP es 1 por definición; para UF/USD lo escribes tú.
  const fx = currency === "CLP" ? 1 : money(fd, "fx_rate");

  let net = money(fd, "net");
  let tax = money(fd, "tax");
  if (bool(fd, "apply_iva") && !net && !tax) {
    const split = splitIVA(amount, settings().iva_rate || 0.19);
    net = split.net;
    tax = split.tax;
  }

  const status = str(fd, "status") || "planned";

  return {
    date: str(fd, "date"),
    direction: str(fd, "direction"),
    description: str(fd, "description"),
    amount,
    currency,
    fx_rate: fx,
    amount_clp: Math.round(amount * (fx || 0)),
    net,
    tax,
    withholding: money(fd, "withholding"),
    status,
    due_date: str(fd, "due_date"),
    paid_date: status === "paid" ? str(fd, "paid_date") || str(fd, "date") : str(fd, "paid_date"),
    project: str(fd, "project"),
    entity: str(fd, "entity"),
    account: str(fd, "account"),
    category: str(fd, "category"),
    doc_type: str(fd, "doc_type"),
    doc_number: str(fd, "doc_number"),
    notes: str(fd, "notes"),
    friction_cost: bool(fd, "friction_cost"),
    recurring: bool(fd, "recurring"),
  };
}

export async function createEntry(fd: FormData) {
  await create("entries", entryPayload(fd));
  return str(fd, "return_to") || "/finanzas";
}

export async function updateEntry(fd: FormData) {
  await update("entries", str(fd, "id"), entryPayload(fd));
  return str(fd, "return_to") || "/finanzas";
}

/** El "ya me pagaron" de un toque, desde la lista de cobros. */
export async function markEntryPaid(fd: FormData) {
  await update("entries", str(fd, "id"), { status: "paid", paid_date: today() });
}

export async function deleteEntry(fd: FormData) {
  await remove("entries", str(fd, "id"));
  return str(fd, "return_to") || "/finanzas";
}

/* --------------------------------------------------------------- inbox ---- */

/** Captura. Un campo y un toque, o deja de ocurrir. */
export async function capture(fd: FormData) {
  const text = str(fd, "text");
  if (!text) return;
  await create("inbox", { text, status: "open" });
}

/**
 * Triaje. Capturar no cierra el bucle: una meta pendiente sigue interrumpiendo
 * hasta que existe un plan concreto. Por eso cada ítem sale de la bandeja
 * convertido en algo con destino — plan si-entonces, tarea o bitácora.
 * "Descartado" también vale: decidir que no se hace es una decisión.
 */
export async function triage(fd: FormData) {
  const id = str(fd, "id");
  const project = str(fd, "project");
  const dest = str(fd, "dest");
  const text = str(fd, "text");

  let outcome = "";

  if (dest === "plan" && project) {
    await update("projects", project, {
      next_cue: str(fd, "next_cue"),
      next_step: str(fd, "next_step") || text,
    });
    outcome = "Plan si-entonces";
  } else if (dest === "task" && project) {
    await create("tasks", {
      title: text,
      project,
      status: "todo",
      priority: str(fd, "priority") || "normal",
      due_date: str(fd, "due_date"),
    });
    outcome = "Tarea";
  } else if (dest === "log" && project) {
    await create("log", { project, date: today(), kind: "note", body: text });
    outcome = "Bitácora";
  }

  await update("inbox", id, { status: outcome ? "planned" : "open", project, outcome });
}

/**
 * Los destinos de un toque.
 *
 * El triaje pedía seis controles y exigía un workspace, así que una nota como
 * "responder correos" —que no pertenece a ningún proyecto— no tenía forma de
 * salir de la bandeja. Estas funciones son el camino corto: una decisión, un
 * toque, nada obligatorio. El proyecto es opcional en todas; la base siempre lo
 * permitió, era el formulario el que no.
 */
async function settle(fd: FormData, outcome: string) {
  await update("inbox", str(fd, "id"), {
    status: "planned",
    project: str(fd, "project"),
    outcome,
  });
}

/** Lo más común: una tarea. Con fecha si el texto la mencionaba. */
export async function inboxToTask(fd: FormData) {
  const due = str(fd, "due_date");
  await create("tasks", {
    title: str(fd, "text"),
    project: str(fd, "project"),
    status: "todo",
    priority: "normal",
    due_date: due,
  });
  await settle(fd, due ? "Tarea con fecha" : "Tarea");
}

/** Lo mismo, pero para hoy. */
export async function inboxToToday(fd: FormData) {
  await create("tasks", {
    title: str(fd, "text"),
    project: str(fd, "project"),
    status: "todo",
    priority: "normal",
    due_date: today(),
  });
  await settle(fd, "Tarea para hoy");
}

/** Ya pasó: se anota en la bitácora del proyecto en vez de quedar pendiente. */
export async function inboxToNote(fd: FormData) {
  await create("log", {
    project: str(fd, "project"),
    date: today(),
    kind: "note",
    body: str(fd, "text"),
  });
  await settle(fd, "Bitácora");
}

/** Lo escrito era el nombre de algo más grande. */
export async function inboxToProject(fd: FormData) {
  const id = await create("projects", {
    name: str(fd, "text"),
    kind: "research",
    status: "idea",
    priority: "normal",
    health: "ok",
  });
  await update("inbox", str(fd, "id"), {
    status: "planned",
    project: id,
    outcome: "Workspace nuevo",
  });
  return `/w/${id}`;
}

/** Era un encargo que hay que cotizar. */
export async function inboxToQuote(fd: FormData) {
  const s = settings();
  const validity = s.quote_validity_days || 30;

  const id = await create("quotes", {
    title: str(fd, "text"),
    status: "draft",
    date: today(),
    valid_until: new Date(Date.now() + validity * 86_400_000).toISOString().slice(0, 10),
    currency: s.default_currency || "CLP",
    fx_rate: 1,
    overhead_pct: s.quote_overhead_pct || 0,
    profit_pct: s.quote_profit_pct || 0,
    number: nextQuoteNumber(s.quote_prefix),
  });

  await settle(fd, "Presupuesto");
  return `/presupuestos/${id}`;
}

export async function dropInboxItem(fd: FormData) {
  await update("inbox", str(fd, "id"), { status: "dropped", outcome: "Descartado" });
}

export async function deleteInboxItem(fd: FormData) {
  await remove("inbox", str(fd, "id"));
}

/* ------------------------------------------------------------ routines ---- */

export async function createRoutine(fd: FormData) {
  await create("routines", {
    name: str(fd, "name"),
    cue: str(fd, "cue"),
    action: str(fd, "action"),
    started: str(fd, "started") || today(),
    active: true,
  });
}

/**
 * Marca o desmarca la repetición del día. No hay racha que proteger: saltarse
 * una repetición no afecta materialmente la formación del hábito, así que
 * desmarcar un día simplemente borra ese dato.
 */
export async function toggleRoutineDay(fd: FormData) {
  const routine = str(fd, "routine");
  const date = str(fd, "date") || today();
  const existing = str(fd, "log_id");

  if (existing) await remove("routine_log", existing);
  else await create("routine_log", { routine, date });
}

export async function rateRoutine(fd: FormData) {
  await update("routine_log", str(fd, "log_id"), { automaticity: num(fd, "automaticity") });
}

export async function archiveRoutine(fd: FormData) {
  await update("routines", str(fd, "id"), { active: false });
}

export async function deleteRoutine(fd: FormData) {
  await remove("routines", str(fd, "id"));
}

/* --------------------------------------------------- taxonomy & settings -- */

export async function createTaxonomy(fd: FormData) {
  const group = str(fd, "group");

  await create("taxonomy", {
    group,
    value: str(fd, "value") || slug(str(fd, "label")),
    label: str(fd, "label"),
    color: str(fd, "color") || "neutral",
    icon: str(fd, "icon"),
    position: nextPosition("taxonomy", (r) => r.group === group),
    active: true,
    locked: false,
  });
}

export async function updateTaxonomy(fd: FormData) {
  const id = str(fd, "id");
  const current = store.get<TaxRow>("taxonomy", id);
  if (!current) return;

  // Una fila bloqueada es parte de una máquina de estados sobre la que el
  // código calcula: su rótulo y su color son cosméticos y se pueden cambiar,
  // su `value` no.
  const payload: Record<string, unknown> = {
    label: str(fd, "label"),
    color: str(fd, "color") || "neutral",
    icon: str(fd, "icon"),
    position: num(fd, "position"),
    active: current.locked ? true : !bool(fd, "inactive"),
  };
  if (!current.locked) payload.value = str(fd, "value");

  await update("taxonomy", id, payload);
}

export async function deleteTaxonomy(fd: FormData) {
  const id = str(fd, "id");
  const current = store.get<TaxRow>("taxonomy", id);
  if (!current || current.locked) return; // nunca se puede quitar
  await remove("taxonomy", id);
}

export async function saveSettings(fd: FormData) {
  const payload = {
    cold_days: num(fd, "cold_days"),
    horizon_days: num(fd, "horizon_days"),
    rhythm_min_sample: num(fd, "rhythm_min_sample"),
    rhythm_window_days: num(fd, "rhythm_window_days"),
    routine_grid_days: num(fd, "routine_grid_days"),
    iva_rate: num(fd, "iva_rate"),
    withholding_rate: num(fd, "withholding_rate"),
    default_currency: str(fd, "default_currency") || "CLP",
    digest_hour: num(fd, "digest_hour"),
    digest_minute: num(fd, "digest_minute"),
    digest_enabled: bool(fd, "digest_enabled"),

    issuer_name: str(fd, "issuer_name"),
    issuer_role: str(fd, "issuer_role"),
    issuer_tax_id: str(fd, "issuer_tax_id"),
    issuer_email: str(fd, "issuer_email"),
    issuer_phone: str(fd, "issuer_phone"),
    issuer_address: str(fd, "issuer_address"),
    issuer_web: str(fd, "issuer_web"),

    capacity_hours_week: num(fd, "capacity_hours_week"),
    capacity_horizon_weeks: num(fd, "capacity_horizon_weeks"),

    quote_overhead_pct: num(fd, "quote_overhead_pct"),
    quote_profit_pct: num(fd, "quote_profit_pct"),
    quote_validity_days: num(fd, "quote_validity_days"),
    quote_prefix: str(fd, "quote_prefix"),
  };

  await upsert("settings", str(fd, "id"), payload);
}

/* --------------------------------------------------------------- daily ---- */

/** Una fila por día; volver a enviar la misma fecha actualiza la que ya existe. */
export async function saveDaily(fd: FormData) {
  const date = str(fd, "date") || today();

  const payload = {
    date,
    sleep_start: str(fd, "sleep_start"),
    sleep_end: str(fd, "sleep_end"),
    energy_morning: num(fd, "energy_morning"),
    energy_afternoon: num(fd, "energy_afternoon"),
    energy_evening: num(fd, "energy_evening"),
    focus_hours: num(fd, "focus_hours"),
    notes: str(fd, "notes"),
  };

  // La fila del día puede existir sin que el formulario traiga su id (por
  // ejemplo si cambiaste la fecha a mano): se busca por fecha antes de crear.
  const existing =
    str(fd, "id") ||
    alive(store.all<{ id: string; date: string; deleted?: boolean }>("daily")).find(
      (d) => String(d.date).slice(0, 10) === date
    )?.id;

  await upsert("daily", existing, payload);
}

/* -------------------------------------------------------- presupuestos ---- */

/**
 * Recalcula y congela los totales de la cabecera.
 *
 * Se llama en cada escritura de ítems y de porcentajes, y no al leer, porque un
 * presupuesto enviado es una promesa hecha en una fecha: el papel que el
 * cliente tiene en la mano no puede cambiar solo porque hoy ajustaste tu
 * porcentaje de utilidades por defecto. Mismo criterio que `entries.amount_clp`.
 *
 * Gastos generales y utilidades van **ambos sobre el costo directo**, no en
 * cascada: los dos porcentajes se leen contra el mismo número, que está a la
 * vista en el documento.
 */
async function recalcQuote(quoteId: string): Promise<void> {
  const quote = store.get<Quote & { id: string }>("quotes", quoteId);
  if (!quote) return;

  const items = store
    .all<QuoteItem & { id: string }>("quote_items")
    .filter((it) => it.quote === quoteId);

  const direct = items.reduce((sum, it) => sum + (it.total || 0), 0);
  const overhead = direct * (quote.overhead_pct || 0);
  const profit = direct * (quote.profit_pct || 0);
  const net = direct + overhead + profit;
  const fx = quote.currency === "CLP" ? 1 : quote.fx_rate || 0;

  await update("quotes", quoteId, {
    direct_total: direct,
    overhead_amount: overhead,
    profit_amount: profit,
    net_total: net,
    net_total_clp: Math.round(net * fx),
  });
}

/** "P-2026-004": prefijo de settings, año en curso, correlativo. */
function nextQuoteNumber(prefix: string): string {
  const year = new Date().getFullYear();
  const stem = `${prefix || "P"}-${year}-`;

  let max = 0;
  for (const q of store.all<Quote & { id: string }>("quotes")) {
    if (!String(q.number || "").startsWith(stem)) continue;
    const n = Number(String(q.number).slice(stem.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${stem}${String(max + 1).padStart(3, "0")}`;
}

export async function createQuote(fd: FormData) {
  const s = settings();
  const validity = s.quote_validity_days || 30;
  const validUntil = new Date(Date.now() + validity * 86_400_000).toISOString().slice(0, 10);

  const id = await create("quotes", {
    number: str(fd, "number") || nextQuoteNumber(s.quote_prefix),
    title: str(fd, "title"),
    client: str(fd, "client"),
    kind: str(fd, "kind"),
    description: str(fd, "description"),
    status: "draft",
    date: today(),
    valid_until: validUntil,
    currency: str(fd, "currency") || s.default_currency || "CLP",
    fx_rate: money(fd, "fx_rate") || 1,
    overhead_pct: s.quote_overhead_pct || 0,
    profit_pct: s.quote_profit_pct || 0,
    work_hours: num(fd, "work_hours"),
    max_hours_week: num(fd, "max_hours_week"),
  });

  return `/presupuestos/${id}`;
}

export async function updateQuote(fd: FormData) {
  const id = str(fd, "id");
  const currency = str(fd, "currency") || "CLP";

  await update("quotes", id, {
    number: str(fd, "number"),
    title: str(fd, "title"),
    client: str(fd, "client"),
    kind: str(fd, "kind"),
    description: str(fd, "description"),
    date: str(fd, "date"),
    valid_until: str(fd, "valid_until"),
    currency,
    fx_rate: currency === "CLP" ? 1 : money(fd, "fx_rate"),
    // La UI pide porcentajes ("15"), la base guarda fracciones (0.15).
    overhead_pct: num(fd, "overhead_pct") / 100,
    profit_pct: num(fd, "profit_pct") / 100,
    work_hours: num(fd, "work_hours"),
    max_hours_week: num(fd, "max_hours_week"),
    earliest_start: str(fd, "earliest_start"),
    terms: str(fd, "terms"),
    notes: str(fd, "notes"),
  });

  await recalcQuote(id);
}

export async function deleteQuote(fd: FormData) {
  await remove("quotes", str(fd, "id"));
  return "/presupuestos";
}

/* ------------------------------------------------------ ítems y entregables */

function itemPayload(fd: FormData) {
  const qty = num(fd, "qty");
  const price = money(fd, "unit_price");
  return {
    description: str(fd, "description"),
    unit: str(fd, "unit"),
    qty,
    unit_price: price,
    total: qty * price,
    position: num(fd, "position"),
  };
}

export async function addQuoteItem(fd: FormData) {
  const quote = str(fd, "quote");
  if (!str(fd, "description")) return;

  await create("quote_items", {
    ...itemPayload(fd),
    quote,
    position: nextPosition("quote_items", (r) => r.quote === quote),
  });
  await recalcQuote(quote);
}

export async function updateQuoteItem(fd: FormData) {
  await update("quote_items", str(fd, "id"), itemPayload(fd));
  await recalcQuote(str(fd, "quote"));
}

export async function deleteQuoteItem(fd: FormData) {
  await remove("quote_items", str(fd, "id"));
  await recalcQuote(str(fd, "quote"));
}

function deliverablePayload(fd: FormData) {
  return {
    name: str(fd, "name"),
    detail: str(fd, "detail"),
    lead_days: num(fd, "lead_days"),
    position: num(fd, "position"),
  };
}

export async function addDeliverable(fd: FormData) {
  const quote = str(fd, "quote");
  if (!str(fd, "name")) return;

  await create("deliverables", {
    ...deliverablePayload(fd),
    quote,
    position: nextPosition("deliverables", (r) => r.quote === quote),
  });
}

export async function updateDeliverable(fd: FormData) {
  await update("deliverables", str(fd, "id"), deliverablePayload(fd));
}

export async function deleteDeliverable(fd: FormData) {
  await remove("deliverables", str(fd, "id"));
}

/* -------------------------------------------------- calce en el calendario */

/** Fija el calce propuesto por el buscador de huecos. */
export async function setQuotePlan(fd: FormData) {
  await update("quotes", str(fd, "id"), {
    plan_start: str(fd, "plan_start"),
    plan_end: str(fd, "plan_end"),
    plan_hours_week: num(fd, "plan_hours_week"),
  });
}

export async function clearQuotePlan(fd: FormData) {
  await update("quotes", str(fd, "id"), { plan_start: "", plan_end: "", plan_hours_week: 0 });
}

/* ------------------------------------------------------ estado y aprobación */

/**
 * Aprobar es la única acción que escribe en cuatro colecciones a la vez, y es a
 * propósito: el momento en que el cliente dice que sí es el único en que tienes
 * toda la información junta y ganas de anotarla. Si el proyecto, la reserva de
 * tiempo y el ingreso proyectado quedan para después, "después" termina siendo
 * el día en que ya no cabía.
 *
 * Ahora corre entera en el dispositivo, así que también funciona sin red: las
 * cuatro escrituras entran a la cola en orden, y el id del proyecto ya existe
 * cuando el compromiso y el ingreso lo referencian.
 */
export async function approveQuote(fd: FormData) {
  const id = str(fd, "id");
  const quote = store.get<Quote & { id: string }>("quotes", id);
  if (!quote) return;

  const stored = storedSlot(quote);
  const slot = stored ?? proposeSlotForQuote(settings(), quote).slot;
  const now = today();

  /* 1. el proyecto */
  let projectId = quote.project;
  if (!projectId) {
    projectId = await create("projects", {
      name: quote.title,
      kind: quote.kind,
      status: "active",
      priority: "normal",
      health: "ok",
      client: quote.client,
      start_date: slot?.start || now,
      due_date: slot?.end || "",
      budget: quote.net_total,
      budget_currency: quote.currency,
      summary: quote.description,
      next_cue: "Cuando parta el trabajo",
      next_step: "Revisar el alcance comprometido en el presupuesto",
    });
  }

  /* 2. la reserva de tiempo */
  if (slot) {
    const existing = alive(
      store.all<Commitment & { id: string }>("commitments").filter((c) => c.quote === id)
    );

    const payload = {
      title: quote.title,
      kind: quote.kind,
      project: projectId,
      quote: id,
      entity: quote.client,
      start_date: slot.start,
      end_date: slot.end,
      hours_per_week: slot.hoursPerWeek,
      status: slot.fits ? "confirmed" : "tentative",
      source: "quote",
      notes: slot.fits
        ? ""
        : "No cabía en el horizonte sin pasar la capacidad semanal. Ubicado lo antes posible.",
    };

    if (existing.length) await update("commitments", existing[0].id, payload);
    else await create("commitments", payload);
  }

  /* 3. el ingreso proyectado */
  const already = alive(store.all<Entry & { id: string }>("entries").filter((e) => e.quote === id));

  if (!already.length && quote.net_total > 0) {
    const fx = quote.currency === "CLP" ? 1 : quote.fx_rate || 0;
    const cobro = slot?.end || now;
    await create("entries", {
      date: cobro,
      direction: "income",
      description: `${quote.number || "Presupuesto"} · ${quote.title}`,
      amount: quote.net_total,
      currency: quote.currency,
      fx_rate: fx,
      amount_clp: Math.round(quote.net_total * fx),
      status: "planned",
      due_date: cobro,
      project: projectId,
      entity: quote.client,
      quote: id,
      notes: "Creado al aprobar el presupuesto. Ajusta la fecha si cobras por hitos.",
    });
  }

  /* 4. el presupuesto queda cerrado */
  await update("quotes", id, {
    status: "approved",
    decided_date: now,
    project: projectId,
    plan_start: slot?.start || "",
    plan_end: slot?.end || "",
    plan_hours_week: slot?.hoursPerWeek || 0,
  });

  await create("log", {
    project: projectId,
    date: now,
    kind: "milestone",
    title: `Presupuesto aprobado · ${quote.number || ""}`.trim(),
    body: quote.description,
  });
}

/**
 * Cambia el estado sin aprobar.
 *
 * Salir de "aprobado" no borra nada: anula la reserva de tiempo y el ingreso
 * proyectado, que es lo que hay que hacer para que la semana vuelva a estar
 * libre y la caja deje de contar plata que no va a llegar. El proyecto queda —
 * si alcanzaste a trabajar en él, esa historia no se tira.
 */
export async function setQuoteStatus(fd: FormData) {
  const id = str(fd, "id");
  const status = str(fd, "status");
  const previous = str(fd, "previous");

  await update("quotes", id, {
    status,
    decided_date: status === "rejected" ? today() : "",
  });

  if (previous === "approved" && status !== "approved") {
    const commitments = alive(
      store.all<Commitment & { id: string }>("commitments").filter((c) => c.quote === id)
    );
    for (const c of commitments) await update("commitments", c.id, { status: "cancelled" });

    const entries = alive(
      store
        .all<Entry & { id: string }>("entries")
        .filter((e) => e.quote === id && e.status === "planned")
    );
    for (const e of entries) await update("entries", e.id, { status: "cancelled" });
  }
}

/* ---------------------------------------------------------- compromisos ---- */

function commitmentPayload(fd: FormData) {
  return {
    title: str(fd, "title"),
    kind: str(fd, "kind"),
    project: str(fd, "project"),
    entity: str(fd, "entity"),
    start_date: str(fd, "start_date"),
    end_date: str(fd, "end_date"),
    hours_per_week: num(fd, "hours_per_week"),
    status: str(fd, "status") || "confirmed",
    notes: str(fd, "notes"),
  };
}

export async function createCommitment(fd: FormData) {
  await create("commitments", { ...commitmentPayload(fd), source: "manual" });
}

export async function updateCommitment(fd: FormData) {
  await update("commitments", str(fd, "id"), commitmentPayload(fd));
}

export async function setCommitmentStatus(fd: FormData) {
  await update("commitments", str(fd, "id"), { status: str(fd, "status") });
}

export async function deleteCommitment(fd: FormData) {
  await remove("commitments", str(fd, "id"));
}

/* ------------------------------------------------- calendarios externos ---- */

/**
 * El feed se guarda local como todo lo demás; leer el .ics es lo único que
 * necesita servidor, porque el navegador no puede pedirle a Outlook un archivo
 * de otro origen. Se dispara después de guardar y, si no hay red, queda para
 * cuando la haya: el feed ya está anotado.
 */
export async function saveCalendarFeed(fd: FormData) {
  const id = await upsert("calendar_feeds", str(fd, "id"), {
    label: str(fd, "label"),
    url: str(fd, "url"),
    active: !bool(fd, "inactive"),
    default_hours: num(fd, "default_hours"),
  });

  const feed = store.get<CalendarFeed & { id: string }>("calendar_feeds", id);
  if (feed?.active && navigator.onLine) {
    const { syncCalendarFeeds } = await import("../actions.server");
    await syncCalendarFeeds().catch(() => undefined);
  }
}

export async function deleteCalendarFeed(fd: FormData) {
  const id = str(fd, "id");
  // Los eventos se van con él: son cache del .ics, no datos tuyos.
  for (const e of store.all<{ id: string; feed: string }>("calendar_events")) {
    if (e.feed === id) await remove("calendar_events", e.id);
  }
  await remove("calendar_feeds", id);
}

/* ------------------------------------------------------------ entities ---- */

function entityPayload(fd: FormData) {
  return {
    name: str(fd, "name"),
    kind: str(fd, "kind"),
    tax_id: str(fd, "tax_id"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    address: str(fd, "address"),
    website: str(fd, "website"),
    notes: str(fd, "notes"),
    active: !bool(fd, "inactive"),
  };
}

export async function createEntity(fd: FormData) {
  await create("entities", entityPayload(fd));
}

export async function updateEntity(fd: FormData) {
  await update("entities", str(fd, "id"), entityPayload(fd));
}

export async function deleteEntity(fd: FormData) {
  await remove("entities", str(fd, "id"));
}
