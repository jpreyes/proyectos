/// <reference path="../pb_data/types.d.ts" />

// Completa el aislamiento: la taxonomía también pasa a ser de cada cuenta.
//
// En 1770001300 se scopearon los datos personales pero se dejaron comunes
// `accounts`, `categories`, `taxonomy` y `settings`, con el argumento de que
// son catálogos. En la práctica no lo son: las cuentas bancarias son de quien
// las tiene, el vocabulario de proyectos de cada quien es distinto, y
// `settings` incluye preferencias personales (moneda por defecto, tasas, hora
// del resumen). Compartirlos significa que cualquiera edita el catálogo del
// resto.
//
// El motivo original para no scoparlos —dejar a cada cuenta nueva sin dónde
// imputar— se resuelve sembrando: `pb_hooks/seed_user.pb.js` le da a cada
// cuenta nueva su propia copia del catálogo y unas tareas para arrancar.

const SCOPED = ["accounts", "categories", "taxonomy", "settings"];

const OWN = "owner = @request.auth.id";
const AUTH = '@request.auth.id != ""';

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    for (const name of SCOPED) {
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

      c.listRule = OWN;
      c.viewRule = OWN;
      c.createRule = AUTH; // el dueño lo fija el hook, no el cliente
      c.updateRule = OWN;
      c.deleteRule = OWN;

      app.save(c);
    }

    // Las filas sembradas por las migraciones anteriores no tienen dueño. Se
    // adjudican a la cuenta más antigua, que es de quien venían siendo de
    // hecho. Si todavía no hay ninguna cuenta (instalación nueva), se quedan
    // sin dueño y las adopta el primer usuario que se cree — ver seed_user.
    let first = null;
    try {
      const us = app.findRecordsByFilter("users", "id != ''", "created", 1, 0);
      if (us.length) first = us[0];
    } catch (_) {}

    if (first) {
      for (const name of SCOPED) {
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
    for (const name of SCOPED) {
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
