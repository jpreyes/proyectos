/// <reference path="../../pb_data/types.d.ts" />

// Siembra el catálogo de una cuenta, y con él los datos de ejemplo (demo.js).
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

/**
 * Campos que se copian en blanco, por colección.
 *
 * El catálogo se hereda de la cuenta plantilla, y eso está bien para el
 * vocabulario y los umbrales. Lo que **no** puede heredarse son los datos del
 * emisor: nombre, RUT, correo y dirección son de una persona, y salen impresos
 * en el encabezado de cada presupuesto. Una cuenta nueva que arranca emitiendo
 * documentos con el RUT de otro es un error que nadie va a notar hasta que el
 * documento ya se mandó.
 *
 * Las dos banderas van con ellos por otra razón: heredarlas en true dejaría a
 * la cuenta nueva sin datos de ejemplo y sin la guía de primer ingreso.
 */
const BLANK = {
  settings: [
    "issuer_name",
    "issuer_role",
    "issuer_tax_id",
    "issuer_email",
    "issuer_phone",
    "issuer_address",
    "issuer_web",
    "demo_seeded",
    "tour_done",
  ],
};

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
  const blank = BLANK[collection] || [];
  let n = 0;

  for (const src of rows) {
    const copy = new Record(col);
    const data = src.publicExport();
    for (const key in data) {
      if (SKIP[key]) continue;
      copy.set(key, data[key]);
    }
    for (const key of blank) copy.set(key, key.indexOf("issuer_") === 0 ? "" : false);
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

/**
 * Deja una cuenta lista para usar.
 *
 * Idempotente y granular: mira colección por colección y solo llena las que
 * estén vacías. Así se puede llamar en cada arranque sin duplicar nada, y una
 * siembra que quedó a medias —por ejemplo la que chocaba con los índices únicos
 * globales, antes de 1770001500— se repara sola en el siguiente reinicio.
 *
 * Los datos de ejemplo son la excepción: los lleva su propia marca en
 * `settings` (ver demo.js), porque ahí lo que hay que recordar no es "ya están"
 * sino "ya se sembraron una vez" — si la persona los borra, no deben volver.
 */
function seedUser(userId, demo) {
  if (!userId) return false;

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

  // Va al final: el ejemplo referencia categorías y cuentas contables, así que
  // el catálogo tiene que estar puesto antes.
  if (demo) {
    try {
      if (demo.seedDemo(userId)) summary.push("ejemplos");
    } catch (err) {
      console.log("seed: falló la siembra de ejemplos: " + err);
    }
  }

  if (!summary.length) return false; // no hacía falta nada
  console.log("seed: cuenta " + userId + " → " + summary.join(", "));
  return true;
}

/**
 * Siembra cualquier cuenta que se haya quedado sin catálogo.
 *
 * `demo` llega como argumento en vez de resolverse acá con un require: este
 * archivo ya vive dentro de un handler, y encadenar un require desde adentro
 * depende de que `__hooks` siga visible a esa profundidad. El hook, que sí lo
 * tiene garantizado, hace el require y pasa el módulo.
 */
function seedMissing(demo) {
  let users = [];
  try {
    users = $app.findRecordsByFilter("users", "id != ''", "created", 500, 0);
  } catch (err) {
    console.log("seed: could not list users: " + err);
    return;
  }
  for (const u of users) seedUser(u.id, demo);
}

module.exports = { seedUser, seedMissing, ensureGroups };
