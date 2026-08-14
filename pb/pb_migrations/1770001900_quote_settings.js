/// <reference path="../pb_data/types.d.ts" />

// Lo que el presupuestador necesita de `settings`, más sus dos grupos de
// taxonomía.
//
// Tres bloques:
//
//   1. Credenciales del emisor. El encabezado del documento — tu nombre, tu
//      título, tu RUT, cómo te contactan. Va en `settings` y no en una
//      colección propia porque es una fila única por cuenta, que es
//      exactamente lo que `settings` ya es.
//
//   2. Capacidad. `capacity_hours_week` es el número contra el que se compara
//      la carga de cada semana: el techo que ningún encargo nuevo debería
//      hacer saltar. `capacity_horizon_weeks` es hasta dónde mira el buscador
//      de huecos antes de rendirse.
//
//   3. Valores por defecto del presupuesto: gastos generales, utilidades,
//      validez y el prefijo de la numeración. Son defaults, no verdades — cada
//      presupuesto guarda su propia copia (ver 1770001700), así que cambiarlos
//      acá no toca ningún documento ya emitido.
//
// La taxonomía nueva va con `locked = true`: son máquinas de estado, el código
// computa sobre ellas y la base las tiene como `select`. Se puede cambiar la
// etiqueta y el color, no el valor.

const SETTINGS_FIELDS = [
  // emisor
  ["issuer_name", "text", { max: 200 }],
  ["issuer_role", "text", { max: 200 }],
  ["issuer_tax_id", "text", { max: 32 }],
  ["issuer_email", "text", { max: 200 }],
  ["issuer_phone", "text", { max: 60 }],
  ["issuer_address", "text", { max: 300 }],
  ["issuer_web", "text", { max: 200 }],
  // capacidad
  ["capacity_hours_week", "number", { min: 0 }],
  ["capacity_horizon_weeks", "number", { min: 4 }],
  // defaults del presupuesto
  ["quote_overhead_pct", "number", { min: 0, max: 1 }],
  ["quote_profit_pct", "number", { min: 0, max: 1 }],
  ["quote_validity_days", "number", { min: 1 }],
  ["quote_prefix", "text", { max: 12 }],
];

const DEFAULTS = {
  capacity_hours_week: 40,
  capacity_horizon_weeks: 78,
  quote_overhead_pct: 0.15,
  quote_profit_pct: 0.1,
  quote_validity_days: 30,
  quote_prefix: "P",
};

const NEW_GROUPS = ["quote_status", "commitment_status"];

// [group, value, label, color]
const SEED = [
  ["quote_status", "draft", "Borrador", "neutral"],
  ["quote_status", "pending", "Pendiente", "warn"],
  ["quote_status", "approved", "Aprobado", "ok"],
  ["quote_status", "rejected", "Rechazado", "bad"],

  ["commitment_status", "tentative", "Tentativo", "warn"],
  ["commitment_status", "confirmed", "Confirmado", "accent"],
  ["commitment_status", "done", "Cumplido", "ok"],
  ["commitment_status", "cancelled", "Anulado", "neutral"],
];

function makeField(name, type, opts) {
  const spec = Object.assign({ name: name }, opts);
  if (type === "text") return new TextField(spec);
  return new NumberField(spec);
}

/**
 * Guarda una fila de `settings` aunque no tenga dueño.
 *
 * En una instalación nueva las migraciones siembran `settings` antes de que
 * exista ninguna cuenta, así que la fila queda sin `owner` —lo adopta el primer
 * usuario que se cree, ver pb_hooks/lib/seed.js— y `owner` es obligatorio desde
 * 1770001400. Un `save()` normal la rechaza con "owner: cannot be blank" y
 * revienta la migración entera.
 *
 * Saltarse la validación es lo correcto acá: no estamos aceptando datos de
 * nadie, estamos rellenando defaults en una fila que ya existía.
 */
function persist(app, record) {
  try {
    app.save(record);
  } catch (err) {
    app.saveNoValidate(record);
  }
}

migrate(
  (app) => {
    /* ----------------------------------------------------------- settings - */
    const settings = app.findCollectionByNameOrId("settings");
    for (const [name, type, opts] of SETTINGS_FIELDS) {
      if (!settings.fields.getByName(name)) {
        settings.fields.add(makeField(name, type, opts));
      }
    }
    app.save(settings);

    // Las filas ya existentes quedarían en cero, y una capacidad de cero
    // semanal deja el calendario sobrecargado desde el primer día.
    let rows = [];
    try {
      rows = app.findRecordsByFilter("settings", "id != ''", "", 1000, 0);
    } catch (_) {}
    for (const r of rows) {
      for (const key in DEFAULTS) {
        if (!r.get(key)) r.set(key, DEFAULTS[key]);
      }
      persist(app, r);
    }

    /* ----------------------------------------------------------- taxonomy - */
    // `group` es un select: sin ampliar la lista de valores, las filas nuevas
    // no pasan la validación.
    const tax = app.findCollectionByNameOrId("taxonomy");
    const groupField = tax.fields.getByName("group");
    const values = groupField.values.slice();
    for (const g of NEW_GROUPS) {
      if (values.indexOf(g) === -1) values.push(g);
    }
    groupField.values = values;
    app.save(tax);

    // Una copia por cuenta: la taxonomía es por dueño desde 1770001400.
    // En una instalación nueva todavía no hay ninguna cuenta — ahí no se
    // siembra nada acá, y de eso se encarga `ensureGroups()` en
    // pb_hooks/lib/seed.js, que corre en cada arranque.
    let users = [];
    try {
      users = app.findRecordsByFilter("users", "id != ''", "created", 500, 0);
    } catch (_) {}

    const taxCol = app.findCollectionByNameOrId("taxonomy");
    for (const u of users) {
      let position = 0;
      let lastGroup = "";
      for (const [group, value, label, color] of SEED) {
        if (group !== lastGroup) {
          position = 0;
          lastGroup = group;
        }
        const pos = position++;

        // Idempotente: el índice único es (owner, group, value).
        let existing = [];
        try {
          existing = app.findRecordsByFilter(
            "taxonomy",
            'owner = "' + u.id + '" && group = "' + group + '" && value = "' + value + '"',
            "",
            1,
            0
          );
        } catch (_) {}
        if (existing.length) continue;

        const r = new Record(taxCol);
        r.set("group", group);
        r.set("value", value);
        r.set("label", label);
        r.set("color", color);
        r.set("position", pos);
        r.set("active", true);
        r.set("locked", true);
        r.set("owner", u.id);
        try {
          app.save(r);
        } catch (err) {
          console.log("1770001900: no se pudo sembrar " + group + "/" + value + ": " + err);
        }
      }
    }
  },
  (app) => {
    const settings = app.findCollectionByNameOrId("settings");
    for (const [name] of SETTINGS_FIELDS) settings.fields.removeByName(name);
    app.save(settings);

    for (const group of NEW_GROUPS) {
      let rows = [];
      try {
        rows = app.findRecordsByFilter("taxonomy", 'group = "' + group + '"', "", 10000, 0);
      } catch (_) {}
      for (const r of rows) app.delete(r);
    }

    const tax = app.findCollectionByNameOrId("taxonomy");
    const groupField = tax.fields.getByName("group");
    groupField.values = groupField.values.filter((v) => NEW_GROUPS.indexOf(v) === -1);
    app.save(tax);
  }
);
