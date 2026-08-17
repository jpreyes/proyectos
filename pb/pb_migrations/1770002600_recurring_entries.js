/// <reference path="../pb_data/types.d.ts" />

// Ingresos y egresos que se repiten.
//
// Un sueldo, un arriendo, una cuota, un proyecto largo que se cobra por mes:
// hoy hay que escribirlos uno por uno, y lo que se escribe a mano cada mes se
// deja de escribir en marzo. Esta colección guarda **la regla**, no los
// movimientos: cada cuánto, desde cuándo, hasta cuándo y por cuánto.
//
// La decisión de fondo: la regla no reemplaza al movimiento, lo **fabrica**. La
// app materializa cada cuota como una fila normal de `entries` (ver
// `web/src/lib/local/recurring.ts`), y desde ahí todo lo que ya existe sigue
// funcionando sin enterarse: el flujo mensual, el margen por proyecto, el
// cierre de impuestos, "por cobrar", el buscador. La alternativa —expandir la
// serie al leer— habría obligado a que cada una de esas pantallas supiera de
// recurrencias, y habría hecho imposible lo más corriente de todo: que el
// arriendo de este mes haya sido distinto y uno lo corrija.
//
// Tres campos en `entries` sostienen eso:
//
//   `series`         de qué regla salió (vacío = escrita a mano);
//   `series_date`    a qué repetición corresponde;
//   `series_dropped` la borró la regla al cambiarle el calendario, no la
//                    persona. Es lo que permite reponerla si el cambio se
//                    revierte, sin reponer las que alguien borró a propósito.
//
// La materialización corre en el dispositivo, no en un hook: el id de cada
// cuota se deriva de (serie, fecha), así que dos dispositivos que generen la
// misma repetición producen la misma fila y no dos. Un hook de servidor habría
// necesitado cron, y el cron del JSVM ya nos costó meses de silencio.

const OWN = "owner = @request.auth.id";
const AUTH = '@request.auth.id != ""';

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const projects = app.findCollectionByNameOrId("projects");
    const entities = app.findCollectionByNameOrId("entities");
    const accounts = app.findCollectionByNameOrId("accounts");
    const categories = app.findCollectionByNameOrId("categories");

    /* ------------------------------------------------------ entry_series -- */

    const series = new Collection({
      type: "base",
      name: "entry_series",
      listRule: OWN,
      viewRule: OWN,
      createRule: AUTH,
      updateRule: OWN,
      deleteRule: OWN,
      fields: [
        {
          name: "direction",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["income", "expense"],
        },
        { name: "description", type: "text", required: true, max: 300 },

        // Plata. Mismos campos que un movimiento, porque cada cuota va a ser
        // uno: el importe se copia tal cual y `amount_clp` se congela al
        // materializar, no acá.
        { name: "amount", type: "number", required: true, min: 0 },
        { name: "currency", type: "text", max: 20 },
        { name: "fx_rate", type: "number" },
        { name: "net", type: "number" },
        { name: "tax", type: "number" },
        { name: "withholding", type: "number" },

        // El calendario. `cadence` es un preselector y no un par
        // (cada N, unidad) porque las siete formas de abajo son las que
        // aparecen en un contrato; "cada cinco semanas" no existe en la vida
        // real de nadie y un campo libre solo abre la puerta a combinaciones
        // sin sentido.
        {
          name: "cadence",
          type: "select",
          required: true,
          maxSelect: 1,
          values: [
            "weekly",
            "biweekly",
            "monthly",
            "bimonthly",
            "quarterly",
            "semiannual",
            "annual",
          ],
        },
        { name: "start_date", type: "date", required: true },
        // Vacío = sin término. Un sueldo no tiene fecha de fin y obligar a
        // inventarle una es pedir una mentira.
        { name: "end_date", type: "date" },
        // 0 = sin límite. Lo otro que se conoce de un contrato: "12 cuotas".
        { name: "occurrences", type: "number", min: 0 },
        // Días entre la fecha del movimiento y su vencimiento.
        { name: "due_days", type: "number", min: 0 },

        // Con qué estado nace cada cuota. `paid` no está: una cuota futura no
        // puede estar pagada. Para las que ya pasaron está `auto_paid`.
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["planned", "committed", "invoiced"],
        },
        // "Esto siempre llega": las cuotas cuya fecha ya pasó se dan por
        // pagadas solas. Opcional y a propósito — quien prefiera confirmar
        // cada una lo deja apagado.
        { name: "auto_paid", type: "bool" },

        // Pausar sin borrar. Se guarda al revés de como se lee ("activa")
        // porque PocketBase inicializa los bool en false: una serie recién
        // creada tiene que quedar andando, no dormida.
        { name: "paused", type: "bool" },

        {
          name: "project",
          type: "relation",
          maxSelect: 1,
          collectionId: projects.id,
          cascadeDelete: false,
        },
        {
          name: "entity",
          type: "relation",
          maxSelect: 1,
          collectionId: entities.id,
          cascadeDelete: false,
        },
        {
          name: "account",
          type: "relation",
          maxSelect: 1,
          collectionId: accounts.id,
          cascadeDelete: false,
        },
        {
          name: "category",
          type: "relation",
          maxSelect: 1,
          collectionId: categories.id,
          cascadeDelete: false,
        },
        { name: "doc_type", type: "text", max: 40 },
        { name: "notes", type: "text", max: 2000 },

        { name: "deleted", type: "bool" },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
          collectionId: users.id,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX `idx_entry_series_owner` ON `entry_series` (`owner`, `paused`)",
        "CREATE INDEX `idx_entry_series_project` ON `entry_series` (`project`)",
      ],
    });

    app.save(series);

    /* ---------------------------------------------- el enlace en entries -- */

    const entries = app.findCollectionByNameOrId("entries");

    if (!entries.fields.getByName("series")) {
      entries.fields.add(
        new RelationField({
          name: "series",
          maxSelect: 1,
          cascadeDelete: false,
          collectionId: series.id,
        })
      );
    }
    if (!entries.fields.getByName("series_date")) {
      entries.fields.add(new DateField({ name: "series_date" }));
    }
    if (!entries.fields.getByName("series_dropped")) {
      entries.fields.add(new BoolField({ name: "series_dropped" }));
    }

    // `indexes` viene del lado Go: se recorre y se reasigna un arreglo JS
    // nuevo, que es como lo hacen las migraciones anteriores.
    const keep = [];
    for (const idx of entries.indexes) {
      if (idx.indexOf("idx_entries_series") === -1) keep.push(idx);
    }
    keep.push("CREATE INDEX `idx_entries_series` ON `entries` (`series`, `series_date`)");
    entries.indexes = keep;

    app.save(entries);
  },
  (app) => {
    const entries = app.findCollectionByNameOrId("entries");

    const keep = [];
    for (const idx of entries.indexes) {
      if (idx.indexOf("idx_entries_series") === -1) keep.push(idx);
    }
    entries.indexes = keep;

    entries.fields.removeByName("series");
    entries.fields.removeByName("series_date");
    entries.fields.removeByName("series_dropped");
    app.save(entries);

    app.delete(app.findCollectionByNameOrId("entry_series"));
  }
);
