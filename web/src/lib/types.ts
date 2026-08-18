// Mirrors the PocketBase collections defined in pb/pb_migrations.
// Identifiers stay in English; the UI labels live in lib/labels.ts.

// Two kinds of enum, and the distinction is load-bearing.
//
// Editable vocabulary lives in the `taxonomy` collection and is stored as plain
// text, so it is typed as `string` here — a union would be a lie the moment you
// add a type from the settings screen.
export type Currency = string;
export type ProjectKind = string;
export type Priority = string;
export type Health = string;
export type EntityKind = string;
export type ResourceKind = string;
export type DocType = string;
export type LogKind = string;

// State machines the code computes on. These stay `select` in the database and
// stay unions here, because branching on them is the whole point.
export type ProjectStatus = "idea" | "active" | "paused" | "waiting" | "done" | "archived";
export type ResourceState = "active" | "reference" | "archived" | "deprecated";
export type Direction = "income" | "expense";
export type EntryStatus = "planned" | "committed" | "invoiced" | "paid" | "cancelled";
export type TaskStatus = "todo" | "doing" | "blocked" | "done";
export type QuoteStatus = "draft" | "pending" | "approved" | "rejected";
export type CommitmentStatus = "tentative" | "confirmed" | "done" | "cancelled";

export interface Base {
  id: string;
  created: string;
  updated: string;
  /** Soft delete marker — every list query must exclude these. */
  deleted?: boolean;
  collectionId?: string;
  collectionName?: string;
}

export interface Entity extends Base {
  name: string;
  kind: EntityKind;
  tax_id: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  notes: string;
  active: boolean;
}

export interface Project extends Base {
  name: string;
  code: string;
  kind: ProjectKind;
  status: ProjectStatus;
  priority: Priority | "";
  health: Health | "";
  client: string;
  parent: string;
  start_date: string;
  due_date: string;
  budget: number;
  budget_currency: Currency | "";
  summary: string;
  next_cue: string;
  next_step: string;
  tags: string[] | null;
  meta: Record<string, unknown> | null;
  notes: string;
  expand?: {
    client?: Entity;
    parent?: Project;
  };
}

export interface Resource extends Base {
  project: string;
  label: string;
  kind: ResourceKind;
  path: string;
  purpose: string;
  state: ResourceState | "";
  pinned: boolean;
  position: number;
}

export interface Account extends Base {
  name: string;
  kind: "bank" | "cash" | "card" | "investment" | "other";
  currency: Currency;
  opening_balance: number;
  notes: string;
  active: boolean;
}

export interface Category extends Base {
  name: string;
  direction: Direction | "both";
  parent: string;
  notes: string;
}

export interface Entry extends Base {
  date: string;
  direction: Direction;
  description: string;
  amount: number;
  currency: Currency;
  fx_rate: number;
  amount_clp: number;
  net: number;
  tax: number;
  withholding: number;
  status: EntryStatus;
  due_date: string;
  paid_date: string;
  project: string;
  entity: string;
  account: string;
  category: string;
  doc_type: DocType | "";
  doc_number: string;
  notes: string;
  files: string[];
  friction_cost: boolean;
  recurring: boolean;
  /** Presupuesto del que salió, cuando lo creó una aprobación. */
  quote: string;
  /** Serie que lo fabricó. Vacío = escrito a mano. */
  series: string;
  /** A qué repetición de la serie corresponde. */
  series_date: string;
  /**
   * Lo borró la serie al cambiarle el calendario, no la persona. Es lo que
   * permite reponerlo si el cambio se revierte sin reponer lo que alguien
   * borró a propósito.
   */
  series_dropped?: boolean;
  expand?: {
    project?: Project;
    entity?: Entity;
    account?: Account;
    category?: Category;
  };
}

/**
 * Un turno de la conversación con el agente.
 *
 * Vive en la base y no en el estado de React porque una conversación que se
 * pierde al recargar deja de usarse para pensar: se vuelve un cuadro de
 * búsqueda. `plan` cuelga del mensaje que lo propuso porque un plan sin su
 * turno no se entiende — lo que explica por qué propuso tres tareas es lo que
 * escribiste arriba.
 */
export interface ChatMessage extends Base {
  role: "user" | "assistant";
  text: string;
  /** El plan propuesto, ya pasado por la aduana. Sin tipar acá: lo tipa `organize/plan`. */
  plan?: unknown;
  applied?: boolean;
  /** El acuse de lo que se escribió al aplicar. */
  result?: string;
}

/** Cada cuánto se repite una serie. Son las siete formas que aparecen en un contrato. */
export type Cadence =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "bimonthly"
  | "quarterly"
  | "semiannual"
  | "annual";

/**
 * La regla de la que salen los movimientos que se repiten.
 *
 * No es un movimiento: es lo que hay que saber para fabricarlos. El sueldo, el
 * arriendo, la cuota del crédito, el proyecto largo que se cobra por mes. Cada
 * repetición se materializa como una fila normal de `entries`
 * (`lib/local/recurring.ts`), así que todo lo que ya lee el ledger la ve sin
 * saber que existen las series.
 */
export interface EntrySeries extends Base {
  direction: Direction;
  description: string;
  amount: number;
  currency: Currency;
  fx_rate: number;
  net: number;
  tax: number;
  withholding: number;

  cadence: Cadence;
  start_date: string;
  /** Vacío = sin término. */
  end_date: string;
  /** 0 = sin límite. */
  occurrences: number;
  /** Días entre la fecha de la cuota y su vencimiento. */
  due_days: number;

  /** Con qué estado nace cada cuota. Nunca `paid`: para eso está `auto_paid`. */
  status: Exclude<EntryStatus, "paid" | "cancelled">;
  /** Las cuotas cuya fecha ya pasó se dan por pagadas solas. */
  auto_paid: boolean;
  /** Pausada. Se guarda al revés de como se lee: un bool nace en false. */
  paused: boolean;

  project: string;
  entity: string;
  account: string;
  category: string;
  doc_type: DocType | "";
  notes: string;
}

export type InboxStatus = "open" | "planned" | "dropped";

export interface InboxItem extends Base {
  text: string;
  status: InboxStatus;
  project: string;
  outcome: string;
  expand?: { project?: Project };
}

export interface Routine extends Base {
  name: string;
  cue: string;
  action: string;
  started: string;
  active: boolean;
  notes: string;
}

export interface RoutineLog extends Base {
  routine: string;
  date: string;
  automaticity: number;
}

export interface Daily extends Base {
  date: string;
  sleep_start: string;
  sleep_end: string;
  energy_morning: number;
  energy_afternoon: number;
  energy_evening: number;
  focus_hours: number;
  notes: string;
}

export interface Task extends Base {
  title: string;
  project: string;
  status: TaskStatus;
  priority: Priority | "";
  due_date: string;
  done_date: string;
  effort_h: number;
  notes: string;
  expand?: { project?: Project };
}

/* ------------------------------------------------------- presupuestos ---- */

export interface Quote extends Base {
  number: string;
  title: string;
  client: string;
  /** Se llena al aprobar, nunca antes. */
  project: string;
  kind: ProjectKind | "";
  description: string;
  status: QuoteStatus;
  date: string;
  valid_until: string;
  decided_date: string;
  currency: Currency;
  fx_rate: number;
  /** Fracciones: 0.15 = 15%. */
  overhead_pct: number;
  profit_pct: number;
  /** Congelados al escribir — ver 1770001700_quotes.js. */
  direct_total: number;
  overhead_amount: number;
  profit_amount: number;
  net_total: number;
  net_total_clp: number;
  work_hours: number;
  max_hours_week: number;
  earliest_start: string;
  plan_start: string;
  plan_end: string;
  plan_hours_week: number;
  terms: string;
  notes: string;
  expand?: {
    client?: Entity;
    project?: Project;
  };
}

export interface QuoteItem extends Base {
  quote: string;
  position: number;
  description: string;
  unit: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface Deliverable extends Base {
  quote: string;
  position: number;
  name: string;
  detail: string;
  /** Días corridos desde el inicio del trabajo, no una fecha. */
  lead_days: number;
}

/* ---------------------------------------------------------- calendario ---- */

/** Una franja fija dentro de la semana. Ver `Commitment.slots`. */
export interface DaySlot {
  /** 1 = lunes … 7 = domingo. */
  day: number;
  /** "HH:MM" */
  start: string;
  end: string;
}

export interface Commitment extends Base {
  title: string;
  kind: ProjectKind | "";
  project: string;
  quote: string;
  entity: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  /**
   * Las franjas semanales de lo que de verdad ocurre a una hora: una clase es
   * los lunes de 14:00 a 15:30, no "1,5 h sueltas en la semana".
   *
   * Vacío es el caso normal y significa flexible: el repartidor del día
   * (`lib/dayplan.ts`) acomoda esas horas donde quepan. `day` va 1..7, lunes a
   * domingo, como ISO.
   */
  slots?: DaySlot[] | null;
  status: CommitmentStatus;
  source: "manual" | "quote" | "";
  notes: string;
  expand?: {
    project?: Project;
    quote?: Quote;
    entity?: Entity;
  };
}

export interface CalendarFeed extends Base {
  label: string;
  url: string;
  active: boolean;
  /** Horas que se le imputan a un evento de día completo. */
  default_hours: number;
  last_sync: string;
  last_error: string;
  event_count: number;
}

export interface CalendarEvent extends Base {
  feed: string;
  uid: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  hours: number;
  location: string;
  expand?: { feed?: CalendarFeed };
}

export interface LogEntry extends Base {
  date: string;
  project: string;
  kind: LogKind;
  title: string;
  body: string;
  hours: number;
  files: string[];
  expand?: { project?: Project };
}
