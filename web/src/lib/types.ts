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
  expand?: {
    project?: Project;
    entity?: Entity;
    account?: Account;
    category?: Category;
  };
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

export interface Commitment extends Base {
  title: string;
  kind: ProjectKind | "";
  project: string;
  quote: string;
  entity: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
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
