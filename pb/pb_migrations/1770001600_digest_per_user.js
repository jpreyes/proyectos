/// <reference path="../pb_data/types.d.ts" />

// Marca de último envío del resumen, para que el horario sea por cuenta.
//
// Antes había un solo cron para toda la instancia, con la hora de la cuenta más
// antigua y leída una única vez al arrancar: cambiarla exigía reiniciar y las
// demás cuentas no tenían horario propio.
//
// Ahora el job corre cada 15 minutos y decide a quién le toca. Ese diseño
// necesita saber a quién ya se le mandó hoy — sin eso, cada tick posterior a la
// hora configurada volvería a enviar. `digest_last_sent` guarda la fecha local
// del último envío (YYYY-MM-DD) y es lo que hace la operación idempotente,
// también frente a reinicios.
//
// Efecto lateral bueno: si el contenedor estaba caído a la hora exacta, el
// primer tick tras volver manda igual, cosa que un cron a las 07:30 no hace.

migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId("settings");
    if (!settings.fields.getByName("digest_last_sent")) {
      settings.fields.add(new TextField({ name: "digest_last_sent", max: 10 }));
    }
    app.save(settings);
  },
  (app) => {
    const settings = app.findCollectionByNameOrId("settings");
    settings.fields.removeByName("digest_last_sent");
    app.save(settings);
  }
);
