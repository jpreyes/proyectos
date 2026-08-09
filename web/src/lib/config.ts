import "server-only";
import { cache } from "react";
import { pbServer } from "./pb.server";
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
  | "task_status";

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
}

const DEFAULT_SETTINGS: Settings = {
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
};

/** Hardcoded maps, used only if the taxonomy collection is unreachable. */
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
};

export interface Config {
  rows: TaxRow[];
  settings: Settings;
  /** Every row of a group, including inactive ones — for the settings screen. */
  all(group: TaxGroup): TaxRow[];
  /** Active rows only, ordered — for pickers. */
  options(group: TaxGroup): { value: string; label: string }[];
  label(group: TaxGroup, value: string | null | undefined): string;
  tone(group: TaxGroup, value: string | null | undefined): Tone;
  icon(group: TaxGroup, value: string | null | undefined): string;
}

/**
 * Loaded once per request (React `cache` dedupes), so every component may call
 * it without worrying about repeated queries.
 *
 * Falls back to the compiled-in maps when the collections are missing, which
 * keeps the app rendering during a partial deploy instead of erroring out.
 */
export const getConfig = cache(async (): Promise<Config> => {
  let rows: TaxRow[] = [];
  let settings = DEFAULT_SETTINGS;

  try {
    const pb = await pbServer();
    rows = await pb
      .collection("taxonomy")
      .getFullList<TaxRow>({ sort: "group,position,label" });

    const list = await pb.collection("settings").getList<Settings>(1, 1);
    if (list.items.length) settings = { ...DEFAULT_SETTINGS, ...list.items[0] };
  } catch {
    // keep defaults
  }

  const byGroup = new Map<TaxGroup, TaxRow[]>();
  for (const r of rows) {
    const list = byGroup.get(r.group) || [];
    list.push(r);
    byGroup.set(r.group, list);
  }

  function find(group: TaxGroup, value: string | null | undefined): TaxRow | undefined {
    if (!value) return undefined;
    return byGroup.get(group)?.find((r) => r.value === value);
  }

  return {
    rows,
    settings,

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
});
