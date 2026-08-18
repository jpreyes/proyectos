/// <reference path="../pb_data/types.d.ts" />

// La jornada, y las franjas fijas de un compromiso.
//
// Hasta acá el calendario contestaba una sola pregunta: "¿cabe?". Con horas por
// semana entre dos fechas, decidir si un encargo de 30 meses revienta alguna
// semana es una suma, y por eso la unidad es esa y no una grilla. Eso no cambia
// y no debe cambiar: es lo que hace funcionar el presupuestador y el buscador de
// huecos.
//
// Lo que faltaba es la otra pregunta, que es la que se hace un martes a las
// diez: "¿qué hago **ahora**?". 2,86 h/semana de un informe no le dicen a nadie
// cuándo abrir el archivo, así que el día se va en una sola cosa o en ninguna.
// Se reportó exactamente así.
//
// La objeción escrita contra una agenda con horas era que "exige mantenerla al
// día o queda mintiendo en una semana". Vale contra una agenda que se llena a
// mano; no vale contra una que se **deriva**. Los bloques del día se recalculan
// desde los compromisos cada vez que se abre la pantalla, así que no se pueden
// desactualizar: no hay nada que mantener. Por eso no se agrega ninguna
// colección de bloques — sería justo el dato que se pudre.
//
// Se agregan dos cosas y nada más:
//
//   1. `commitments.slots` — las franjas semanales de lo que de verdad ocurre a
//      una hora. Una clase es los lunes de 14:00 a 15:30, no "1,5 h sueltas en
//      la semana". Vacío = flexible, que es el caso normal: el repartidor lo
//      acomoda donde quepa. Formato: [{"day":1,"start":"14:00","end":"15:30"}],
//      con day 1..7 (lunes..domingo, como ISO).
//
//   2. La jornada en `settings`. Hasta ahora "trabajo de 8 a 18" existía solo
//      como el número de `capacity_hours_week`, o sea como un supuesto de quien
//      lo configuró. Escrito como límite, el repartidor no puede derramar
//      trabajo fuera de él y la app puede decir "esto no cabe en tu jornada" en
//      vez de dejar que se coma la noche. Es la razón por la que existe: que el
//      trabajo no invada la vida familiar.
//
// El almuerzo se resta del día y no se reparte nada encima. No es una
// preferencia estética: es la única hora protegida del día.

const SETTINGS_FIELDS = [
  ["work_start", "text", { max: 5 }],
  ["work_end", "text", { max: 5 }],
  ["lunch_start", "text", { max: 5 }],
  ["lunch_end", "text", { max: 5 }],
];

const DEFAULTS = {
  work_start: "08:00",
  work_end: "18:00",
  lunch_start: "13:00",
  lunch_end: "14:00",
};

function persist(app, record) {
  try {
    app.save(record);
  } catch (err) {
    app.saveNoValidate(record);
  }
}

migrate(
  (app) => {
    /* ------------------------------------------------------- commitments - */
    const commitments = app.findCollectionByNameOrId("commitments");
    if (!commitments.fields.getByName("slots")) {
      commitments.fields.add(new JSONField({ name: "slots", maxSize: 20000 }));
      app.save(commitments);
    }

    /* ---------------------------------------------------------- settings - */
    const settings = app.findCollectionByNameOrId("settings");
    for (const [name, type, opts] of SETTINGS_FIELDS) {
      if (!settings.fields.getByName(name)) {
        settings.fields.add(new TextField(Object.assign({ name: name }, opts)));
      }
    }
    app.save(settings);

    // Una jornada vacía dejaría al repartidor sin ventana donde poner nada, y
    // el día se vería en blanco con todo el trabajo "sin ubicar".
    let rows = [];
    try {
      rows = app.findRecordsByFilter("settings", "id != ''", "", 1000, 0);
    } catch (_) {}
    for (const r of rows) {
      for (const key in DEFAULTS) {
        if (!r.get(key)) r.set(key, DEFAULTS[key]);
      }
      persist(app, r);
    }
  },
  (app) => {
    const commitments = app.findCollectionByNameOrId("commitments");
    if (commitments.fields.getByName("slots")) {
      commitments.fields.removeByName("slots");
      app.save(commitments);
    }
    const settings = app.findCollectionByNameOrId("settings");
    for (const [name] of SETTINGS_FIELDS) {
      if (settings.fields.getByName(name)) settings.fields.removeByName(name);
    }
    app.save(settings);
  }
);
