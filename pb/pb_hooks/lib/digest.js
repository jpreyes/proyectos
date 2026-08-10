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

const DEFAULT_CRON = "30 7 * * *"; // 07:30 America/Santiago (TZ del contenedor)

// La hora sale de la fila `settings`. Solo se puede leer con la app ya
// inicializada: hacerlo al cargar los hooks provoca un panic de Go
// ("invalid memory address or nil pointer dereference") que el try/catch de JS
// no atrapa y que tumba la carga del archivo completo.
function schedule() {
  try {
    const rows = $app.findRecordsByFilter("settings", "id != ''", "", 1, 0);
    if (rows.length) {
      const h = Number(rows[0].get("digest_hour"));
      const m = Number(rows[0].get("digest_minute"));
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return m + " " + h + " * * *";
    }
  } catch (err) {
    console.log("digest: could not read settings, using default schedule");
  }
  return DEFAULT_CRON;
}

function digestEnabled() {
  try {
    const rows = $app.findRecordsByFilter("settings", "id != ''", "", 1, 0);
    if (rows.length) return !!rows[0].get("digest_enabled");
  } catch (_) {}
  return true;
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

function money(n) {
  const v = Math.round(Number(n) || 0);
  return "$" + v.toLocaleString("es-CL");
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
  if (!digestEnabled()) return;

  const override = $os.getenv("DIGEST_TO");
  const users = allUsers();

  if (!users.length) {
    console.log("digest: no users, skipping");
    return;
  }

  for (let i = 0; i < users.length; i++) {
    const html = build(users[i].id);
    if (!html) continue; // a esta cuenta no le pasa nada hoy

    const to = override || users[i].get("email");
    if (!to) continue;

    send(to, html);
  }
}

module.exports = { DEFAULT_CRON, schedule, run, build, allUsers, digestEnabled };
