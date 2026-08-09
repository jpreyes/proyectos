/// <reference path="../pb_data/types.d.ts" />

// Soft deletes, added before there is real data to migrate.
//
// PocketBase has no tombstones: a hard-deleted row simply stops existing, so a
// client that was offline when it happened has no way to learn about it and
// will keep showing the record forever. Marking instead of removing gives the
// deletion an `updated` timestamp, which is what any sync checkpoint needs.
//
// `routine_log` is deliberately excluded: it carries a UNIQUE(routine, date)
// index, so a soft-deleted tick would block re-ticking the same day. Those rows
// are derived data and stay hard-deleted.

const COLLECTIONS = [
  "projects",
  "resources",
  "log",
  "tasks",
  "entries",
  "entities",
  "inbox",
  "routines",
  "daily",
];

migrate(
  (app) => {
    for (const name of COLLECTIONS) {
      const c = app.findCollectionByNameOrId(name);
      c.fields.add(new BoolField({ name: "deleted" }));
      app.save(c);
    }
  },
  (app) => {
    for (const name of COLLECTIONS) {
      const c = app.findCollectionByNameOrId(name);
      c.fields.removeByName("deleted");
      app.save(c);
    }
  }
);
