"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type PocketBase from "pocketbase";
import { requirePB } from "./pb.server";
import { splitIVA } from "./money";
import { getConfig } from "./config";
import { ALIVE } from "./filters";
import { syncFeed } from "./ics";
import { proposeSlotForQuote, storedSlot } from "./schedule";
import type { CalendarFeed, Commitment, Quote, QuoteItem } from "./types";

/* ------------------------------------------------------------- helpers ---- */

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/**
 * Plain number. A dot is a decimal point here — "3.5" must stay 3.5.
 * A comma is also accepted as the decimal mark, since that is what a Chilean
 * keyboard produces.
 */
function num(fd: FormData, key: string): number {
  const raw = str(fd, key).replace(/\s/g, "").replace(",", ".");
  if (raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Money, written the way it is written in Chile: "1.234.567" or "1.234.567,89".
 * Dots are only treated as thousand separators when every group after one has
 * exactly three digits — so "39.150" (valor UF) becomes 39150, while "3.5"
 * stays 3.5 instead of silently becoming 35.
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

/** "Boleta de honorarios" -> "boleta_de_honorarios" (machine value fallback). */
function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "") // strip combining marks: "Ñandú" -> "Nandu"
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
  const pb = await requirePB();
  const rec = await pb.collection("projects").create(projectPayload(fd));
  revalidatePath("/w");
  revalidatePath("/");
  redirect(`/w/${rec.id}`);
}

export async function updateProject(fd: FormData) {
  const pb = await requirePB();
  const id = str(fd, "id");
  await pb.collection("projects").update(id, projectPayload(fd));
  revalidatePath("/w");
  revalidatePath(`/w/${id}`);
  revalidatePath("/");
  redirect(`/w/${id}`);
}

/**
 * Inline edit of the if-then plan — the most-used write in the app.
 * Kept deliberately cheap: one form, no navigation, no confirmation.
 */
export async function setNextStep(fd: FormData) {
  const pb = await requirePB();
  const id = str(fd, "id");
  await pb.collection("projects").update(id, {
    next_cue: str(fd, "next_cue"),
    next_step: str(fd, "next_step"),
  });
  revalidatePath(`/w/${id}`);
  revalidatePath("/");
}

export async function setProjectStatus(fd: FormData) {
  const pb = await requirePB();
  const id = str(fd, "id");
  await pb.collection("projects").update(id, { status: str(fd, "status") });
  revalidatePath(`/w/${id}`);
  revalidatePath("/w");
  revalidatePath("/");
}

/**
 * Soft delete. Hard-deleting would leave an offline client showing a record
 * forever, because PocketBase keeps no tombstone to sync.
 */
export async function deleteProject(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("projects").update(str(fd, "id"), { deleted: true });
  revalidatePath("/w");
  revalidatePath("/");
  redirect("/w");
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
  const pb = await requirePB();
  await pb.collection("resources").create(resourcePayload(fd));
  revalidatePath(`/w/${str(fd, "project")}`);
}

export async function updateResource(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("resources").update(str(fd, "id"), resourcePayload(fd));
  revalidatePath(`/w/${str(fd, "project")}`);
}

export async function deleteResource(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("resources").update(str(fd, "id"), { deleted: true });
  revalidatePath(`/w/${str(fd, "project")}`);
}

export async function toggleResourcePin(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("resources").update(str(fd, "id"), { pinned: str(fd, "pinned") === "1" });
  revalidatePath(`/w/${str(fd, "project")}`);
}

/* ----------------------------------------------------------------- log ---- */

export async function addLog(fd: FormData) {
  const pb = await requirePB();
  const project = str(fd, "project");
  await pb.collection("log").create({
    project,
    date: str(fd, "date") || new Date().toISOString().slice(0, 10),
    kind: str(fd, "kind") || "note",
    title: str(fd, "title"),
    body: str(fd, "body"),
    hours: num(fd, "hours"),
  });

  // Closing a work session is the cheapest moment to leave the next if-then
  // plan for your future self — that is why it lives inside this same form.
  const next = str(fd, "next_step");
  if (next) {
    await pb
      .collection("projects")
      .update(project, { next_step: next, next_cue: str(fd, "next_cue") });
  }

  revalidatePath(`/w/${project}`);
  revalidatePath("/");
}

export async function deleteLog(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("log").update(str(fd, "id"), { deleted: true });
  revalidatePath(`/w/${str(fd, "project")}`);
}

/* --------------------------------------------------------------- tasks ---- */

export async function addTask(fd: FormData) {
  const pb = await requirePB();
  const project = str(fd, "project");
  await pb.collection("tasks").create({
    title: str(fd, "title"),
    project,
    status: "todo",
    priority: str(fd, "priority") || "normal",
    due_date: str(fd, "due_date"),
  });
  revalidatePath(`/w/${project}`);
  revalidatePath("/");
}

export async function setTaskStatus(fd: FormData) {
  const pb = await requirePB();
  const status = str(fd, "status");
  await pb.collection("tasks").update(str(fd, "id"), {
    status,
    done_date: status === "done" ? new Date().toISOString().slice(0, 10) : "",
  });
  revalidatePath(`/w/${str(fd, "project")}`);
  revalidatePath("/");
}

export async function deleteTask(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("tasks").update(str(fd, "id"), { deleted: true });
  revalidatePath(`/w/${str(fd, "project")}`);
  revalidatePath("/");
}

/* ------------------------------------------------------------- entries ---- */

function entryPayload(fd: FormData) {
  const amount = money(fd, "amount");
  const currency = str(fd, "currency") || "CLP";

  // fx_rate is the CLP value of one unit of `currency` on the entry date.
  // For CLP it is 1 by definition; for UF/USD the user types the day's value.
  const fx = currency === "CLP" ? 1 : money(fd, "fx_rate");

  let net = money(fd, "net");
  let tax = money(fd, "tax");
  if (bool(fd, "apply_iva") && !net && !tax) {
    const split = splitIVA(amount);
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
  const pb = await requirePB();
  await pb.collection("entries").create(entryPayload(fd));
  const project = str(fd, "project");
  revalidatePath("/finanzas");
  revalidatePath("/");
  if (project) revalidatePath(`/w/${project}`);
  redirect(str(fd, "return_to") || "/finanzas");
}

export async function updateEntry(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("entries").update(str(fd, "id"), entryPayload(fd));
  const project = str(fd, "project");
  revalidatePath("/finanzas");
  revalidatePath("/");
  if (project) revalidatePath(`/w/${project}`);
  redirect(str(fd, "return_to") || "/finanzas");
}

/** One-click "ya me pagaron" from the receivables list. */
export async function markEntryPaid(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("entries").update(str(fd, "id"), {
    status: "paid",
    paid_date: new Date().toISOString().slice(0, 10),
  });
  revalidatePath("/finanzas");
  revalidatePath("/");
  const project = str(fd, "project");
  if (project) revalidatePath(`/w/${project}`);
}

export async function deleteEntry(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("entries").update(str(fd, "id"), { deleted: true });
  revalidatePath("/finanzas");
  revalidatePath("/");
  const project = str(fd, "project");
  if (project) revalidatePath(`/w/${project}`);
}

/* --------------------------------------------------------------- inbox ---- */

/** Capture. Must stay a single field and a single click, or it stops happening. */
export async function capture(fd: FormData) {
  const pb = await requirePB();
  const text = str(fd, "text");
  if (!text) return;
  await pb.collection("inbox").create({ text, status: "open" });
  revalidatePath("/inbox");
  revalidatePath("/");
}

/**
 * Triage. Capturing does not close the loop — an unfulfilled goal keeps
 * intruding until a concrete plan exists for it. So every item leaves the inbox
 * as something scheduled: an if-then plan on a project, a task, or a journal
 * entry. "Dropped" is also a valid outcome; deciding not to do it is a decision.
 */
export async function triage(fd: FormData) {
  const pb = await requirePB();
  const id = str(fd, "id");
  const project = str(fd, "project");
  const dest = str(fd, "dest");
  const text = str(fd, "text");

  let outcome = "";

  if (dest === "plan" && project) {
    await pb.collection("projects").update(project, {
      next_cue: str(fd, "next_cue"),
      next_step: str(fd, "next_step") || text,
    });
    outcome = "Plan si-entonces";
  } else if (dest === "task" && project) {
    await pb.collection("tasks").create({
      title: text,
      project,
      status: "todo",
      priority: str(fd, "priority") || "normal",
      due_date: str(fd, "due_date"),
    });
    outcome = "Tarea";
  } else if (dest === "log" && project) {
    await pb.collection("log").create({
      project,
      date: new Date().toISOString().slice(0, 10),
      kind: "note",
      body: text,
    });
    outcome = "Bitácora";
  }

  await pb.collection("inbox").update(id, {
    status: outcome ? "planned" : "open",
    project,
    outcome,
  });

  revalidatePath("/inbox");
  revalidatePath("/");
  if (project) revalidatePath(`/w/${project}`);
}

export async function dropInboxItem(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("inbox").update(str(fd, "id"), { status: "dropped", outcome: "Descartado" });
  revalidatePath("/inbox");
  revalidatePath("/");
}

export async function deleteInboxItem(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("inbox").update(str(fd, "id"), { deleted: true });
  revalidatePath("/inbox");
  revalidatePath("/");
}

/* ------------------------------------------------------------ routines ---- */

export async function createRoutine(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("routines").create({
    name: str(fd, "name"),
    cue: str(fd, "cue"),
    action: str(fd, "action"),
    started: str(fd, "started") || new Date().toISOString().slice(0, 10),
    active: true,
  });
  revalidatePath("/rutinas");
}

/**
 * Toggle today's repetition. There is no streak to protect: missing a single
 * repetition does not materially affect habit formation, so un-ticking a day
 * simply removes that data point.
 */
export async function toggleRoutineDay(fd: FormData) {
  const pb = await requirePB();
  const routine = str(fd, "routine");
  const date = str(fd, "date") || new Date().toISOString().slice(0, 10);
  const existing = str(fd, "log_id");

  if (existing) {
    await pb.collection("routine_log").delete(existing);
  } else {
    await pb.collection("routine_log").create({ routine, date });
  }
  revalidatePath("/rutinas");
}

export async function rateRoutine(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("routine_log").update(str(fd, "log_id"), {
    automaticity: num(fd, "automaticity"),
  });
  revalidatePath("/rutinas");
}

export async function archiveRoutine(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("routines").update(str(fd, "id"), { active: false });
  revalidatePath("/rutinas");
}

export async function deleteRoutine(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("routines").update(str(fd, "id"), { deleted: true });
  revalidatePath("/rutinas");
}

/* --------------------------------------------------- taxonomy & settings -- */

export async function createTaxonomy(fd: FormData) {
  const pb = await requirePB();
  const group = str(fd, "group");

  // Append at the end of its group rather than jumping to the front.
  const siblings = await pb
    .collection("taxonomy")
    .getList(1, 1, { filter: pb.filter("group = {:g}", { g: group }), sort: "-position" });
  const nextPosition = siblings.items.length
    ? Number(siblings.items[0].position || 0) + 1
    : 0;

  await pb.collection("taxonomy").create({
    group,
    value: str(fd, "value") || slug(str(fd, "label")),
    label: str(fd, "label"),
    color: str(fd, "color") || "neutral",
    icon: str(fd, "icon"),
    position: nextPosition,
    active: true,
    locked: false,
  });
  revalidatePath("/configuracion");
}

export async function updateTaxonomy(fd: FormData) {
  const pb = await requirePB();
  const id = str(fd, "id");
  const current = await pb.collection("taxonomy").getOne(id);

  // A locked row is part of a state machine the reports compute on: its label
  // and colour are cosmetic and free to change, its `value` is not.
  const payload: Record<string, unknown> = {
    label: str(fd, "label"),
    color: str(fd, "color") || "neutral",
    icon: str(fd, "icon"),
    position: num(fd, "position"),
    active: current.get("locked") ? true : !bool(fd, "inactive"),
  };
  if (!current.get("locked")) payload.value = str(fd, "value");

  await pb.collection("taxonomy").update(id, payload);
  revalidatePath("/configuracion");
}

export async function deleteTaxonomy(fd: FormData) {
  const pb = await requirePB();
  const id = str(fd, "id");
  const current = await pb.collection("taxonomy").getOne(id);
  if (current.get("locked")) return; // never removable
  await pb.collection("taxonomy").delete(id);
  revalidatePath("/configuracion");
}

export async function saveSettings(fd: FormData) {
  const pb = await requirePB();
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

  const id = str(fd, "id");
  if (id) await pb.collection("settings").update(id, payload);
  else await pb.collection("settings").create(payload);

  revalidatePath("/configuracion", "layout");
  revalidatePath("/", "layout");
}

/* --------------------------------------------------------------- daily ---- */

/** One row per day; re-submitting the same date updates it. */
export async function saveDaily(fd: FormData) {
  const pb = await requirePB();
  const date = str(fd, "date") || new Date().toISOString().slice(0, 10);

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

  const id = str(fd, "id");
  if (id) await pb.collection("daily").update(id, payload);
  else await pb.collection("daily").create(payload);

  revalidatePath("/ritmo");
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
 * cascada. Es la forma más común en un presupuesto de consultoría acá y la más
 * fácil de defender frente a un mandante: los dos porcentajes se leen contra el
 * mismo número, que está a la vista en el documento.
 */
async function recalcQuote(pb: PocketBase, quoteId: string): Promise<void> {
  const quote = await pb.collection("quotes").getOne<Quote>(quoteId);
  const items = await pb
    .collection("quote_items")
    .getFullList<QuoteItem>({ filter: pb.filter("quote = {:q}", { q: quoteId }) });

  const direct = items.reduce((sum, it) => sum + (it.total || 0), 0);
  const overhead = direct * (quote.overhead_pct || 0);
  const profit = direct * (quote.profit_pct || 0);
  const net = direct + overhead + profit;
  const fx = quote.currency === "CLP" ? 1 : quote.fx_rate || 0;

  await pb.collection("quotes").update(quoteId, {
    direct_total: direct,
    overhead_amount: overhead,
    profit_amount: profit,
    net_total: net,
    net_total_clp: Math.round(net * fx),
  });
}

function revalidateQuote(id: string) {
  revalidatePath("/presupuestos");
  revalidatePath(`/presupuestos/${id}`);
}

/** "P-2026-004": prefijo de settings, año en curso, correlativo por cuenta. */
async function nextQuoteNumber(pb: PocketBase, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const stem = `${prefix || "P"}-${year}-`;

  const rows = await pb
    .collection("quotes")
    .getFullList<Quote>({ filter: pb.filter("number ~ {:s}", { s: stem }), fields: "number" });

  let max = 0;
  for (const r of rows) {
    const n = Number(String(r.number).slice(stem.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${stem}${String(max + 1).padStart(3, "0")}`;
}

export async function createQuote(fd: FormData) {
  const pb = await requirePB();
  const cfg = await getConfig();
  const s = cfg.settings;

  const today = new Date().toISOString().slice(0, 10);
  const validity = s.quote_validity_days || 30;
  const validUntil = new Date(Date.now() + validity * 86_400_000).toISOString().slice(0, 10);

  const rec = await pb.collection("quotes").create({
    number: str(fd, "number") || (await nextQuoteNumber(pb, s.quote_prefix)),
    title: str(fd, "title"),
    client: str(fd, "client"),
    kind: str(fd, "kind"),
    description: str(fd, "description"),
    status: "draft",
    date: today,
    valid_until: validUntil,
    currency: str(fd, "currency") || s.default_currency || "CLP",
    fx_rate: money(fd, "fx_rate") || 1,
    overhead_pct: s.quote_overhead_pct || 0,
    profit_pct: s.quote_profit_pct || 0,
    work_hours: num(fd, "work_hours"),
    max_hours_week: num(fd, "max_hours_week"),
  });

  revalidatePath("/presupuestos");
  redirect(`/presupuestos/${rec.id}`);
}

export async function updateQuote(fd: FormData) {
  const pb = await requirePB();
  const id = str(fd, "id");

  const currency = str(fd, "currency") || "CLP";

  await pb.collection("quotes").update(id, {
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

  await recalcQuote(pb, id);
  revalidateQuote(id);
}

export async function deleteQuote(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("quotes").update(str(fd, "id"), { deleted: true });
  revalidatePath("/presupuestos");
  redirect("/presupuestos");
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
  const pb = await requirePB();
  const quote = str(fd, "quote");
  if (!str(fd, "description")) return;

  const siblings = await pb
    .collection("quote_items")
    .getList(1, 1, { filter: pb.filter("quote = {:q}", { q: quote }), sort: "-position" });
  const position = siblings.items.length ? Number(siblings.items[0].position || 0) + 1 : 0;

  await pb.collection("quote_items").create({ ...itemPayload(fd), quote, position });
  await recalcQuote(pb, quote);
  revalidateQuote(quote);
}

export async function updateQuoteItem(fd: FormData) {
  const pb = await requirePB();
  const quote = str(fd, "quote");
  await pb.collection("quote_items").update(str(fd, "id"), itemPayload(fd));
  await recalcQuote(pb, quote);
  revalidateQuote(quote);
}

/**
 * Borrado en duro. El borrado suave de esta app existe para que un cliente
 * offline se entere de que algo desapareció, y los ítems no están en la ruta
 * offline: son subfilas de un formulario que solo se edita en línea.
 */
export async function deleteQuoteItem(fd: FormData) {
  const pb = await requirePB();
  const quote = str(fd, "quote");
  await pb.collection("quote_items").delete(str(fd, "id"));
  await recalcQuote(pb, quote);
  revalidateQuote(quote);
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
  const pb = await requirePB();
  const quote = str(fd, "quote");
  if (!str(fd, "name")) return;

  const siblings = await pb
    .collection("deliverables")
    .getList(1, 1, { filter: pb.filter("quote = {:q}", { q: quote }), sort: "-position" });
  const position = siblings.items.length ? Number(siblings.items[0].position || 0) + 1 : 0;

  await pb.collection("deliverables").create({ ...deliverablePayload(fd), quote, position });
  revalidateQuote(quote);
}

export async function updateDeliverable(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("deliverables").update(str(fd, "id"), deliverablePayload(fd));
  revalidateQuote(str(fd, "quote"));
}

export async function deleteDeliverable(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("deliverables").delete(str(fd, "id"));
  revalidateQuote(str(fd, "quote"));
}

/* -------------------------------------------------- calce en el calendario */

/** Fija el calce propuesto por el buscador de huecos. */
export async function setQuotePlan(fd: FormData) {
  const pb = await requirePB();
  const id = str(fd, "id");
  await pb.collection("quotes").update(id, {
    plan_start: str(fd, "plan_start"),
    plan_end: str(fd, "plan_end"),
    plan_hours_week: num(fd, "plan_hours_week"),
  });
  revalidateQuote(id);
}

export async function clearQuotePlan(fd: FormData) {
  const pb = await requirePB();
  const id = str(fd, "id");
  await pb.collection("quotes").update(id, { plan_start: "", plan_end: "", plan_hours_week: 0 });
  revalidateQuote(id);
}

/* ------------------------------------------------------ estado y aprobación */

/**
 * Aprobar es la única acción de esta app que escribe en cuatro colecciones a la
 * vez, y es a propósito: el momento en que el cliente dice que sí es el único
 * en que tienes toda la información junta y ganas de anotarla. Si el proyecto,
 * la reserva de tiempo y el ingreso proyectado quedan para después, "después"
 * termina siendo el día en que ya no cabía.
 *
 * Usa el calce fijado si lo hay; si no, lo busca en el momento contra el
 * calendario de hoy. Cuando no cabe en el horizonte, reserva igual pero deja el
 * compromiso como `tentative` — negarse a agendar un encargo que ya aceptaste
 * no lo hace desaparecer, solo lo deja invisible.
 */
export async function approveQuote(fd: FormData) {
  const pb = await requirePB();
  const cfg = await getConfig();
  const id = str(fd, "id");
  const quote = await pb.collection("quotes").getOne<Quote>(id);

  const stored = storedSlot(quote);
  const slot = stored ?? (await proposeSlotForQuote(pb, cfg.settings, quote)).slot;
  const today = new Date().toISOString().slice(0, 10);

  /* 1. el proyecto */
  let projectId = quote.project;
  if (!projectId) {
    const project = await pb.collection("projects").create({
      name: quote.title,
      kind: quote.kind,
      status: "active",
      priority: "normal",
      health: "ok",
      client: quote.client,
      start_date: slot?.start || today,
      due_date: slot?.end || "",
      budget: quote.net_total,
      budget_currency: quote.currency,
      summary: quote.description,
      next_cue: "Cuando parta el trabajo",
      next_step: "Revisar el alcance comprometido en el presupuesto",
    });
    projectId = project.id;
  }

  /* 2. la reserva de tiempo */
  if (slot) {
    const existing = await pb
      .collection("commitments")
      .getFullList<Commitment>({ filter: [ALIVE, pb.filter("quote = {:q}", { q: id })].join(" && ") });

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

    if (existing.length) await pb.collection("commitments").update(existing[0].id, payload);
    else await pb.collection("commitments").create(payload);
  }

  /* 3. el ingreso proyectado */
  const already = await pb
    .collection("entries")
    .getFullList({ filter: [ALIVE, pb.filter("quote = {:q}", { q: id })].join(" && ") });

  if (!already.length && quote.net_total > 0) {
    const fx = quote.currency === "CLP" ? 1 : quote.fx_rate || 0;
    const cobro = slot?.end || today;
    await pb.collection("entries").create({
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
  await pb.collection("quotes").update(id, {
    status: "approved",
    decided_date: today,
    project: projectId,
    plan_start: slot?.start || "",
    plan_end: slot?.end || "",
    plan_hours_week: slot?.hoursPerWeek || 0,
  });

  await pb.collection("log").create({
    project: projectId,
    date: today,
    kind: "milestone",
    title: `Presupuesto aprobado · ${quote.number || ""}`.trim(),
    body: quote.description,
  });

  revalidateQuote(id);
  revalidatePath("/calendario");
  revalidatePath("/finanzas");
  revalidatePath("/w");
  revalidatePath(`/w/${projectId}`);
  revalidatePath("/");
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
  const pb = await requirePB();
  const id = str(fd, "id");
  const status = str(fd, "status");
  const previous = str(fd, "previous");

  await pb.collection("quotes").update(id, {
    status,
    decided_date: status === "rejected" ? new Date().toISOString().slice(0, 10) : "",
  });

  if (previous === "approved" && status !== "approved") {
    const commitments = await pb
      .collection("commitments")
      .getFullList<Commitment>({ filter: [ALIVE, pb.filter("quote = {:q}", { q: id })].join(" && ") });
    for (const c of commitments) {
      await pb.collection("commitments").update(c.id, { status: "cancelled" });
    }

    const entries = await pb
      .collection("entries")
      .getFullList({
        filter: [ALIVE, pb.filter("quote = {:q} && status = 'planned'", { q: id })].join(" && "),
      });
    for (const e of entries) {
      await pb.collection("entries").update(e.id, { status: "cancelled" });
    }
  }

  revalidateQuote(id);
  revalidatePath("/calendario");
  revalidatePath("/finanzas");
  revalidatePath("/");
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
  const pb = await requirePB();
  await pb.collection("commitments").create({ ...commitmentPayload(fd), source: "manual" });
  revalidatePath("/calendario");
  revalidatePath("/");
}

export async function updateCommitment(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("commitments").update(str(fd, "id"), commitmentPayload(fd));
  revalidatePath("/calendario");
  revalidatePath("/");
}

export async function setCommitmentStatus(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("commitments").update(str(fd, "id"), { status: str(fd, "status") });
  revalidatePath("/calendario");
  revalidatePath("/");
}

export async function deleteCommitment(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("commitments").update(str(fd, "id"), { deleted: true });
  revalidatePath("/calendario");
  revalidatePath("/");
}

/* ------------------------------------------------- calendarios externos ---- */

export async function saveCalendarFeed(fd: FormData) {
  const pb = await requirePB();
  const id = str(fd, "id");
  const payload = {
    label: str(fd, "label"),
    url: str(fd, "url"),
    active: !bool(fd, "inactive"),
    default_hours: num(fd, "default_hours"),
  };

  const feed = id
    ? await pb.collection("calendar_feeds").update<CalendarFeed>(id, payload)
    : await pb.collection("calendar_feeds").create<CalendarFeed>(payload);

  // Sincronizar de inmediato: si la URL está mala, el error tiene que salir
  // ahora y no en seis horas cuando ya no te acuerdas de qué pegaste.
  if (feed.active) await syncFeed(pb, feed);

  revalidatePath("/calendario");
}

export async function deleteCalendarFeed(fd: FormData) {
  const pb = await requirePB();
  // Los eventos se van con él por cascade: son cache del .ics, no datos tuyos.
  await pb.collection("calendar_feeds").delete(str(fd, "id"));
  revalidatePath("/calendario");
}

export async function syncCalendarFeeds() {
  const pb = await requirePB();
  const feeds = await pb.collection("calendar_feeds").getFullList<CalendarFeed>({ sort: "label" });
  for (const feed of feeds) {
    if (feed.active) await syncFeed(pb, feed);
  }
  revalidatePath("/calendario");
  revalidatePath("/");
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
  const pb = await requirePB();
  await pb.collection("entities").create(entityPayload(fd));
  revalidatePath("/entidades");
}

export async function updateEntity(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("entities").update(str(fd, "id"), entityPayload(fd));
  revalidatePath("/entidades");
}

export async function deleteEntity(fd: FormData) {
  const pb = await requirePB();
  await pb.collection("entities").update(str(fd, "id"), { deleted: true });
  revalidatePath("/entidades");
}
