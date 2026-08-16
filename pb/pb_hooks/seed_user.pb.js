/// <reference path="../pb_data/types.d.ts" />

// Deja cada cuenta lista para usar.
//
// La taxonomía es de cada dueño (1770001400), así que una cuenta recién creada
// abriría la app en blanco: sin categorías, sin cuentas contables, sin tipos de
// proyecto y sin fila de `settings`. Acá se le copia el catálogo y, encima, un
// encargo completo de ejemplo (lib/demo.js) para que la primera pantalla
// muestre de qué se trata la app en vez de una lista vacía.
//
// Dos disparadores, y el segundo importa: el hook de creación cubre las cuentas
// nuevas, y el de arranque repara las que hayan quedado a medias — cuentas
// creadas antes de esta migración, o una siembra que se cortó por la mitad.
// seedUser es idempotente, así que correrlo de más no duplica nada.
//
// OJO: los handlers corren en una VM aislada que NO ve el ámbito de este
// archivo. Todo entra por require() acá dentro. (Ver daily_digest.pb.js.)

onRecordAfterCreateSuccess(function (e) {
  e.next();
  try {
    const demo = require(`${__hooks}/lib/demo.js`);
    require(`${__hooks}/lib/seed.js`).seedUser(e.record.id, demo);
  } catch (err) {
    // Que falle la siembra no puede invalidar la cuenta ya creada: se registra
    // y el onBootstrap del próximo arranque lo reintenta.
    console.log("seed: falló al sembrar la cuenta nueva: " + err);
  }
}, "users");

onBootstrap(function (e) {
  e.next();
  try {
    const demo = require(`${__hooks}/lib/demo.js`);
    require(`${__hooks}/lib/seed.js`).seedMissing(demo);
  } catch (err) {
    console.log("seed: falló la revisión de arranque: " + err);
  }
});
