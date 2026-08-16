/// <reference path="../../pb_data/types.d.ts" />

// Lógica del resumen diario.
//
// Vive en un módulo aparte, y no en el archivo del hook, por cómo funciona el
// JSVM de PocketBase: cada handler se serializa y corre en una VM aislada que
// NO ve el ámbito del archivo que lo registró. Un callback que llame a una
// función definida arriba en el mismo archivo revienta con "X is not defined"
// en tiempo de ejecución — silenciosamente, porque el cron falla solo.
//
// Por eso el hook es una cáscara que hace require() de este módulo DENTRO del
// handler. Este archivo no termina en .pb.js, así que PocketBase no lo carga
// como hook; solo se importa.

// El horario es por cuenta: el job corre cada 15 minutos y en cada tick decide
// a quién le toca. Antes era un cron único para toda la instancia, con la hora
// de la cuenta más antigua leída una sola vez al arrancar — cambiarla exigía
// reiniciar y las demás cuentas no tenían horario propio.
const TICK_CRON = "*/15 * * * *";

const DEFAULT_HOUR = 7;
const DEFAULT_MINUTE = 30;

// Todo se calcula en la hora local del proceso, que el contenedor fija en
// America/Santiago (TZ en docker-compose.yml).
//
// No hay zona horaria por cuenta, y no es un olvido: goja no trae `Intl`, y
// `toLocaleString` acepta la opción `timeZone` pero **la ignora en silencio**
// — le pidas Madrid o Tokio, devuelve la hora local igual. Soportar husos
// distintos exigiría guardar un desfase en minutos por cuenta y mantenerlo a
// mano en cada cambio de horario de verano, no un nombre de zona.
function localNow() {
  const d = new Date();
  return {
    day:
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0"),
    minutes: d.getHours() * 60 + d.getMinutes(),
  };
}

/** Fila de settings de una cuenta, o null si todavía no tiene. */
function settingsOf(ownerId) {
  try {
    const rows = $app.findRecordsByFilter(
      "settings",
      'owner = "' + ownerId + '"',
      "",
      1,
      0
    );
    return rows.length ? rows[0] : null;
  } catch (_) {
    return null;
  }
}

/**
 * ¿Le toca a esta cuenta en este tick?
 *
 * Sí cuando ya pasó su hora local y todavía no se le mandó nada hoy. La marca
 * `digest_last_sent` es lo que evita que los ticks siguientes repitan el envío,
 * y de paso hace que un contenedor que estaba caído a la hora exacta mande en
 * cuanto vuelve, en vez de saltarse el día — cosa que un cron a las 07:30 no
 * hace.
 */
function dueTo(row, now) {
  if (row && !row.get("digest_enabled")) return false;
  if (row && row.get("digest_last_sent") === now.day) return false;

  const h = row ? Number(row.get("digest_hour")) : DEFAULT_HOUR;
  const m = row ? Number(row.get("digest_minute")) : DEFAULT_MINUTE;
  const hour = h >= 0 && h <= 23 ? h : DEFAULT_HOUR;
  const minute = m >= 0 && m <= 59 ? m : DEFAULT_MINUTE;

  return now.minutes >= hour * 60 + minute;
}

function markSent(row, day) {
  if (!row) return; // sin fila de settings no hay dónde anotar
  row.set("digest_last_sent", day);
  try {
    $app.save(row);
  } catch (err) {
    console.log("digest: could not mark last_sent: " + err);
  }
}

function isoDay(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + (offsetDays || 0));
  return d.toISOString().slice(0, 10);
}

/** PocketBase guarda las fechas como "YYYY-MM-DD HH:MM:SS.000Z". */
function bound(day, endOfDay) {
  return day + (endOfDay ? " 23:59:59.999Z" : " 00:00:00.000Z");
}

/** Las filas borradas (soft delete) nunca deben llegar al resumen. */
function find(collection, filter, sort, limit) {
  const scoped = filter ? "deleted != true && (" + filter + ")" : "deleted != true";
  try {
    return $app.findRecordsByFilter(collection, scoped, sort || "", limit || 50, 0);
  } catch (err) {
    console.log("digest: query failed on " + collection + ": " + err);
    return [];
  }
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * "$1.234.567" — los miles con punto, como se escribe en Chile.
 *
 * Escrito a mano y no con `toLocaleString("es-CL")` porque en goja el primer
 * argumento de `toLocaleString` **no es un idioma sino una base numérica**: le
 * llega "es-CL", no logra leerlo como número entre 2 y 36 y revienta con
 * `RangeError: toString() radix argument must be between 2 and 36`.
 *
 * Y esa excepción no se quedaba en la cifra: subía hasta el cron y se llevaba
 * la ejecución entera. O sea que el resumen diario llevaba **desde siempre**
 * cayéndose cada quince minutos, sin mandar nada y sin que nadie lo notara,
 * porque el correo tampoco estaba configurado y su ausencia se explicaba sola.
 *
 * La lección que conviene recordar: acá no hay `Intl` ni nada que se le
 * parezca. Todo formato de número, fecha o moneda en un hook se escribe a mano.
 */
function money(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? "-" : "";
  const digits = String(Math.abs(v));

  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits[i];
  }
  return sign + "$" + out;
}

function section(title, items) {
  if (!items.length) return "";
  const lis = items
    .map(function (i) {
      return "<li style='margin:4px 0'>" + i + "</li>";
    })
    .join("");
  return (
    "<h3 style='font:600 13px system-ui;margin:18px 0 6px;color:#111'>" +
    esc(title) +
    "</h3><ul style='margin:0;padding-left:18px;font:14px/1.5 system-ui;color:#333'>" +
    lis +
    "</ul>"
  );
}

/**
 * Arma el HTML del resumen de UN usuario. Devuelve "" si no hay nada que contar.
 *
 * El scope por dueño se aplica acá a mano y no basta con las reglas de las
 * colecciones: esto corre con $app, que las ignora por completo. Sin el filtro,
 * el resumen de cada quien traería los datos de todos.
 */
function build(ownerId) {
  const own = 'owner = "' + ownerId + '" && ';
  const today = isoDay(0);
  const in7 = isoDay(7);
  const in14 = isoDay(14);

  // --- tareas: vencidas y de la semana ------------------------------------
  const overdueTasks = find(
    "tasks",
    own + 'status != "done" && due_date != "" && due_date < "' + bound(today, false) + '"',
    "due_date",
    30
  );
  const soonTasks = find(
    "tasks",
    own + 'status != "done" && due_date >= "' +
      bound(today, false) +
      '" && due_date <= "' +
      bound(in7, true) +
      '"',
    "due_date",
    30
  );

  // --- plazos de proyecto --------------------------------------------------
  const deadlines = find(
    "projects",
    own + '(status = "active" || status = "waiting") && due_date != "" && due_date <= "' +
      bound(in14, true) +
      '"',
    "due_date",
    30
  );

  // --- por cobrar ----------------------------------------------------------
  const receivables = find(
    "entries",
    own + 'direction = "income" && (status = "invoiced" || status = "committed")',
    "due_date",
    50
  );
  let owed = 0;
  for (let i = 0; i < receivables.length; i++) {
    owed += Number(receivables[i].get("amount_clp")) || 0;
  }

  // --- bucles abiertos -----------------------------------------------------
  const inbox = find("inbox", own + 'status = "open"', "created", 50);
  const noPlan = find("projects", own + 'status = "active" && next_step = ""', "name", 30);

  const nothing =
    !overdueTasks.length &&
    !soonTasks.length &&
    !deadlines.length &&
    !receivables.length &&
    !inbox.length &&
    !noPlan.length;

  if (nothing) return ""; // no news is not worth an email

  let html =
    "<div style='max-width:620px;margin:0 auto;padding:8px 4px'>" +
    "<h2 style='font:600 18px system-ui;margin:0 0 2px;color:#111'>Resumen del día</h2>" +
    "<p style='font:13px system-ui;color:#777;margin:0'>" +
    esc(today) +
    "</p>";

  html += section(
    "Vencido",
    overdueTasks.map(function (t) {
      return "<b>" + esc(t.get("title")) + "</b> — venció " + esc(String(t.get("due_date")).slice(0, 10));
    })
  );

  html += section(
    "Esta semana",
    soonTasks.map(function (t) {
      return esc(t.get("title")) + " — " + esc(String(t.get("due_date")).slice(0, 10));
    })
  );

  html += section(
    "Plazos de proyecto",
    deadlines.map(function (p) {
      return esc(p.get("name")) + " — " + esc(String(p.get("due_date")).slice(0, 10));
    })
  );

  if (receivables.length) {
    html += section("Por cobrar — " + money(owed), [
      receivables.length + " documento(s) pendientes de pago",
    ]);
  }

  if (inbox.length) {
    html += section("Bandeja", [
      inbox.length + " cosa(s) capturadas todavía sin plan concreto",
    ]);
  }

  html += section(
    "Activos sin siguiente paso",
    noPlan.map(function (p) {
      return esc(p.get("name"));
    })
  );

  html +=
    "<p style='font:12px system-ui;color:#999;margin-top:22px'>" +
    "Enviado por tu propio sistema. Un pendiente deja de interrumpirte cuando tiene un plan, no cuando lo anotas." +
    "</p></div>";

  return html;
}

/** Todas las cuentas. `users` no tiene columna `deleted`: no pasa por find(). */
function allUsers() {
  try {
    return $app.findRecordsByFilter("users", "id != ''", "created", 100, 0);
  } catch (err) {
    console.log("digest: could not list users: " + err);
    return [];
  }
}

function send(to, html) {
  const settings = $app.settings();
  try {
    $app.newMailClient().send(
      new MailerMessage({
        from: {
          address: settings.meta.senderAddress,
          name: settings.meta.senderName,
        },
        to: [{ address: to }],
        subject: "Resumen del día — " + isoDay(0),
        html: html,
      })
    );
    console.log("digest: sent to " + to);
  } catch (err) {
    console.log("digest: send failed for " + to + ": " + err);
  }
}

/**
 * Punto de entrada del cron: un resumen por cuenta, con sus propios datos.
 *
 * DIGEST_TO redirige TODOS los resúmenes a esa dirección — es un escape para
 * depurar, no el modo normal. Con más de una cuenta significa que quien reciba
 * verá los datos de las demás, así que déjalo sin definir salvo que lo estés
 * probando.
 */
function run() {
  const override = $os.getenv("DIGEST_TO");
  const now = localNow();
  const users = allUsers();

  if (!users.length) return;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const row = settingsOf(user.id);

    if (!dueTo(row, now)) continue;

    const to = override || user.get("email");
    if (!to) continue;

    const html = build(user.id);

    // Se marca aunque no haya nada que contar: el día ya se procesó y no hay
    // por qué volver a evaluarlo en cada tick hasta medianoche.
    if (html) send(to, html);
    markSent(row, now.day);
  }
}

module.exports = { TICK_CRON, run, build, allUsers, dueTo, localNow, settingsOf };
