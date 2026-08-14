/// <reference path="../../pb_data/types.d.ts" />

// Siembra el catálogo y unas tareas de arranque para una cuenta.
//
// Con la taxonomía scopeada por dueño (1770001400), una cuenta recién creada
// no vería ninguna categoría, ninguna cuenta contable ni ningún tipo de
// proyecto: el ledger no tendría dónde imputar y la app abriría en blanco.
//
// El catálogo NO se hardcodea acá. Se copia de la cuenta más antigua, que es la
// que quedó con las filas sembradas por las migraciones originales. Así hay una
// sola fuente de verdad: si curas tu vocabulario, las cuentas nuevas heredan el
// vocabulario curado y no una lista congelada en el código que se va separando
// de la realidad con cada cambio.
//
// Caso de instalación nueva: las migraciones siembran las filas sin dueño y
// todavía no hay ninguna cuenta. Entonces la primera cuenta que se cree las
// ADOPTA en vez de copiarlas.

const CATALOG = ["taxonomy", "categories", "accounts", "settings"];

// Campos que nunca se copian de la fila plantilla.
const SKIP = { id: 1, owner: 1, created: 1, updated: 1, collectionId: 1, collectionName: 1 };

/** Tareas de arranque: qué hacer al entrar por primera vez. */
const STARTER_TASKS = [
  {
    title: "Crear tu primer workspace en Proyectos",
    notes:
      "Un workspace es cualquier frente de trabajo: un encargo, un ramo, un paper. " +
      "El trabajo real sigue viviendo en tus carpetas y repos; acá guardas el índice " +
      "y el punto de reentrada.",
  },
  {
    title: "Escribir el siguiente paso de ese workspace",
    notes:
      "Son dos campos, «cuando…» y «entonces…», y esa forma no es capricho: un plan " +
      "si-entonces automatiza el inicio, que es el paso donde de verdad se falla.",
  },
  {
    title: "Anotar dónde vive cada cosa (Recursos)",
    notes:
      "Carpeta, repo, planilla, Overleaf. Llena el campo «para qué era»: es la línea " +
      "que te va a explicar en tres semanas por qué guardaste eso.",
  },
  {
    title: "Registrar un ingreso o un egreso en Finanzas",
    notes:
      "Con eso el ledger empieza a servir: lo por cobrar sale de los documentos en " +
      "estado comprometido o facturado.",
  },
  {
    title: "Revisar Configuración y borrar estas tareas",
    notes:
      "Ahí ajustas moneda por defecto, IVA, retención y la hora del resumen diario. " +
      "Estas cinco tareas son de bienvenida: bórralas cuando ya no te sirvan.",
  },
];

/**
 * Grupos de taxonomía que llegaron DESPUÉS de la siembra original.
 *
 * `seedUser` copia el catálogo entero solo cuando la cuenta no tiene ninguna
 * fila, así que una cuenta ya sembrada nunca vería un grupo nuevo: se quedaría
 * sin etiquetas para los estados de presupuesto y de compromiso. Y en una
 * instalación nueva la migración que los agrega corre antes de que exista
 * ninguna cuenta, así que tampoco puede sembrarlos ella.
 *
 * Por eso van acá, fila por fila, y se revisan en cada arranque.
 *
 * [group, value, label, color]
 */
const REQUIRED_GROUPS = [
  ["quote_status", "draft", "Borrador", "neutral"],
  ["quote_status", "pending", "Pendiente", "warn"],
  ["quote_status", "approved", "Aprobado", "ok"],
  ["quote_status", "rejected", "Rechazado", "bad"],

  ["commitment_status", "tentative", "Tentativo", "warn"],
  ["commitment_status", "confirmed", "Confirmado", "accent"],
  ["commitment_status", "done", "Cumplido", "ok"],
  ["commitment_status", "cancelled", "Anulado", "neutral"],
];

/** ¿Cuántas filas de esta colección tiene ya la cuenta? */
function ownedCount(collection, userId) {
  try {
    return $app.findRecordsByFilter(
      collection,
      'owner = "' + userId + '"',
      "",
      1,
      0
    ).length;
  } catch (_) {
    return 0;
  }
}

function orphanRows(collection) {
  try {
    return $app.findRecordsByFilter(collection, "owner = ''", "", 100000, 0);
  } catch (_) {
    return [];
  }
}

/** Cuenta más antigua distinta de `userId`: la plantilla del catálogo. */
function templateOwner(userId) {
  try {
    const us = $app.findRecordsByFilter(
      "users",
      'id != "' + userId + '"',
      "created",
      1,
      0
    );
    return us.length ? us[0].id : null;
  } catch (_) {
    return null;
  }
}

function copyRows(collection, fromOwner, toUserId) {
  let rows = [];
  try {
    rows = $app.findRecordsByFilter(
      collection,
      'owner = "' + fromOwner + '"',
      "",
      100000,
      0
    );
  } catch (_) {
    return 0;
  }

  const col = $app.findCollectionByNameOrId(collection);
  let n = 0;

  for (const src of rows) {
    const copy = new Record(col);
    const data = src.publicExport();
    for (const key in data) {
      if (SKIP[key]) continue;
      copy.set(key, data[key]);
    }
    copy.set("owner", toUserId);
    try {
      $app.save(copy);
      n++;
    } catch (err) {
      console.log("seed: could not copy " + collection + " row: " + err);
    }
  }
  return n;
}

/**
 * Completa los grupos de REQUIRED_GROUPS que le falten a la cuenta.
 *
 * Idempotente y barato: una consulta por fila faltante, cero escrituras cuando
 * ya está todo. Son filas bloqueadas (`locked`), así que la etiqueta y el color
 * se pueden editar después sin que esto las pise — solo se crea lo ausente.
 */
function ensureGroups(userId) {
  let created = 0;
  const col = $app.findCollectionByNameOrId("taxonomy");
  let position = 0;
  let lastGroup = "";

  for (const row of REQUIRED_GROUPS) {
    const group = row[0];
    const value = row[1];
    if (group !== lastGroup) {
      position = 0;
      lastGroup = group;
    }
    const pos = position++;

    let existing = [];
    try {
      existing = $app.findRecordsByFilter(
        "taxonomy",
        'owner = "' + userId + '" && group = "' + group + '" && value = "' + value + '"',
        "",
        1,
        0
      );
    } catch (_) {
      continue;
    }
    if (existing.length) continue;

    const r = new Record(col);
    r.set("group", group);
    r.set("value", value);
    r.set("label", row[2]);
    r.set("color", row[3]);
    r.set("position", pos);
    r.set("active", true);
    r.set("locked", true);
    r.set("owner", userId);
    try {
      $app.save(r);
      created++;
    } catch (err) {
      console.log("seed: no se pudo crear " + group + "/" + value + ": " + err);
    }
  }

  return created;
}

function seedTasks(userId) {
  const col = $app.findCollectionByNameOrId("tasks");
  let n = 0;
  for (const t of STARTER_TASKS) {
    const r = new Record(col);
    r.set("title", t.title);
    r.set("notes", t.notes);
    r.set("status", "todo");
    r.set("owner", userId);
    try {
      $app.save(r);
      n++;
    } catch (err) {
      console.log("seed: could not create starter task: " + err);
    }
  }
  return n;
}

/**
 * Deja una cuenta lista para usar.
 *
 * Idempotente y granular: mira colección por colección y solo llena las que
 * estén vacías. Así se puede llamar en cada arranque sin duplicar nada, y una
 * siembra que quedó a medias —por ejemplo la que chocaba con los índices únicos
 * globales, antes de 1770001500— se repara sola en el siguiente reinicio.
 *
 * Las tareas de bienvenida son la excepción: van solo cuando la cuenta es nueva
 * de verdad (todavía sin `settings`). Si no, volverían a aparecer cada vez que
 * alguien termine de borrarlas.
 */
function seedUser(userId) {
  if (!userId) return false;

  const isNew = ownedCount("settings", userId) === 0;
  const template = templateOwner(userId);
  const summary = [];

  for (const collection of CATALOG) {
    if (ownedCount(collection, userId) > 0) continue; // ya la tiene

    // Instalación nueva: las filas que sembraron las migraciones están sin
    // dueño y esta es la primera cuenta. Se adoptan en vez de copiarse.
    const orphans = orphanRows(collection);
    if (orphans.length) {
      let n = 0;
      for (const r of orphans) {
        r.set("owner", userId);
        try {
          $app.save(r);
          n++;
        } catch (err) {
          console.log("seed: could not adopt " + collection + " row: " + err);
        }
      }
      summary.push(collection + ":" + n + " (adoptadas)");
      continue;
    }

    if (template) {
      summary.push(collection + ":" + copyRows(collection, template, userId));
    }
  }

  // Aparte del catálogo: esto corre siempre, incluso en cuentas que ya lo
  // tienen todo, porque es justamente el caso que el bucle de arriba se salta.
  const groups = ensureGroups(userId);
  if (groups) summary.push("taxonomy:" + groups + " (grupos nuevos)");

  if (isNew) summary.push("tasks:" + seedTasks(userId));

  if (!summary.length) return false; // no hacía falta nada
  console.log("seed: cuenta " + userId + " → " + summary.join(", "));
  return true;
}

/** Siembra cualquier cuenta que se haya quedado sin catálogo. */
function seedMissing() {
  let users = [];
  try {
    users = $app.findRecordsByFilter("users", "id != ''", "created", 500, 0);
  } catch (err) {
    console.log("seed: could not list users: " + err);
    return;
  }
  for (const u of users) seedUser(u.id);
}

module.exports = { seedUser, seedMissing, ensureGroups, STARTER_TASKS };
