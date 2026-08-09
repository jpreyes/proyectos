/// <reference path="../pb_data/types.d.ts" />

// A fresh PocketBase install normally ships with a default `users` auth
// collection, but that is an install detail we should not depend on: if it is
// missing, the whole app cannot log in. So create it only when absent.
//
// Auth collections get id / email / password / tokenKey / verified as system
// fields automatically — only the extras are declared here.

migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("users");
      return; // already provided by the install
    } catch (_) {
      // not found -> create it
    }

    const c = new Collection({
      type: "auth",
      name: "users",
      // Single-user system: you may only ever see and edit yourself.
      listRule: "id = @request.auth.id",
      viewRule: "id = @request.auth.id",
      updateRule: "id = @request.auth.id",
      createRule: null,
      deleteRule: null,
      fields: [
        { name: "name", type: "text", max: 200 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      passwordAuth: {
        enabled: true,
        identityFields: ["email"],
      },
    });

    app.save(c);
  },
  () => {
    // Never drop `users` on rollback — it may be the install's own collection.
  }
);
