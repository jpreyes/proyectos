/// <reference path="../pb_data/types.d.ts" />

// Two-level income/expense taxonomy.
//
// `parent` is a self relation, and PocketBase validates a relation's target
// before the new collection is persisted — so pinning an explicit id and
// referencing it in the same save fails. The collection has to exist first and
// the field gets appended in a second save.

const AUTH = "@request.auth.id != ''";

migrate(
  (app) => {
    const c = new Collection({
      type: "base",
      name: "categories",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: AUTH,
      fields: [
        { name: "name", type: "text", required: true, max: 120 },
        {
          name: "direction",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["income", "expense", "both"],
        },
        { name: "notes", type: "text", max: 500 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_categories_direction ON categories (direction)"],
    });

    app.save(c);

    const saved = app.findCollectionByNameOrId("categories");
    saved.fields.add(
      new RelationField({
        name: "parent",
        required: false,
        maxSelect: 1,
        collectionId: saved.id,
        cascadeDelete: false,
      })
    );
    app.save(saved);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("categories"));
  }
);
