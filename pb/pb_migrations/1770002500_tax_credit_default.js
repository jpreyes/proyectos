/// <reference path="../pb_data/types.d.ts" />

// Corrige el valor por defecto de `tax_on_expenses`, que 1770002400 no alcanzó
// a poner.
//
// Aquella migración rellenaba los campos nuevos solo cuando venían vacíos
// (`"" | null | undefined`), y un booleano recién creado no viene vacío: viene
// en `false`. Resultado: todas las cuentas quedaron declarando que el impuesto
// de sus gastos NO se descuenta del que cobran, que es el régimen del "sales
// tax" estadounidense y no el de ningún país donde esta app se usa hoy. El
// cierre habría mostrado como diferencia a pagar el impuesto de las ventas
// entero, sin restar el de las compras — un número más alto que el verdadero,
// que es la peor dirección para equivocarse.
//
// Se pone en `true` en todas las filas sin preguntar, y es seguro justamente
// por lo pegadas que van las dos migraciones: nadie tuvo la ocasión de elegir
// `false` a propósito en el rato que pasó entre una y otra. En adelante manda
// lo que diga cada cuenta en Configuración.

migrate(
  (app) => {
    let rows = [];
    try {
      rows = app.findRecordsByFilter("settings", "id != ''", "", 1000, 0);
    } catch (_) {
      return;
    }

    for (const r of rows) {
      if (r.get("tax_on_expenses")) continue;
      r.set("tax_on_expenses", true);
      try {
        app.save(r);
      } catch (_) {
        app.saveNoValidate(r);
      }
    }
  },
  () => {
    // Nada que deshacer: volver a `false` reintroduciría el error.
  }
);
