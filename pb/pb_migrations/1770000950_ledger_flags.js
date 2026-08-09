/// <reference path="../pb_data/types.d.ts" />

// Two flags on the ledger.
//
// `friction_cost`: money lost to administrative slips rather than to decisions
// — late fees, penalties, interest for missing a deadline, replacing things,
// buying the same thing twice, subscriptions nobody cancelled. Individually
// each one is too small to notice; that is exactly why it stays invisible.
// Tagging them turns a diffuse leak into one annual number.
//
// `recurring`: marks subscriptions so they get reviewed instead of renewed by
// default.
//
// Idempotent: adds only what is missing, so it is safe on a database that was
// migrated under the previous field naming.

migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("entries");
    let changed = false;

    for (const name of ["friction_cost", "recurring"]) {
      if (!c.fields.some((f) => f.name === name)) {
        c.fields.add(new BoolField({ name }));
        changed = true;
      }
    }

    if (changed) app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("entries");
    c.fields.removeByName("friction_cost");
    c.fields.removeByName("recurring");
    app.save(c);
  }
);
