/// <reference path="../pb_data/types.d.ts" />

// Aislamiento por dueño.
//
// Hasta acá las reglas eran `@request.auth.id != ''`: cualquier cuenta
// autenticada veía y editaba TODO. Servía mientras la app era de un solo
// usuario, pero deja de servir en cuanto existe una segunda cuenta — que
// entonces entra a tus proyectos, tu ledger y tu bandeja.
//
// Ahora cada registro lleva `owner` y solo su dueño lo ve. El campo lo pone el
// hook `owner.pb.js` en cada creación; el usuario no lo elige y no puede
// falsearlo (el hook sobrescribe lo que venga en el body).
//
// La taxonomía compartida — accounts, categories, taxonomy, settings — queda
// como está, común a todas las cuentas: son catálogos, no datos personales, y
// scopearlos dejaría a cada cuenta nueva con un ledger sin categorías ni
// cuentas donde imputar.

// Datos personales: se scopean.
const OWNED = [
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
];

const OWN = "owner = @request.auth.id";
const AUTH = '@request.auth.id != ""';

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    for (const name of OWNED) {
      const c = app.findCollectionByNameOrId(name);

      if (!c.fields.getByName("owner")) {
        c.fields.add(
          new RelationField({
            name: "owner",
            required: true,
            maxSelect: 1,
            cascadeDelete: true,
            collectionId: users.id,
          })
        );
      }

      // Crear solo exige estar autenticado: el dueño lo fija el hook, no el
      // cliente. Todo lo demás va contra el propio registro.
      c.listRule = OWN;
      c.viewRule = OWN;
      c.createRule = AUTH;
      c.updateRule = OWN;
      c.deleteRule = OWN;

      app.save(c);
    }

    // Registros previos a esta migración: se adjudican al usuario más antiguo,
    // que en una instalación de un solo usuario es el dueño real de todo. Sin
    // esto quedarían huérfanos e invisibles (no filtrados: las reglas exigen
    // owner, y un owner vacío no coincide con nadie).
    let first = null;
    try {
      const us = app.findRecordsByFilter("users", "id != ''", "created", 1, 0);
      if (us.length) first = us[0];
    } catch (_) {}

    if (first) {
      for (const name of OWNED) {
        let rows = [];
        try {
          rows = app.findRecordsByFilter(name, "owner = ''", "", 100000, 0);
        } catch (_) {
          continue;
        }
        for (const r of rows) {
          r.set("owner", first.id);
          app.save(r);
        }
      }
    }
  },
  (app) => {
    for (const name of OWNED) {
      const c = app.findCollectionByNameOrId(name);
      c.fields.removeByName("owner");
      c.listRule = AUTH;
      c.viewRule = AUTH;
      c.createRule = AUTH;
      c.updateRule = AUTH;
      c.deleteRule = AUTH;
      app.save(c);
    }
  }
);
