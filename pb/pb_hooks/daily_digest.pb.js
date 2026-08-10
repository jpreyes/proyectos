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
//
// El horario es **por cuenta**: el job corre cada 15 minutos y en cada pasada
// decide a quién le toca según su `settings` (hora, minuto, activado) y si ya
// se le mandó hoy. Un cron por cuenta habría sido más exacto al minuto, pero
// obliga a mantener vivo el registro de jobs ante altas, bajas y cambios de
// configuración, y se salta el envío del día si el proceso estaba caído a esa
// hora exacta. Acá cambiar la hora aplica sin reiniciar y un reinicio tardío
// manda igual. La lógica está en lib/digest.js (dueTo / run).
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
//      se registra. Por eso el tick es una expresión fija y toda consulta pasa
//      dentro del handler.

cronAdd("dailyDigest", "*/15 * * * *", function () {
  require(`${__hooks}/lib/digest.js`).run();
});
