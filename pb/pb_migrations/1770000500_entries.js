/// <reference path="../pb_data/types.d.ts" />

// The ledger. One row per money movement, planned or real.
//
// `status` is the lifecycle that makes "cuentas por cobrar" possible:
//   planned -> committed -> invoiced -> paid   (or cancelled)
//
// Amounts are stored in the entry's own `currency`. `fx_rate` is the value of
// one unit of that currency in CLP *on the entry date* (1 for CLP, the UF value
// for UF, the observed dollar for USD). `amount_clp` is the frozen conversion,
// so historical reports never shift when today's UF changes.

const AUTH = "@request.auth.id != ''";

migrate(
  (app) => {
    const projects = app.findCollectionByNameOrId("projects");
    const entities = app.findCollectionByNameOrId("entities");
    const accounts = app.findCollectionByNameOrId("accounts");
    const categories = app.findCollectionByNameOrId("categories");

    const c = new Collection({
      type: "base",
      name: "entries",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "date", type: "date", required: true },
        {
          name: "direction",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["income", "expense"],
        },
        { name: "description", type: "text", required: true, max: 300 },

        // money
        { name: "amount", type: "number", required: true },
        {
          name: "currency",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["CLP", "UF", "USD", "EUR"],
        },
        { name: "fx_rate", type: "number" },
        { name: "amount_clp", type: "number" },
        { name: "net", type: "number" },
        { name: "tax", type: "number" },
        { name: "withholding", type: "number" },

        // lifecycle
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["planned", "committed", "invoiced", "paid", "cancelled"],
        },
        { name: "due_date", type: "date" },
        { name: "paid_date", type: "date" },

        // links
        {
          name: "project",
          type: "relation",
          maxSelect: 1,
          collectionId: projects.id,
          cascadeDelete: false,
        },
        {
          name: "entity",
          type: "relation",
          maxSelect: 1,
          collectionId: entities.id,
          cascadeDelete: false,
        },
        {
          name: "account",
          type: "relation",
          maxSelect: 1,
          collectionId: accounts.id,
          cascadeDelete: false,
        },
        {
          name: "category",
          type: "relation",
          maxSelect: 1,
          collectionId: categories.id,
          cascadeDelete: false,
        },

        // paperwork
        {
          name: "doc_type",
          type: "select",
          maxSelect: 1,
          values: ["factura", "boleta", "honorarios", "recibo", "transfer", "other"],
        },
        { name: "doc_number", type: "text", max: 40 },
        { name: "notes", type: "text", max: 2000 },
        {
          name: "files",
          type: "file",
          maxSelect: 10,
          maxSize: 15728640,
        },

        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_entries_date ON entries (date)",
        "CREATE INDEX idx_entries_status ON entries (status)",
        "CREATE INDEX idx_entries_direction ON entries (direction)",
        "CREATE INDEX idx_entries_project ON entries (project)",
        "CREATE INDEX idx_entries_due ON entries (due_date)",
      ],
    });

    app.save(c);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("entries"));
  }
);
