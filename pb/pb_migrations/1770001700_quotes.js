/// <reference path="../pb_data/types.d.ts" />

// Presupuestos.
//
// Un presupuesto es un documento que se manda antes de que exista el proyecto:
// por eso NO cuelga de `projects`, cuelga del cliente. La relación con el
// proyecto se llena al revés — cuando el presupuesto se aprueba, se crea el
// proyecto y recién ahí se enlaza. La mayoría muere en "rechazado" y nunca
// llega a ser nada, y crear un proyecto por cada cotización enviada llenaría el
// listado de basura.
//
// Los totales se guardan calculados en la cabecera (`direct_total`, `overhead`,
// `profit`, `net_total`) en vez de derivarse al leer. Es la misma razón por la
// que `entries.amount_clp` se congela: un presupuesto enviado es una promesa
// hecha en una fecha, y si mañana cambias un porcentaje por defecto, el papel
// que el cliente tiene en la mano no puede cambiar solo. Los recalcula
// `recalcQuote()` en actions.ts en cada escritura de ítems.
//
// `plan_start` / `plan_end` / `plan_hours_week` son el calce en el calendario:
// se llenan cuando aceptas la propuesta del buscador de huecos, y son lo que
// lee la aprobación para reservar el tiempo. Ver 1770001800_calendar.js.
//
// Ítems y entregables se borran en duro (cascade). El borrado suave existe en
// esta app para que un cliente offline se entere de que algo desapareció, y
// esas dos colecciones no están en la ruta offline: son subfilas de un
// formulario que solo se edita en línea.

const OWN = "owner = @request.auth.id";
const AUTH = '@request.auth.id != ""';

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const entities = app.findCollectionByNameOrId("entities");
    const projects = app.findCollectionByNameOrId("projects");

    /* ------------------------------------------------------------ quotes -- */

    const quotes = new Collection({
      type: "base",
      name: "quotes",
      listRule: OWN,
      viewRule: OWN,
      createRule: AUTH, // el dueño lo fija owner.pb.js, no el cliente
      updateRule: OWN,
      deleteRule: OWN,
      fields: [
        { name: "number", type: "text", max: 32 },
        { name: "title", type: "text", required: true, max: 200 },
        {
          name: "client",
          type: "relation",
          maxSelect: 1,
          collectionId: entities.id,
          cascadeDelete: false,
        },
        // Se llena al aprobar. Nunca antes.
        {
          name: "project",
          type: "relation",
          maxSelect: 1,
          collectionId: projects.id,
          cascadeDelete: false,
        },
        // Vocabulario `project_kind`, texto plano como el resto (ver
        // 1770001200_flexible_enums).
        { name: "kind", type: "text", max: 40 },
        { name: "description", type: "text", max: 2000 },

        // Máquina de estados: el código computa sobre esto, así que se queda
        // como select y la base rechaza un estado inventado.
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["draft", "pending", "approved", "rejected"],
        },

        { name: "date", type: "date" },
        { name: "valid_until", type: "date" },
        { name: "decided_date", type: "date" },

        { name: "currency", type: "text", max: 8 },
        { name: "fx_rate", type: "number" },

        // Fracciones, no porcentajes: 0.15 = 15%. Igual que iva_rate.
        { name: "overhead_pct", type: "number", min: 0, max: 1 },
        { name: "profit_pct", type: "number", min: 0, max: 1 },

        // Congelados al escribir. No recalcular al leer.
        { name: "direct_total", type: "number" },
        { name: "overhead_amount", type: "number" },
        { name: "profit_amount", type: "number" },
        { name: "net_total", type: "number" },
        { name: "net_total_clp", type: "number" },

        // Programación: cuánto trabajo tangible es y a qué ritmo máximo.
        { name: "work_hours", type: "number", min: 0 },
        { name: "max_hours_week", type: "number", min: 0 },
        { name: "earliest_start", type: "date" },

        // El calce aceptado en el calendario.
        { name: "plan_start", type: "date" },
        { name: "plan_end", type: "date" },
        { name: "plan_hours_week", type: "number", min: 0 },

        { name: "terms", type: "text", max: 4000 },
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
        // Por dueño, como todos los únicos desde 1770001500: si fuera global,
        // la segunda cuenta no podría tener su propio P-2026-001.
        "CREATE UNIQUE INDEX `idx_quotes_owner_number` ON `quotes` (`owner`, `number`) WHERE `number` != ''",
        "CREATE INDEX `idx_quotes_status` ON `quotes` (`status`)",
        "CREATE INDEX `idx_quotes_client` ON `quotes` (`client`)",
      ],
    });

    app.save(quotes);

    const savedQuotes = app.findCollectionByNameOrId("quotes");

    /* ------------------------------------------------------- quote_items -- */

    const items = new Collection({
      type: "base",
      name: "quote_items",
      listRule: OWN,
      viewRule: OWN,
      createRule: AUTH,
      updateRule: OWN,
      deleteRule: OWN,
      fields: [
        {
          name: "quote",
          type: "relation",
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
          collectionId: savedQuotes.id,
        },
        { name: "position", type: "number" },
        { name: "description", type: "text", required: true, max: 300 },
        // "gl", "m²", "hr", "un" — texto libre, es una unidad de medida, no un
        // enum sobre el que se compute nada.
        { name: "unit", type: "text", max: 20 },
        { name: "qty", type: "number" },
        { name: "unit_price", type: "number" },
        // qty * unit_price, guardado para que el papel no se mueva.
        { name: "total", type: "number" },
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
      indexes: ["CREATE INDEX `idx_quote_items_quote` ON `quote_items` (`quote`, `position`)"],
    });

    app.save(items);

    /* ------------------------------------------------------ deliverables -- */

    const deliverables = new Collection({
      type: "base",
      name: "deliverables",
      listRule: OWN,
      viewRule: OWN,
      createRule: AUTH,
      updateRule: OWN,
      deleteRule: OWN,
      fields: [
        {
          name: "quote",
          type: "relation",
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
          collectionId: savedQuotes.id,
        },
        { name: "position", type: "number" },
        { name: "name", type: "text", required: true, max: 200 },
        { name: "detail", type: "text", max: 500 },
        // Plazo en días corridos contados desde el inicio del trabajo, no una
        // fecha: el presupuesto se escribe antes de saber cuándo parte.
        { name: "lead_days", type: "number", min: 0 },
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
        "CREATE INDEX `idx_deliverables_quote` ON `deliverables` (`quote`, `position`)",
      ],
    });

    app.save(deliverables);

    // El enlace `entries.quote` va en 1770002000, no acá: esta migración ya
    // estaba aplicada cuando hizo falta.
  },
  (app) => {
    for (const name of ["deliverables", "quote_items", "quotes"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  }
);
