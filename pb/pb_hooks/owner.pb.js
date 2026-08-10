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
  "entities",
  "inbox",
  "routines",
  "routine_log",
  "daily"
);
