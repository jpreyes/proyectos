/// <reference path="../pb_data/types.d.ts" />

// Los proyectos de ejemplo dicen que son de ejemplo.
//
// Se sembraban con nombres verosímiles —"Refuerzo estructural — Edificio Aula
// Magna"— y esa era justamente la queja: en una cuenta que ya tiene encargos
// reales no hay forma de saber, mirando la lista, cuáles se pueden borrar. El
// aviso estaba en las notas del proyecto y en Configuración, o sea en dos
// lugares donde hay que entrar a buscarlo.
//
// `pb_hooks/lib/demo.js` ya los siembra con el prefijo; esto arregla las
// cuentas donde la siembra ya ocurrió. Solo toca filas marcadas `demo`, y solo
// si el prefijo no está puesto: correrlo dos veces no lo duplica.

const PREFIX = "Proyecto de ejemplo · ";

migrate(
  (app) => {
    let rows = [];
    try {
      rows = app.findRecordsByFilter("projects", "demo = true", "", 100000, 0);
    } catch (_) {
      return; // instalación sin datos de ejemplo todavía
    }

    for (const r of rows) {
      const name = String(r.get("name") || "");
      if (!name || name.indexOf(PREFIX) === 0) continue;
      r.set("name", PREFIX + name);
      app.save(r);
    }
  },
  (app) => {
    let rows = [];
    try {
      rows = app.findRecordsByFilter("projects", "demo = true", "", 100000, 0);
    } catch (_) {
      return;
    }

    for (const r of rows) {
      const name = String(r.get("name") || "");
      if (name.indexOf(PREFIX) !== 0) continue;
      r.set("name", name.slice(PREFIX.length));
      app.save(r);
    }
  }
);
