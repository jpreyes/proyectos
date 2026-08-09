/// <reference path="../pb_data/types.d.ts" />

// Baseline taxonomy so the ledger is usable on first login.
// Safe to re-run: existing names are skipped.

const CATEGORIES = [
  ["Honorarios / Asesorías", "income"],
  ["Proyecto estructural", "income"],
  ["Inspección técnica", "income"],
  ["Docencia", "income"],
  ["Investigación / Fondos", "income"],
  ["Licencias / Software", "income"],
  ["Otros ingresos", "income"],
  ["Remuneraciones", "expense"],
  ["Servicios profesionales", "expense"],
  ["Software y suscripciones", "expense"],
  ["Equipamiento", "expense"],
  ["Terreno y traslados", "expense"],
  ["Oficina y servicios", "expense"],
  ["Impuestos y contabilidad", "expense"],
  ["Publicación / Congresos", "expense"],
  ["Otros egresos", "expense"],
];

const ACCOUNTS = [
  ["Cuenta corriente", "bank", "CLP"],
  ["Efectivo", "cash", "CLP"],
];

migrate(
  (app) => {
    const catCol = app.findCollectionByNameOrId("categories");
    for (const [name, direction] of CATEGORIES) {
      try {
        app.findFirstRecordByData("categories", "name", name);
        continue; // already there
      } catch (_) {
        // not found -> create
      }
      const r = new Record(catCol);
      r.set("name", name);
      r.set("direction", direction);
      app.save(r);
    }

    const accCol = app.findCollectionByNameOrId("accounts");
    for (const [name, kind, currency] of ACCOUNTS) {
      try {
        app.findFirstRecordByData("accounts", "name", name);
        continue;
      } catch (_) {
        // not found -> create
      }
      const r = new Record(accCol);
      r.set("name", name);
      r.set("kind", kind);
      r.set("currency", currency);
      r.set("opening_balance", 0);
      r.set("active", true);
      app.save(r);
    }
  },
  (app) => {
    for (const [name] of CATEGORIES) {
      try {
        app.delete(app.findFirstRecordByData("categories", "name", name));
      } catch (_) {}
    }
    for (const [name] of ACCOUNTS) {
      try {
        app.delete(app.findFirstRecordByData("accounts", "name", name));
      } catch (_) {}
    }
  }
);
