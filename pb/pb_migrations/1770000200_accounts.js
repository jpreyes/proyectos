/// <reference path="../pb_data/types.d.ts" />

// Where money physically sits: bank accounts, cash, credit cards.

const AUTH = "@request.auth.id != ''";

migrate(
  (app) => {
    const c = new Collection({
      type: "base",
      name: "accounts",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "name", type: "text", required: true, max: 120 },
        {
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["bank", "cash", "card", "investment", "other"],
        },
        {
          name: "currency",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["CLP", "UF", "USD", "EUR"],
        },
        { name: "opening_balance", type: "number" },
        { name: "notes", type: "text", max: 500 },
        { name: "active", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_accounts_name ON accounts (name)"],
    });

    app.save(c);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("accounts"));
  }
);
