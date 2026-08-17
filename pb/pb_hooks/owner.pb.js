/// <reference path="../pb_data/types.d.ts" />

// Asigna el dueño en cada creación.
//
// Las reglas de las colecciones (ver 1770001300_owner_scoping.js) filtran por
// `owner = @request.auth.id`, pero alguien tiene que escribir ese campo. Se
// hace acá y no en el frontend por dos razones: el cliente no debería poder
// elegir dueño, y así ninguna ruta nueva de la app puede olvidarse de ponerlo.
//
// Se sobrescribe siempre lo que venga en el body: un cliente que mande
// "owner": "<id de otro>" queda igualmente registrado a su propio nombre.
//
// Los superusuarios quedan fuera a propósito. Su id no pertenece a `users`, así
// que asignarlo rompería la relación; desde el admin UI el dueño se elige a
// mano, que es lo correcto cuando escribes en nombre de otro.
//
// OJO: el cuerpo del handler corre en una VM aislada que NO ve el ámbito de
// este archivo. Todo lo que use tiene que salir de `e` o de un require() hecho
// aquí dentro. (Ver el comentario de daily_digest.pb.js.)
onRecordCreateRequest(
  function (e) {
    if (e.auth && e.auth.collection().name === "users") {
      e.record.set("owner", e.auth.id);
    }
    e.next();
  },
  "projects",
  "resources",
  "log",
  "tasks",
  "entries",
  // La regla de la que salen los movimientos que se repiten (1770002600).
  "entry_series",
  "entities",
  "inbox",
  "routines",
  "routine_log",
  "daily",
  // Presupuestos y calendario de capacidad (1770001700 / 1770001800).
  "quotes",
  "quote_items",
  "deliverables",
  "commitments",
  "calendar_feeds",
  "calendar_events",
  // Catálogo, también por dueño desde 1770001400. Cada cuenta tiene su copia,
  // sembrada por seed_user.pb.js.
  "accounts",
  "categories",
  "taxonomy",
  "settings"
);
