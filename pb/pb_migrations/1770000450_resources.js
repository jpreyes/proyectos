/// <reference path="../pb_data/types.d.ts" />

// The map of where a project actually lives: folders, repos, docs, datasets,
// papers, dashboards.
//
// The point of this collection is NOT to store the work — the work stays where
// it is. It is to store `purpose`: the one-line note explaining what each
// location is for, so the mental model survives a two-week gap.

const AUTH = "@request.auth.id != ''";

migrate(
  (app) => {
    const projects = app.findCollectionByNameOrId("projects");

    const c = new Collection({
      type: "base",
      name: "resources",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        {
          name: "project",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: projects.id,
          cascadeDelete: true,
        },
        { name: "label", type: "text", required: true, max: 160 },
        {
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: [
            "folder", // ruta local o de red
            "repo", // git
            "url", // sitio, dashboard, issue tracker
            "doc", // Word/Google Doc/Overleaf
            "sheet", // planilla
            "dataset",
            "paper",
            "drive", // Dropbox/Drive/OneDrive
            "other",
          ],
        },
        // Local path OR url. Rendered as a copy button when it is not http(s),
        // because a browser on a remote origin cannot open file:// links.
        { name: "path", type: "text", required: true, max: 600 },
        // The whole reason this collection exists.
        { name: "purpose", type: "text", max: 600 },
        {
          name: "state",
          type: "select",
          maxSelect: 1,
          values: ["active", "reference", "archived", "deprecated"],
        },
        { name: "pinned", type: "bool" },
        { name: "position", type: "number" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_resources_project ON resources (project)",
        "CREATE INDEX idx_resources_kind ON resources (kind)",
      ],
    });

    app.save(c);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("resources"));
  }
);
