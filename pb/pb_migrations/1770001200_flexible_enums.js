/// <reference path="../pb_data/types.d.ts" />

// Frees the taxonomy fields from the database schema.
//
// These stop being `select` (whose allowed values live in a migration, so
// adding one means a deploy) and become plain text driven by the `taxonomy`
// collection. Deliberately NOT relations: if a type is later deleted, existing
// records keep a readable value instead of a dangling foreign key, and today's
// data stays valid without being rewritten.
//
// The state-machine fields — direction, entry/project/task status,
// resource_state — keep their `select` on purpose. The database itself should
// refuse an invented "por cobrar" state, because the reports compute on it.

const CONVERT = [
  ["projects", "kind"],
  ["projects", "priority"],
  ["projects", "health"],
  ["projects", "budget_currency"],
  ["entities", "kind"],
  ["resources", "kind"],
  ["log", "kind"],
  ["tasks", "priority"],
  ["entries", "doc_type"],
  ["entries", "currency"],
  ["accounts", "currency"],
];

function allRecords(app, collection) {
  return app.findRecordsByFilter(collection, "id != ''", "", 100000, 0);
}

migrate(
  (app) => {
    for (const [collection, field] of CONVERT) {
      // 1. keep the current values in memory — replacing the field drops the column
      const saved = {};
      for (const r of allRecords(app, collection)) {
        saved[r.id] = r.get(field);
      }

      // 2. swap select -> text
      const c = app.findCollectionByNameOrId(collection);
      c.fields.removeByName(field);
      c.fields.add(new TextField({ name: field, max: 40 }));
      app.save(c);

      // 3. write the values back
      for (const r of allRecords(app, collection)) {
        const v = saved[r.id];
        if (v) {
          r.set(field, v);
          app.save(r);
        }
      }
    }
  },
  () => {
    // Irreversible by design: turning text back into a select would need the
    // original value list, which by then may no longer describe the data.
    throw new Error("1770001200_flexible_enums is not reversible");
  }
);
