/// <reference path="../pb_data/types.d.ts" />

// Calendario de capacidad.
//
// No es una agenda. Una agenda guarda "martes 09:00–11:00" y exige mantener el
// detalle día a día o queda mintiendo a la semana de creada. Acá la unidad es
// **horas por semana entre dos fechas**, que es como se contratan de verdad las
// cosas que llenan el año: "4 horas semanales durante 30 meses", "un ramo, 10
// horas semanales el segundo semestre", "la investigación, 8 horas semanales".
//
// La pregunta que tiene que responder este modelo es una sola: si me entra este
// encargo, ¿en qué semanas cabe sin que ninguna pase de mi capacidad? Eso es
// una suma por semana, y con `hours_per_week` sale directo.
//
// `calendar_events` es la excepción y por eso es una colección aparte: los
// eventos que llegan de Outlook (exámenes de grado, comisiones) SÍ tienen fecha
// y hora exactas y no son recurrentes en el sentido de una carga. Entran al
// mismo cálculo convertidos a horas de la semana en que caen.
//
// Los eventos son cache, no datos: se rebajan y se rehacen desde el .ics en
// cada sincronización, así que no llevan borrado suave. El feed sí es dato —
// lo escribiste tú.

const OWN = "owner = @request.auth.id";
const AUTH = '@request.auth.id != ""';

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const entities = app.findCollectionByNameOrId("entities");
    const projects = app.findCollectionByNameOrId("projects");
    const quotes = app.findCollectionByNameOrId("quotes");

    /* ------------------------------------------------------- commitments -- */

    const commitments = new Collection({
      type: "base",
      name: "commitments",
      listRule: OWN,
      viewRule: OWN,
      createRule: AUTH,
      updateRule: OWN,
      deleteRule: OWN,
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "kind", type: "text", max: 40 }, // vocabulario project_kind
        {
          name: "project",
          type: "relation",
          maxSelect: 1,
          collectionId: projects.id,
          cascadeDelete: false,
        },
        {
          name: "quote",
          type: "relation",
          maxSelect: 1,
          collectionId: quotes.id,
          cascadeDelete: false,
        },
        {
          name: "entity",
          type: "relation",
          maxSelect: 1,
          collectionId: entities.id,
          cascadeDelete: false,
        },
        { name: "start_date", type: "date", required: true },
        { name: "end_date", type: "date", required: true },

        // El corazón del modelo. Las semanas parciales del principio y del
        // final se prorratean por días cubiertos al calcular la carga.
        { name: "hours_per_week", type: "number", required: true, min: 0 },

        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          // `tentative` es lo que queda cuando el trabajo no cupo sin pasarse
          // de capacidad: se reserva igual, pero marcado.
          values: ["tentative", "confirmed", "done", "cancelled"],
        },
        {
          name: "source",
          type: "select",
          maxSelect: 1,
          values: ["manual", "quote"],
        },
        { name: "notes", type: "text", max: 1000 },

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
        "CREATE INDEX `idx_commitments_owner_range` ON `commitments` (`owner`, `start_date`, `end_date`)",
        "CREATE INDEX `idx_commitments_quote` ON `commitments` (`quote`)",
      ],
    });

    app.save(commitments);

    /* ----------------------------------------------------- calendar_feeds -- */

    const feeds = new Collection({
      type: "base",
      name: "calendar_feeds",
      listRule: OWN,
      viewRule: OWN,
      createRule: AUTH,
      updateRule: OWN,
      deleteRule: OWN,
      fields: [
        { name: "label", type: "text", required: true, max: 100 },
        // URL .ics publicada desde Outlook / OWA. Solo lectura: esta app nunca
        // escribe en el calendario institucional.
        { name: "url", type: "url", required: true, max: 600 },
        { name: "active", type: "bool" },
        // Un evento de día completo no dice cuántas horas te consume. Este es
        // el supuesto con el que entra al cálculo de carga.
        { name: "default_hours", type: "number", min: 0 },
        { name: "last_sync", type: "date" },
        { name: "last_error", type: "text", max: 500 },
        { name: "event_count", type: "number" },
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
    });

    app.save(feeds);

    const savedFeeds = app.findCollectionByNameOrId("calendar_feeds");

    /* ---------------------------------------------------- calendar_events -- */

    const events = new Collection({
      type: "base",
      name: "calendar_events",
      listRule: OWN,
      viewRule: OWN,
      createRule: AUTH,
      updateRule: OWN,
      deleteRule: OWN,
      fields: [
        {
          name: "feed",
          type: "relation",
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
          collectionId: savedFeeds.id,
        },
        { name: "uid", type: "text", required: true, max: 300 },
        { name: "title", type: "text", max: 300 },
        { name: "start", type: "date", required: true },
        { name: "end", type: "date" },
        { name: "all_day", type: "bool" },
        { name: "hours", type: "number", min: 0 },
        { name: "location", type: "text", max: 300 },
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
        // `start` entra en la clave a propósito: las repeticiones de un evento
        // con RRULE comparten UID, y sin la fecha solo sobreviviría una.
        "CREATE UNIQUE INDEX `idx_calendar_events_key` ON `calendar_events` (`feed`, `uid`, `start`)",
        "CREATE INDEX `idx_calendar_events_owner_start` ON `calendar_events` (`owner`, `start`)",
      ],
    });

    app.save(events);
  },
  (app) => {
    for (const name of ["calendar_events", "calendar_feeds", "commitments"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  }
);
