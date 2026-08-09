// Spanish UI strings for every enum in the schema, in one place.

import type {
  Direction,
  DocType,
  EntityKind,
  EntryStatus,
  Health,
  LogKind,
  Priority,
  ProjectKind,
  ProjectStatus,
  ResourceKind,
  ResourceState,
  TaskStatus,
} from "./types";

export const PROJECT_KIND: Record<ProjectKind, string> = {
  structural: "Estructural",
  inspection: "Inspección",
  research: "Investigación",
  teaching: "Docencia",
  company: "Empresa",
  finance: "Finanzas",
  software: "Software",
  personal: "Personal",
};

export const PROJECT_STATUS: Record<ProjectStatus, string> = {
  idea: "Idea",
  active: "Activo",
  paused: "En pausa",
  waiting: "Esperando",
  done: "Cerrado",
  archived: "Archivado",
};

export const PRIORITY: Record<Priority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  critical: "Crítica",
};

export const HEALTH: Record<Health, string> = {
  ok: "En marcha",
  risk: "En riesgo",
  blocked: "Bloqueado",
};

export const ENTITY_KIND: Record<EntityKind, string> = {
  person: "Persona",
  company: "Empresa",
  university: "Universidad",
  journal: "Revista",
  agency: "Agencia / Fondo",
  other: "Otro",
};

export const RESOURCE_KIND: Record<ResourceKind, string> = {
  folder: "Carpeta",
  repo: "Repositorio",
  url: "Enlace",
  doc: "Documento",
  sheet: "Planilla",
  dataset: "Datos",
  paper: "Paper",
  drive: "Nube",
  other: "Otro",
};

export const RESOURCE_KIND_ICON: Record<ResourceKind, string> = {
  folder: "📁",
  repo: "⑂",
  url: "🔗",
  doc: "📄",
  sheet: "▦",
  dataset: "⛁",
  paper: "📑",
  drive: "☁",
  other: "◇",
};

export const RESOURCE_STATE: Record<ResourceState, string> = {
  active: "En uso",
  reference: "Referencia",
  archived: "Archivada",
  deprecated: "Obsoleta",
};

export const DIRECTION: Record<Direction, string> = {
  income: "Ingreso",
  expense: "Egreso",
};

export const ENTRY_STATUS: Record<EntryStatus, string> = {
  planned: "Proyectado",
  committed: "Comprometido",
  invoiced: "Facturado",
  paid: "Pagado",
  cancelled: "Anulado",
};

export const DOC_TYPE: Record<DocType, string> = {
  factura: "Factura",
  boleta: "Boleta",
  honorarios: "Boleta de honorarios",
  recibo: "Recibo",
  transfer: "Transferencia",
  other: "Otro",
};

export const TASK_STATUS: Record<TaskStatus, string> = {
  todo: "Por hacer",
  doing: "En curso",
  blocked: "Bloqueada",
  done: "Lista",
};

export const LOG_KIND: Record<LogKind, string> = {
  note: "Nota",
  milestone: "Hito",
  meeting: "Reunión",
  finding: "Hallazgo",
  progress: "Avance",
  decision: "Decisión",
};

export const LOG_KIND_ICON: Record<LogKind, string> = {
  note: "•",
  milestone: "◆",
  meeting: "◎",
  finding: "!",
  progress: "▸",
  decision: "✓",
};

/** Tone used by the Badge component. */
export type Tone = "neutral" | "accent" | "ok" | "warn" | "bad";

export const STATUS_TONE: Record<ProjectStatus, Tone> = {
  idea: "neutral",
  active: "accent",
  paused: "warn",
  waiting: "warn",
  done: "ok",
  archived: "neutral",
};

export const HEALTH_TONE: Record<Health, Tone> = {
  ok: "ok",
  risk: "warn",
  blocked: "bad",
};

export const ENTRY_STATUS_TONE: Record<EntryStatus, Tone> = {
  planned: "neutral",
  committed: "accent",
  invoiced: "warn",
  paid: "ok",
  cancelled: "neutral",
};

export const RESOURCE_STATE_TONE: Record<ResourceState, Tone> = {
  active: "ok",
  reference: "neutral",
  archived: "neutral",
  deprecated: "bad",
};

/** Options helper for <select>. */
export function options<T extends string>(map: Record<T, string>) {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value] }));
}
