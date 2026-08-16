/**
 * El vocabulario editable y los números que la app usa para decidir qué
 * mostrarte. Antes esto se leía en el servidor en cada petición; ahora sale de
 * la réplica local (ver `lib/local/config.ts`), así que este módulo se quedó
 * con lo que siempre fue: los tipos, los valores por defecto y la función pura
 * que arma el objeto `Config` a partir de las filas.
 *
 * Sin dependencias del servidor a propósito — lo usan el hook del cliente y
 * cualquier cosa que necesite los mismos rótulos.
 */

import type { Tone } from "./labels";
import * as FALLBACK from "./labels";

export type TaxGroup =
  | "project_kind"
  | "project_status"
  | "priority"
  | "health"
  | "entity_kind"
  | "resource_kind"
  | "resource_state"
  | "log_kind"
  | "entry_status"
  | "direction"
  | "doc_type"
  | "currency"
  | "task_status"
  | "quote_status"
  | "commitment_status";

export interface TaxRow {
  id: string;
  group: TaxGroup;
  value: string;
  label: string;
  color: Tone | "";
  icon: string;
  position: number;
  active: boolean;
  locked: boolean;
}

export interface Settings {
  id: string;
  cold_days: number;
  horizon_days: number;
  rhythm_min_sample: number;
  rhythm_window_days: number;
  routine_grid_days: number;
  iva_rate: number;
  withholding_rate: number;
  default_currency: string;
  digest_hour: number;
  digest_minute: number;
  digest_enabled: boolean;

  /** Encabezado del presupuesto: quién lo emite. */
  issuer_name: string;
  issuer_role: string;
  issuer_tax_id: string;
  issuer_email: string;
  issuer_phone: string;
  issuer_address: string;
  issuer_web: string;

  /** Techo semanal contra el que se mide la carga del calendario. */
  capacity_hours_week: number;
  /** Hasta dónde mira el buscador de huecos antes de rendirse. */
  capacity_horizon_weeks: number;

  quote_overhead_pct: number;
  quote_profit_pct: number;
  quote_validity_days: number;
  quote_prefix: string;

  /**
   * Los datos de ejemplo ya se sembraron alguna vez. No dice que sigan estando:
   * dice que no hay que volver a ponerlos. Borrarlos tiene que ser definitivo.
   */
  demo_seeded: boolean;
  /**
   * La guía de primer ingreso ya se vio. Va con la cuenta y no con el
   * navegador: verla una vez en el teléfono también vale en el escritorio.
   */
  tour_done: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "",
  cold_days: 21,
  horizon_days: 14,
  rhythm_min_sample: 7,
  rhythm_window_days: 60,
  routine_grid_days: 70,
  iva_rate: 0.19,
  withholding_rate: 0.145,
  default_currency: "CLP",
  digest_hour: 7,
  digest_minute: 30,
  digest_enabled: true,

  issuer_name: "",
  issuer_role: "",
  issuer_tax_id: "",
  issuer_email: "",
  issuer_phone: "",
  issuer_address: "",
  issuer_web: "",

  capacity_hours_week: 40,
  capacity_horizon_weeks: 78,

  quote_overhead_pct: 0.15,
  quote_profit_pct: 0.1,
  quote_validity_days: 30,
  quote_prefix: "P",

  demo_seeded: false,
  tour_done: false,
};

/** Mapas compilados, usados solo si la taxonomía todavía no bajó. */
const FALLBACK_LABELS: Record<TaxGroup, Record<string, string>> = {
  project_kind: FALLBACK.PROJECT_KIND,
  project_status: FALLBACK.PROJECT_STATUS,
  priority: FALLBACK.PRIORITY,
  health: FALLBACK.HEALTH,
  entity_kind: FALLBACK.ENTITY_KIND,
  resource_kind: FALLBACK.RESOURCE_KIND,
  resource_state: FALLBACK.RESOURCE_STATE,
  log_kind: FALLBACK.LOG_KIND,
  entry_status: FALLBACK.ENTRY_STATUS,
  direction: FALLBACK.DIRECTION,
  doc_type: FALLBACK.DOC_TYPE,
  currency: { CLP: "CLP", UF: "UF", USD: "USD", EUR: "EUR" },
  task_status: FALLBACK.TASK_STATUS,
  quote_status: FALLBACK.QUOTE_STATUS,
  commitment_status: FALLBACK.COMMITMENT_STATUS,
};

export interface Config {
  rows: TaxRow[];
  settings: Settings;
  /** Todas las filas de un grupo, incluidas las ocultas — para Configuración. */
  all(group: TaxGroup): TaxRow[];
  /** Solo las activas, ordenadas — para los selectores. */
  options(group: TaxGroup): { value: string; label: string }[];
  label(group: TaxGroup, value: string | null | undefined): string;
  tone(group: TaxGroup, value: string | null | undefined): Tone;
  icon(group: TaxGroup, value: string | null | undefined): string;
}

/** Arma el `Config` a partir de las filas crudas. Puro: mismo input, mismo output. */
export function buildConfig(rows: TaxRow[], settings?: Partial<Settings> | null): Config {
  const ordered = [...rows].sort(
    (a, b) =>
      String(a.group).localeCompare(String(b.group)) ||
      (a.position || 0) - (b.position || 0) ||
      String(a.label).localeCompare(String(b.label), "es")
  );

  const byGroup = new Map<TaxGroup, TaxRow[]>();
  for (const r of ordered) {
    const list = byGroup.get(r.group) || [];
    list.push(r);
    byGroup.set(r.group, list);
  }

  const merged: Settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };

  function find(group: TaxGroup, value: string | null | undefined): TaxRow | undefined {
    if (!value) return undefined;
    return byGroup.get(group)?.find((r) => r.value === value);
  }

  return {
    rows: ordered,
    settings: merged,

    all(group) {
      return byGroup.get(group) || [];
    },

    options(group) {
      const list = byGroup.get(group);
      if (list && list.length) {
        return list.filter((r) => r.active).map((r) => ({ value: r.value, label: r.label }));
      }
      const fb = FALLBACK_LABELS[group] || {};
      return Object.keys(fb).map((value) => ({ value, label: fb[value] }));
    },

    label(group, value) {
      if (!value) return "—";
      return find(group, value)?.label || FALLBACK_LABELS[group]?.[value] || value;
    },

    tone(group, value) {
      const color = find(group, value)?.color;
      return (color || "neutral") as Tone;
    },

    icon(group, value) {
      return find(group, value)?.icon || "";
    },
  };
}
