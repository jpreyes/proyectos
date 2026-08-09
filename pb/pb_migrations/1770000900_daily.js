/// <reference path="../pb_data/types.d.ts" />

// Daily rhythm log — sleep window and energy by slot.
//
// Chronotypes vary widely, and the spread is large enough that generic advice
// ("do the hard thing first thing in the morning") is wrong for a substantial
// share of people. The only way to know a real peak is to measure it. This
// collection exists to answer one question: is demanding work being scheduled
// inside or outside the hours that actually work?
//
// Times are stored as "HH:MM" strings — local wall-clock is what matters here,
// and a timestamp would drag timezone conversion into a purely personal log.

const AUTH = "@request.auth.id != ''";

migrate(
  (app) => {
    const c = new Collection({
      type: "base",
      name: "daily",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "date", type: "date", required: true },
        { name: "sleep_start", type: "text", max: 5 },
        { name: "sleep_end", type: "text", max: 5 },
        // 1 = arrastrándome, 5 = lúcido
        { name: "energy_morning", type: "number", min: 0, max: 5 },
        { name: "energy_afternoon", type: "number", min: 0, max: 5 },
        { name: "energy_evening", type: "number", min: 0, max: 5 },
        { name: "focus_hours", type: "number", min: 0, max: 24 },
        { name: "notes", type: "text", max: 1000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_daily_date ON daily (date)"],
    });

    app.save(c);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("daily"));
  }
);
