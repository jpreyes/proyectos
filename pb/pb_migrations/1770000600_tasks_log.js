/// <reference path="../pb_data/types.d.ts" />

// `tasks`: what has to be done. `log`: append-only journal of what happened.

const AUTH = "@request.auth.id != ''";

migrate(
  (app) => {
    const projects = app.findCollectionByNameOrId("projects");

    const tasks = new Collection({
      type: "base",
      name: "tasks",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "title", type: "text", required: true, max: 300 },
        {
          name: "project",
          type: "relation",
          maxSelect: 1,
          collectionId: projects.id,
          cascadeDelete: true,
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["todo", "doing", "blocked", "done"],
        },
        {
          name: "priority",
          type: "select",
          maxSelect: 1,
          values: ["low", "normal", "high", "critical"],
        },
        { name: "due_date", type: "date" },
        { name: "done_date", type: "date" },
        { name: "effort_h", type: "number" },
        { name: "notes", type: "text", max: 2000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_tasks_status ON tasks (status)",
        "CREATE INDEX idx_tasks_due ON tasks (due_date)",
        "CREATE INDEX idx_tasks_project ON tasks (project)",
      ],
    });

    app.save(tasks);

    const log = new Collection({
      type: "base",
      name: "log",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "date", type: "date", required: true },
        {
          name: "project",
          type: "relation",
          maxSelect: 1,
          collectionId: projects.id,
          cascadeDelete: true,
        },
        {
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["note", "milestone", "meeting", "finding", "progress", "decision"],
        },
        { name: "title", type: "text", max: 300 },
        { name: "body", type: "editor" },
        { name: "hours", type: "number" },
        {
          name: "files",
          type: "file",
          maxSelect: 20,
          maxSize: 26214400,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_log_date ON log (date)",
        "CREATE INDEX idx_log_project ON log (project)",
        "CREATE INDEX idx_log_kind ON log (kind)",
      ],
    });

    app.save(log);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("log"));
    app.delete(app.findCollectionByNameOrId("tasks"));
  }
);
