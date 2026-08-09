/// <reference path="../pb_data/types.d.ts" />

// Routines, modelled the way habit research actually describes them.
//
// Automaticity grows along an asymptotic curve; the median time to plateau was
// 66 days in Lally et al. and 59 in Keller et al., with a very wide spread
// (18-254 days). Crucially, **missing a single repetition does not materially
// affect the process** — which is why there is no streak field here, and why
// nothing in the UI ever "breaks". What predicts automaticity is cumulative
// repetition, so that is what gets stored and plotted.
//
// `cue` accepts either a routine anchor or a clock time: the randomized trial
// comparing both found no difference between them.

const AUTH = "@request.auth.id != ''";

migrate(
  (app) => {
    const routines = new Collection({
      type: "base",
      name: "routines",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "name", type: "text", required: true, max: 160 },
        { name: "cue", type: "text", max: 300 },
        { name: "action", type: "text", max: 300 },
        { name: "started", type: "date" },
        { name: "active", type: "bool" },
        { name: "notes", type: "text", max: 1000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_routines_active ON routines (active)"],
    });

    app.save(routines);

    const saved = app.findCollectionByNameOrId("routines");

    const log = new Collection({
      type: "base",
      name: "routine_log",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        {
          name: "routine",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: saved.id,
          cascadeDelete: true,
        },
        { name: "date", type: "date", required: true },
        // Self-reported automaticity, 1-7, the scale habit studies use.
        // Optional: the repetition itself is the datum that matters.
        { name: "automaticity", type: "number", min: 0, max: 7 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_routine_log_unique ON routine_log (routine, date)",
        "CREATE INDEX idx_routine_log_date ON routine_log (date)",
      ],
    });

    app.save(log);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("routine_log"));
    app.delete(app.findCollectionByNameOrId("routines"));
  }
);
