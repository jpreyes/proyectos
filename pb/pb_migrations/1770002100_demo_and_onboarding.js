/// <reference path="../pb_data/types.d.ts" />

// Lo que hace falta para dos cosas nuevas: los datos de ejemplo y la guía de
// primer ingreso.
//
//   1. `demo` en cada colección con datos. Una cuenta recién creada abría en
//      blanco, y una app vacía no enseña nada: no se ve qué es un workspace,
//      cómo se lee un presupuesto ni de dónde sale "por cobrar". Se siembra un
//      encargo completo de ejemplo (ver pb_hooks/lib/demo.js), y esta marca es
//      lo que permite **borrarlo entero de un toque** cuando ya cumplió. Sin
//      ella habría que adivinar qué era ejemplo y qué escribió la persona, que
//      es exactamente la razón por la que los datos de demostración terminan
//      quedándose para siempre.
//
//   2. Dos banderas en `settings`. `demo_seeded` recuerda que la siembra ya
//      ocurrió, para que borrar los ejemplos sea definitivo y no algo que el
//      próximo arranque deshace. `tour_done` recuerda que la guía ya se vio;
//      vive en `settings` y no en el navegador a propósito, porque es una
//      propiedad de la cuenta y no del dispositivo: verla una vez en el
//      teléfono debería bastar también en el escritorio.

const DEMO_COLLECTIONS = [
  "projects",
  "resources",
  "log",
  "tasks",
  "entries",
  "entities",
  "inbox",
  "routines",
  "routine_log",
  "daily",
  "quotes",
  "quote_items",
  "deliverables",
  "commitments",
];

const SETTINGS_FLAGS = ["demo_seeded", "tour_done"];

migrate(
  (app) => {
    for (const name of DEMO_COLLECTIONS) {
      const c = app.findCollectionByNameOrId(name);
      if (c.fields.some((f) => f.name === "demo")) continue;
      c.fields.add(new BoolField({ name: "demo" }));
      app.save(c);
    }

    const settings = app.findCollectionByNameOrId("settings");
    let changed = false;
    for (const name of SETTINGS_FLAGS) {
      if (settings.fields.some((f) => f.name === name)) continue;
      settings.fields.add(new BoolField({ name: name }));
      changed = true;
    }
    if (changed) app.save(settings);
  },
  (app) => {
    for (const name of DEMO_COLLECTIONS) {
      const c = app.findCollectionByNameOrId(name);
      c.fields.removeByName("demo");
      app.save(c);
    }
    const settings = app.findCollectionByNameOrId("settings");
    for (const name of SETTINGS_FLAGS) settings.fields.removeByName(name);
    app.save(settings);
  }
);
