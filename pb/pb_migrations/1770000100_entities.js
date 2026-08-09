/// <reference path="../pb_data/types.d.ts" />

// Counterparties: people, companies, universities, journals, funding agencies.
// Reused across projects and ledger entries.

const AUTH = "@request.auth.id != ''";

migrate(
  (app) => {
    const c = new Collection({
      type: "base",
      name: "entities",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "name", type: "text", required: true, max: 200 },
        {
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["person", "company", "university", "journal", "agency", "other"],
        },
        { name: "tax_id", type: "text", max: 32 },
        { name: "email", type: "text", max: 200 },
        { name: "phone", type: "text", max: 60 },
        { name: "address", type: "text", max: 300 },
        { name: "website", type: "text", max: 200 },
        { name: "notes", type: "text", max: 2000 },
        { name: "active", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_entities_kind ON entities (kind)",
        "CREATE INDEX idx_entities_name ON entities (name)",
      ],
    });

    app.save(c);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("entities"));
  }
);
