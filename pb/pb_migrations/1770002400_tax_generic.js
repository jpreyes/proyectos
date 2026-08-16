/// <reference path="../pb_data/types.d.ts" />

// El impuesto deja de llamarse IVA y de ser chileno.
//
// La app nació para un profesional independiente en Chile, así que el impuesto
// sobre las ventas se llamaba `iva_rate` y el 19% estaba puesto como si fuera
// una verdad. Nada de eso es universal: el mismo mecanismo se llama IVA en
// Chile, España o México, VAT en el Reino Unido, GST en Australia o India, IGV
// en Perú, y "sales tax" en Estados Unidos.
//
// Lo que **sí** es universal es la mecánica, y es la que se modela acá:
//
//   1. Un impuesto que le cobras al cliente sobre tus ventas y que le debes al
//      Estado.
//   2. En casi todo el mundo —salvo el "sales tax" estadounidense— el mismo
//      impuesto que pagaste en tus compras se descuenta de lo que debes. Eso es
//      `tax_on_expenses`: con él, el cierre resta; sin él, solo suma.
//   3. Una retención que quien te paga le entrega al Estado a cuenta de tu
//      impuesto a la renta (retención de honorarios en Chile, IRPF en España,
//      ISR en México, TDS en India).
//
// Tres cosas más que cambian de país en país y ahora son configurables:
//
//   * cómo se llaman ambos (`tax_label`, `withholding_label`),
//   * cada cuánto se declara (`tax_period`: mensual, bimestral, trimestral),
//   * y con qué fecha cuenta un movimiento: la del documento —lo habitual— o la
//     del pago, que es como funcionan los regímenes de caja (`tax_basis`).
//
// La tasa se conserva, solo cambia de nombre: `iva_rate` → `tax_rate`. Y hay
// algo que NO hace falta migrar y conviene notar, porque es lo que hace posible
// que esto sirva en cualquier parte: cada movimiento guarda el impuesto como
// **monto**, no como tasa. Un archivo con IVA 19%, otro con 21% y otro exento
// conviven sin conflicto; la tasa de `settings` es solo el valor por defecto
// del formulario.

const FIELDS = [
  ["tax_label", "text", { max: 40 }],
  ["withholding_label", "text", { max: 40 }],
];

const DEFAULTS = {
  tax_label: "IVA",
  withholding_label: "Retención",
  tax_on_expenses: true,
  tax_period: "monthly",
  tax_basis: "document",
};

migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("settings");

    for (const [name, , opts] of FIELDS) {
      if (!c.fields.getByName(name)) {
        c.fields.add(new TextField(Object.assign({ name: name }, opts)));
      }
    }
    if (!c.fields.getByName("tax_on_expenses")) {
      c.fields.add(new BoolField({ name: "tax_on_expenses" }));
    }
    if (!c.fields.getByName("tax_period")) {
      c.fields.add(
        new SelectField({
          name: "tax_period",
          maxSelect: 1,
          values: ["monthly", "bimonthly", "quarterly"],
        })
      );
    }
    if (!c.fields.getByName("tax_basis")) {
      c.fields.add(
        new SelectField({ name: "tax_basis", maxSelect: 1, values: ["document", "payment"] })
      );
    }
    // La tasa cambia de nombre, no de valor.
    if (!c.fields.getByName("tax_rate")) {
      c.fields.add(new NumberField({ name: "tax_rate", min: 0, max: 1 }));
    }
    app.save(c);

    let rows = [];
    try {
      rows = app.findRecordsByFilter("settings", "id != ''", "", 1000, 0);
    } catch (_) {}

    for (const r of rows) {
      if (!r.get("tax_rate")) r.set("tax_rate", r.get("iva_rate") || 0.19);
      for (const key in DEFAULTS) {
        const v = r.get(key);
        if (v === "" || v === null || v === undefined) r.set(key, DEFAULTS[key]);
      }
      try {
        app.save(r);
      } catch (_) {
        app.saveNoValidate(r);
      }
    }

    // El nombre viejo se va recién cuando el valor ya está copiado en el nuevo:
    // al revés, una migración a medias dejaría cuentas sin tasa.
    const c2 = app.findCollectionByNameOrId("settings");
    if (c2.fields.getByName("iva_rate")) {
      c2.fields.removeByName("iva_rate");
      app.save(c2);
    }
  },
  (app) => {
    const c = app.findCollectionByNameOrId("settings");
    if (!c.fields.getByName("iva_rate")) {
      c.fields.add(new NumberField({ name: "iva_rate", min: 0, max: 1 }));
      app.save(c);
    }
    let rows = [];
    try {
      rows = app.findRecordsByFilter("settings", "id != ''", "", 1000, 0);
    } catch (_) {}
    for (const r of rows) {
      r.set("iva_rate", r.get("tax_rate") || 0.19);
      try {
        app.save(r);
      } catch (_) {
        app.saveNoValidate(r);
      }
    }
    const c2 = app.findCollectionByNameOrId("settings");
    for (const name of ["tax_rate", "tax_label", "withholding_label", "tax_on_expenses", "tax_period", "tax_basis"]) {
      c2.fields.removeByName(name);
    }
    app.save(c2);
  }
);
