/// <reference path="../pb_data/types.d.ts" />

// A project IS a workspace. `parent` makes it hierarchical (área -> proyecto ->
// sub-encargo) and `meta` holds free-form per-kind fields.
//
// `next_cue`/`next_step` and `summary` exist for one reason: cutting re-entry
// cost. Coming back after a week, those lines plus the `resources` map should
// be enough to reload the whole project into your head.
//
// `parent` is a self relation, so it is appended after the collection exists —
// PocketBase validates a relation's target before the collection is persisted.

const AUTH = "@request.auth.id != ''";

migrate(
  (app) => {
    const entities = app.findCollectionByNameOrId("entities");

    const c = new Collection({
      type: "base",
      name: "projects",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "name", type: "text", required: true, max: 200 },
        { name: "code", type: "text", max: 32 },
        {
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: [
            "structural",
            "inspection",
            "research",
            "teaching",
            "company",
            "finance",
            "software",
            "personal",
          ],
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["idea", "active", "paused", "waiting", "done", "archived"],
        },
        {
          name: "priority",
          type: "select",
          maxSelect: 1,
          values: ["low", "normal", "high", "critical"],
        },
        {
          name: "health",
          type: "select",
          maxSelect: 1,
          values: ["ok", "risk", "blocked"],
        },
        {
          name: "client",
          type: "relation",
          maxSelect: 1,
          collectionId: entities.id,
          cascadeDelete: false,
        },
        { name: "start_date", type: "date" },
        { name: "due_date", type: "date" },
        { name: "budget", type: "number" },
        {
          name: "budget_currency",
          type: "select",
          maxSelect: 1,
          values: ["CLP", "UF", "USD", "EUR"],
        },
        { name: "summary", type: "text", max: 500 },

        // The next action, stored as an implementation intention rather than a
        // to-do. Contingent "when X, then Y" plans outperform plain goal
        // intentions because they automate *initiation* — the step that
        // actually fails. `next_cue` is the "cuándo/dónde", `next_step` the "qué".
        { name: "next_cue", type: "text", max: 300 },
        { name: "next_step", type: "text", max: 500 },

        { name: "tags", type: "json", maxSize: 2000 },
        { name: "meta", type: "json", maxSize: 20000 },
        { name: "notes", type: "editor" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_projects_code ON projects (code) WHERE code != ''",
        "CREATE INDEX idx_projects_kind ON projects (kind)",
        "CREATE INDEX idx_projects_status ON projects (status)",
        "CREATE INDEX idx_projects_due ON projects (due_date)",
      ],
    });

    app.save(c);

    const saved = app.findCollectionByNameOrId("projects");
    saved.fields.add(
      new RelationField({
        name: "parent",
        required: false,
        maxSelect: 1,
        collectionId: saved.id,
        cascadeDelete: false,
      })
    );
    app.save(saved);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("projects"));
  }
);
