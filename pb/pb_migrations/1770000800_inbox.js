/// <reference path="../pb_data/types.d.ts" />

// Universal capture.
//
// Unfulfilled goals produce intrusive thoughts, high mental accessibility and
// worse performance on *unrelated* tasks — and making a specific plan removes
// those effects even before the task is done. So capture alone does not close
// the loop: `status` exists to force the second half. An item is only `planned`
// once it became an if-then plan, a task or a journal entry somewhere.

const AUTH = "@request.auth.id != ''";

migrate(
  (app) => {
    const projects = app.findCollectionByNameOrId("projects");

    const c = new Collection({
      type: "base",
      name: "inbox",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "text", type: "text", required: true, max: 2000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["open", "planned", "dropped"],
        },
        // Where it ended up, once triaged.
        {
          name: "project",
          type: "relation",
          maxSelect: 1,
          collectionId: projects.id,
          cascadeDelete: false,
        },
        { name: "outcome", type: "text", max: 300 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_inbox_status ON inbox (status)",
        "CREATE INDEX idx_inbox_created ON inbox (created)",
      ],
    });

    app.save(c);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("inbox"));
  }
);
