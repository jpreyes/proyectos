/// <reference path="../pb_data/types.d.ts" />

// El asistente que ordena, en los ajustes de la cuenta.
//
// Dos campos y ninguno es la clave de la API: **esa vive solo en el servidor**
// (`OPENCODE_API_KEY` en el entorno del contenedor `web`). Meterla acá la
// pondría en `settings`, que la app replica entera en el navegador de cada
// dispositivo — o sea, publicarla.
//
//   `assistant_enabled`  la cuenta quiere usarlo. Apagado no se manda nada a
//                        ningún tercero, que es la única forma honesta de
//                        ofrecer esto: el texto de tus proyectos sale de esta
//                        máquina.
//   `assistant_model`    cuál modelo. Es un ajuste y no una constante porque
//                        cambiar de modelo no debería exigir un redespliegue,
//                        y porque el barato y el bueno sirven para cosas
//                        distintas. El servidor igual valida contra una lista
//                        blanca: el campo llega del cliente y un id de modelo
//                        libre sería una cuenta ajena gastando tus créditos.
//
// Nace apagado a propósito. Un bool nuevo nace en `false` y acá eso es lo
// correcto: nadie debería descubrir que su bitácora viajó a un tercero porque
// una migración lo dio por hecho.

migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("settings");
    let changed = false;

    if (!c.fields.getByName("assistant_enabled")) {
      c.fields.add(new BoolField({ name: "assistant_enabled" }));
      changed = true;
    }
    if (!c.fields.getByName("assistant_model")) {
      c.fields.add(new TextField({ name: "assistant_model", max: 60 }));
      changed = true;
    }

    if (changed) app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("settings");
    c.fields.removeByName("assistant_enabled");
    c.fields.removeByName("assistant_model");
    app.save(c);
  }
);
