/// <reference path="../pb_data/types.d.ts" />

// Editable taxonomy + app settings.
//
// Two kinds of enum live in this app and they must not be confused:
//
//   * Taxonomy — your vocabulary. Types of project, of contact, of resource,
//     currencies, document types. Nothing in the code branches on these, so you
//     may add, rename, reorder and remove them freely.
//
//   * State machines — `direction`, `entry_status`, `project_status`,
//     `task_status`, `resource_state`. The code *computes* on these: "por
//     cobrar" is literally `status = invoiced|committed`, the margin depends on
//     `direction`, the dashboard filters on `status = active`. Inventing a new
//     value there would silently produce wrong numbers.
//
// Both live here so labels and colours are editable in one place, but rows in
// the second group carry `locked = true`: their `value` is frozen and they
// cannot be deleted. The database enforces the same split — taxonomy fields are
// plain text, state fields stay `select`.

const AUTH = "@request.auth.id != ''";

const GROUPS = [
  "project_kind",
  "project_status",
  "priority",
  "health",
  "entity_kind",
  "resource_kind",
  "resource_state",
  "log_kind",
  "entry_status",
  "direction",
  "doc_type",
  "currency",
  "task_status",
];

// [group, value, label, color, locked]
const SEED = [
  ["project_kind", "structural", "Estructural", "neutral", false],
  ["project_kind", "inspection", "Inspección", "neutral", false],
  ["project_kind", "research", "Investigación", "neutral", false],
  ["project_kind", "teaching", "Docencia", "neutral", false],
  ["project_kind", "company", "Empresa", "neutral", false],
  ["project_kind", "finance", "Finanzas", "neutral", false],
  ["project_kind", "software", "Software", "neutral", false],
  ["project_kind", "personal", "Personal", "neutral", false],

  ["project_status", "idea", "Idea", "neutral", true],
  ["project_status", "active", "Activo", "accent", true],
  ["project_status", "paused", "En pausa", "warn", true],
  ["project_status", "waiting", "Esperando", "warn", true],
  ["project_status", "done", "Cerrado", "ok", true],
  ["project_status", "archived", "Archivado", "neutral", true],

  ["priority", "low", "Baja", "neutral", false],
  ["priority", "normal", "Normal", "neutral", false],
  ["priority", "high", "Alta", "warn", false],
  ["priority", "critical", "Crítica", "bad", false],

  ["health", "ok", "En marcha", "ok", false],
  ["health", "risk", "En riesgo", "warn", false],
  ["health", "blocked", "Bloqueado", "bad", false],

  ["entity_kind", "person", "Persona", "neutral", false],
  ["entity_kind", "company", "Empresa", "neutral", false],
  ["entity_kind", "university", "Universidad", "neutral", false],
  ["entity_kind", "journal", "Revista", "neutral", false],
  ["entity_kind", "agency", "Agencia / Fondo", "neutral", false],
  ["entity_kind", "other", "Otro", "neutral", false],

  ["resource_kind", "folder", "Carpeta", "neutral", false],
  ["resource_kind", "repo", "Repositorio", "neutral", false],
  ["resource_kind", "url", "Enlace", "neutral", false],
  ["resource_kind", "doc", "Documento", "neutral", false],
  ["resource_kind", "sheet", "Planilla", "neutral", false],
  ["resource_kind", "dataset", "Datos", "neutral", false],
  ["resource_kind", "paper", "Paper", "neutral", false],
  ["resource_kind", "drive", "Nube", "neutral", false],
  ["resource_kind", "other", "Otro", "neutral", false],

  ["resource_state", "active", "En uso", "ok", true],
  ["resource_state", "reference", "Referencia", "neutral", true],
  ["resource_state", "archived", "Archivada", "neutral", true],
  ["resource_state", "deprecated", "Obsoleta", "bad", true],

  ["log_kind", "note", "Nota", "neutral", false],
  ["log_kind", "milestone", "Hito", "accent", false],
  ["log_kind", "meeting", "Reunión", "neutral", false],
  ["log_kind", "finding", "Hallazgo", "warn", false],
  ["log_kind", "progress", "Avance", "neutral", false],
  ["log_kind", "decision", "Decisión", "ok", false],

  ["entry_status", "planned", "Proyectado", "neutral", true],
  ["entry_status", "committed", "Comprometido", "accent", true],
  ["entry_status", "invoiced", "Facturado", "warn", true],
  ["entry_status", "paid", "Pagado", "ok", true],
  ["entry_status", "cancelled", "Anulado", "neutral", true],

  ["direction", "income", "Ingreso", "ok", true],
  ["direction", "expense", "Egreso", "neutral", true],

  ["doc_type", "factura", "Factura", "neutral", false],
  ["doc_type", "boleta", "Boleta", "neutral", false],
  ["doc_type", "honorarios", "Boleta de honorarios", "neutral", false],
  ["doc_type", "recibo", "Recibo", "neutral", false],
  ["doc_type", "transfer", "Transferencia", "neutral", false],
  ["doc_type", "other", "Otro", "neutral", false],

  ["currency", "CLP", "Peso chileno", "neutral", false],
  ["currency", "UF", "Unidad de Fomento", "neutral", false],
  ["currency", "USD", "Dólar", "neutral", false],
  ["currency", "EUR", "Euro", "neutral", false],

  ["task_status", "todo", "Por hacer", "neutral", true],
  ["task_status", "doing", "En curso", "accent", true],
  ["task_status", "blocked", "Bloqueada", "bad", true],
  ["task_status", "done", "Lista", "ok", true],
];

migrate(
  (app) => {
    /* ----------------------------------------------------------- taxonomy - */
    const tax = new Collection({
      type: "base",
      name: "taxonomy",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "group", type: "select", required: true, maxSelect: 1, values: GROUPS },
        // Stable machine value. Frozen when `locked`.
        { name: "value", type: "text", required: true, max: 40 },
        { name: "label", type: "text", required: true, max: 80 },
        {
          name: "color",
          type: "select",
          maxSelect: 1,
          values: ["neutral", "accent", "ok", "warn", "bad"],
        },
        { name: "icon", type: "text", max: 8 },
        { name: "position", type: "number" },
        { name: "active", type: "bool" },
        { name: "locked", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_taxonomy_group_value ON taxonomy (`group`, value)",
        "CREATE INDEX idx_taxonomy_group ON taxonomy (`group`)",
      ],
    });

    app.save(tax);

    const col = app.findCollectionByNameOrId("taxonomy");
    let position = 0;
    let lastGroup = "";
    for (const [group, value, label, color, locked] of SEED) {
      if (group !== lastGroup) {
        position = 0;
        lastGroup = group;
      }
      const r = new Record(col);
      r.set("group", group);
      r.set("value", value);
      r.set("label", label);
      r.set("color", color);
      r.set("position", position++);
      r.set("active", true);
      r.set("locked", locked);
      app.save(r);
    }

    /* ----------------------------------------------------------- settings - */
    // Single row. Every tunable number that used to be a constant in the code.
    const settings = new Collection({
      type: "base",
      name: "settings",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "cold_days", type: "number", min: 1 },
        { name: "horizon_days", type: "number", min: 1 },
        { name: "rhythm_min_sample", type: "number", min: 1 },
        { name: "rhythm_window_days", type: "number", min: 1 },
        { name: "routine_grid_days", type: "number", min: 7 },
        { name: "iva_rate", type: "number", min: 0, max: 1 },
        { name: "withholding_rate", type: "number", min: 0, max: 1 },
        { name: "default_currency", type: "text", max: 8 },
        { name: "digest_hour", type: "number", min: 0, max: 23 },
        { name: "digest_minute", type: "number", min: 0, max: 59 },
        { name: "digest_enabled", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });

    app.save(settings);

    const sCol = app.findCollectionByNameOrId("settings");
    const s = new Record(sCol);
    s.set("cold_days", 21);
    s.set("horizon_days", 14);
    s.set("rhythm_min_sample", 7);
    s.set("rhythm_window_days", 60);
    s.set("routine_grid_days", 70);
    s.set("iva_rate", 0.19);
    s.set("withholding_rate", 0.145);
    s.set("default_currency", "CLP");
    s.set("digest_hour", 7);
    s.set("digest_minute", 30);
    s.set("digest_enabled", true);
    app.save(s);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("settings"));
    app.delete(app.findCollectionByNameOrId("taxonomy"));
  }
);
