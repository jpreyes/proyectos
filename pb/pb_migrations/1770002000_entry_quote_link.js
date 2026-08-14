/// <reference path="../pb_data/types.d.ts" />

// El ingreso proyectado tiene que saber de qué presupuesto salió.
//
// Aprobar un presupuesto crea un movimiento en el ledger con estado
// "proyectado". Si después el cliente se arrepiente, ese movimiento hay que
// anularlo — y sin este enlace no hay forma de encontrarlo: quedaría vivo,
// sumando a la caja proyectada plata que ya se sabe que no va a llegar.
//
// Va en migración aparte de 1770001700 y no dentro de ella porque para cuando
// se necesitó, aquella ya estaba aplicada. Una migración aplicada no se vuelve
// a correr, así que editarla no habría hecho nada en esta base y solo habría
// funcionado en una instalación nueva — la peor clase de diferencia entre
// entornos, la que no se nota hasta que se nota.

migrate(
  (app) => {
    const quotes = app.findCollectionByNameOrId("quotes");
    const entries = app.findCollectionByNameOrId("entries");

    if (!entries.fields.getByName("quote")) {
      entries.fields.add(
        new RelationField({
          name: "quote",
          maxSelect: 1,
          collectionId: quotes.id,
          cascadeDelete: false,
        })
      );
      app.save(entries);
    }
  },
  (app) => {
    const entries = app.findCollectionByNameOrId("entries");
    entries.fields.removeByName("quote");
    app.save(entries);
  }
);
