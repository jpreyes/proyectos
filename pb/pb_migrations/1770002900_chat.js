/// <reference path="../pb_data/types.d.ts" />

// La conversación con el agente.
//
// Es una colección y no un estado de React por la misma razón que todo lo demás
// de esta app: si la conversación vive en la memoria de la pestaña, se pierde al
// recargar y no existe en el teléfono. Y una conversación que se pierde deja de
// usarse para pensar — se vuelve un cuadro de búsqueda.
//
// `plan` guarda el plan propuesto junto al mensaje que lo propuso, en json. Va
// pegado al mensaje y no en una colección aparte porque un plan sin su turno de
// conversación no se entiende: lo que explica por qué se propuso crear tres
// tareas es lo que la persona escribió arriba. `applied` distingue el plan que
// ya se escribió del que quedó sobre la mesa, que es lo que permite volver a
// abrir la conversación de ayer y ver qué se hizo y qué no.
//
// Sin campo `thread`: una sola conversación continua, como cualquier chat de
// este tipo. "Empezar de nuevo" borra (suave) lo anterior, que es más honesto
// que acumular hilos que nadie vuelve a abrir.

const OWN = "owner = @request.auth.id";
const AUTH = '@request.auth.id != ""';

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const c = new Collection({
      type: "base",
      name: "chat",
      listRule: OWN,
      viewRule: OWN,
      createRule: AUTH,
      updateRule: OWN,
      deleteRule: OWN,
      fields: [
        {
          name: "role",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["user", "assistant"],
        },
        { name: "text", type: "text", max: 8000 },
        // El plan propuesto, tal como lo dejó la aduana. Json y no relaciones:
        // no es un registro, es una propuesta, y la mitad de las veces se
        // descarta.
        { name: "plan", type: "json", maxSize: 100000 },
        { name: "applied", type: "bool" },
        // Lo que se escribió al aplicar, para el acuse dentro del hilo.
        { name: "result", type: "text", max: 500 },

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
      indexes: ["CREATE INDEX `idx_chat_owner_created` ON `chat` (`owner`, `created`)"],
    });

    app.save(c);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("chat"));
  }
);
