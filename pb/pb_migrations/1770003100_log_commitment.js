/// <reference path="../pb_data/types.d.ts" />

// Contra qué horas se hizo una nota de bitácora.
//
// El plan del día es derivado y por eso no se pudre — pero tampoco se entera de
// nada. Si el lunes no trabajaste, sus horas no se atrasaban: desaparecían en
// silencio, porque el repartidor recalculaba la misma semana estática sin mirar
// qué día es hoy ni qué se hizo.
//
// Para que lo no hecho se atrase solo hace falta saber qué **sí** se hizo, y eso
// es un dato nuevo. Guardarlo no contradice la regla de que el plan no se
// guarda: la distinción es otra y es la que importa. **Lo que va a pasar es lo
// que se pudre; lo que ya pasó, no.** Una hora trabajada el lunes es un hecho y
// la semana que viene sigue siendo verdad.
//
// Va en `log` y no en una colección nueva porque la bitácora ya es exactamente
// esto —qué pasó, cuándo, cuántas horas— y ya tiene el campo `hours`. Marcar un
// bloque del día como hecho escribe una nota, así que de paso queda el registro
// de en qué se fue la semana, que es para lo que la bitácora existe.
//
// Por qué una relación a `commitments` y no basta `project`: un proyecto puede
// tener varios compromisos —Docencia tiene sus clases y aparte las revisiones de
// tesis— y sin esto las horas de uno se le imputarían al otro.
//
// Opcional a propósito: una nota escrita a mano no tiene por qué colgar de
// ninguna reserva de horas, que es como se ha usado la bitácora hasta hoy.

migrate(
  (app) => {
    const log = app.findCollectionByNameOrId("log");
    if (!log.fields.getByName("commitment")) {
      const commitments = app.findCollectionByNameOrId("commitments");
      log.fields.add(
        new RelationField({
          name: "commitment",
          required: false,
          maxSelect: 1,
          collectionId: commitments.id,
          // Borrar el compromiso no borra lo que trabajaste: ocurrió igual.
          cascadeDelete: false,
        })
      );
      app.save(log);
    }
  },
  (app) => {
    const log = app.findCollectionByNameOrId("log");
    if (log.fields.getByName("commitment")) {
      log.fields.removeByName("commitment");
      app.save(log);
    }
  }
);
