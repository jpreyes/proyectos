/// <reference path="../pb_data/types.d.ts" />

// Resumen diario por correo.
//
// La app solo sirve si algo te alcanza cuando NO la estás mirando — la memoria
// prospectiva (acordarse de hacer algo en el momento justo) es un punto débil
// de por vida, y las señales externas son la compensación documentada. Esto
// corre dentro de PocketBase, con su propio scheduler y su propio mailer, así
// que no hay un servicio extra que mantener vivo.
//
// Requiere SMTP configurado en Settings → Mail settings.
// Destinatario: variable DIGEST_TO, si no el primer registro de `users`.
//
// Este archivo es deliberadamente una cáscara. Dos reglas del JSVM de
// PocketBase que no son obvias y que rompen el hook en silencio:
//
//   1. Los handlers corren en una VM aislada que NO ve el ámbito de este
//      archivo. Toda función auxiliar tiene que entrar por require() DENTRO
//      del handler, no definirse arriba.
//   2. Tocar la base al cargar los hooks (nivel superior del archivo) provoca
//      un panic de Go, "invalid memory address or nil pointer dereference",
//      que el try/catch de JS no atrapa: se cae la carga entera y el cron nunca
//      se registra. Cualquier consulta va en onBootstrap, después de e.next().

const DEFAULT_CRON = "30 7 * * *"; // 07:30 America/Santiago (TZ del contenedor)

// Registro con la hora por defecto: no toca la base, es seguro al cargar.
cronAdd("dailyDigest", DEFAULT_CRON, function () {
  require(`${__hooks}/lib/digest.js`).run();
});

// Con la app ya inicializada se relee la hora configurada en `settings`.
// cronAdd con el mismo nombre reemplaza el job anterior.
//
// Nota: DEFAULT_CRON se saca del módulo, no de la constante de arriba — dentro
// del handler el ámbito del archivo no existe (regla 1 del comentario inicial).
onBootstrap(function (e) {
  e.next();
  try {
    const digest = require(`${__hooks}/lib/digest.js`);
    const cron = digest.schedule();
    if (cron !== digest.DEFAULT_CRON) {
      cronAdd("dailyDigest", cron, function () {
        require(`${__hooks}/lib/digest.js`).run();
      });
      console.log("digest: schedule set to " + cron);
    }
  } catch (err) {
    console.log("digest: could not apply configured schedule: " + err);
  }
});
