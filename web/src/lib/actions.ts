"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePB } from "./pb.server";
import { splitIVA } from "./money";

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
