/// <reference path="../pb_data/types.d.ts" />

// Dos cosas que estaban decididas en el repositorio pero no en la base.
//
//   1. **El registro vuelve a ser cerrado.** `users.createRule` nació en `null`
//      (1770000050) —solo el superusuario crea cuentas— pero la base en
//      producción tenía `""`, que en PocketBase significa "cualquiera". Alguien
//      lo cambió desde el panel y así quedó: el 16-08-2026 se comprobó creando
//      una cuenta desde fuera, sin credenciales. No filtraba datos —las reglas
//      por dueño aguantan— pero cualquiera podía sembrarse una cuenta con su
//      catálogo y sus 82 filas de ejemplo.
//
//      La lección no es "estaba mal configurado" sino que **un cambio de
//      esquema hecho a mano en el panel no deja rastro y no viaja al repo**. Por
//      eso esto es una migración y no un clic: si vuelve a abrirse por accidente,
//      el próximo arranque lo cierra.
//
//      Para abrirlo a propósito —cuando exista un alta de cuenta de verdad, con
//      verificación de correo y borrado de cuenta— hay que hacerlo en una
//      migración nueva, que es justo la conversación que conviene tener.
//
//   2. **Respaldo diario automático.** No había ninguno: la única copia era la
//      que alguien se acordara de hacer a mano. PocketBase trae respaldos
//      programados, así que basta con encenderlos. Quedan dentro del volumen
//      (`pb_data/backups`), lo que cubre el error humano y el despliegue malo;
//      sacarlos del servidor es trabajo del cron del host, porque un respaldo en
//      el mismo disco que la base no es un respaldo contra perder el disco.

const BACKUP_CRON = "0 3 * * *"; // 03:00 America/Santiago (TZ del contenedor)
const BACKUP_KEEP = 7;

migrate(
  (app) => {
    /* ------------------------------------------------- registro cerrado -- */
    const users = app.findCollectionByNameOrId("users");
    if (users.createRule !== null) {
      users.createRule = null;
      app.save(users);
    }

    /* ------------------------------------------------- respaldo diario --- */
    const settings = app.settings();
    settings.backups.cron = BACKUP_CRON;
    settings.backups.cronMaxKeep = BACKUP_KEEP;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.backups.cron = "";
    app.save(settings);
    // El registro NO se reabre al revertir: dejar una puerta abierta como
    // efecto secundario de deshacer otra cosa es exactamente el accidente que
    // esta migración existe para impedir.
  }
);
