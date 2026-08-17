/// <reference path="../../pb_data/types.d.ts" />

// Un encargo completo, de ejemplo, para que la app no abra en blanco.
//
// Una cuenta recién creada tenía catálogo pero ningún dato, y una app vacía no
// enseña nada: no se ve qué es un workspace, para qué sirve el mapa de
// recursos, cómo se lee un presupuesto aprobado ni de dónde sale el número de
// "por cobrar". Acá se siembra un caso real y pequeño —dos encargos, uno con su
// subproyecto— que toca **todas** las piezas de la app: bitácora, tareas,
// ledger con sus cuatro estados, presupuesto aprobado y presupuesto enviado,
// horas comprometidas en el calendario, bandeja por triar, rutinas con su
// grilla y unos días de ritmo.
//
// Tres reglas que hacen que esto no se convierta en basura permanente:
//
//   1. Cada fila lleva `demo = true`. Configuración tiene un botón que borra
//      exactamente eso y nada más.
//   2. La siembra ocurre **una vez** por cuenta (`settings.demo_seeded`). Si la
//      borras, no vuelve en el siguiente arranque.
//   3. No se toca ninguna preferencia de la persona. En particular no se
//      rellenan los datos del emisor: un RUT de mentira en el encabezado de un
//      presupuesto real es peor que un encabezado vacío.
//
// OJO: esto corre dentro de un handler, así que se entra por require() desde
// pb_hooks/lib/seed.js. Nada de tocar la base en el nivel superior del archivo.

/* --------------------------------------------------------------- fechas --- */

/** "YYYY-MM-DD" desplazado `days` desde hoy. Negativo = pasado. */
function day(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function year() {
  return new Date().getUTCFullYear();
}

/**
 * Lo que va delante del nombre de cada proyecto sembrado.
 *
 * Va **delante** y no detrás porque las filas truncan: un sufijo se pierde
 * justo en el teléfono, que es donde uno abre la app por primera vez y no sabe
 * qué de lo que ve es suyo. Se pierde parte del nombre a cambio, y da lo mismo:
 * los ejemplos se distinguen entre sí por la segunda mitad solo mientras son lo
 * único que hay.
 *
 * Si cambia, hay que cambiarlo también en la migración 1770002700, que renombra
 * los que ya se sembraron.
 */
const DEMO_PREFIX = "Proyecto de ejemplo · ";

/* -------------------------------------------------------------- helpers --- */

function firstOwned(collection, userId, filter) {
  const where = 'owner = "' + userId + '"' + (filter ? " && " + filter : "");
  try {
    const rows = $app.findRecordsByFilter(collection, where, "", 1, 0);
    return rows.length ? rows[0] : null;
  } catch (_) {
    return null;
  }
}

/** Id de una categoría del ledger de esta cuenta, por nombre. */
function categoryId(userId, name) {
  const r = firstOwned("categories", userId, 'name = "' + name + '"');
  return r ? r.id : "";
}

function accountId(userId, name) {
  const r = firstOwned("accounts", userId, 'name = "' + name + '"');
  return r ? r.id : "";
}

/** ¿Existe ya una fila de esta cuenta que cumpla el filtro? */
function taken(collection, userId, filter) {
  return firstOwned(collection, userId, filter) !== null;
}

/**
 * Un valor libre para un campo con índice único.
 *
 * La cuenta puede llevar meses de uso antes de que esto corra —los ejemplos se
 * siembran también en cuentas viejas— así que "EST-2026-01" o "P-2026-001"
 * pueden estar ocupados por algo real. Un choque de índice único aborta la fila
 * entera en silencio, y con ella todo lo que colgaba de ella. Se prueban
 * sufijos hasta encontrar uno libre.
 */
function freeValue(collection, userId, field, base) {
  let candidate = base;
  for (let i = 2; i < 30; i++) {
    if (!taken(collection, userId, field + ' = "' + candidate + '"')) return candidate;
    candidate = base + "-" + i;
  }
  return ""; // sin código: el índice único no aplica a los vacíos
}

/**
 * Relaciones de las que una fila cuelga. Si el padre no se pudo crear, la fila
 * tampoco tiene sentido: un recurso sin proyecto ni siquiera es válido, y una
 * bitácora sin proyecto no se lee en ninguna parte.
 */
const PARENTS = ["project", "quote", "routine"];

/**
 * Crea una fila de ejemplo y devuelve su id.
 *
 * Un fallo no puede tumbar la siembra entera: lo que se pudo crear queda, se
 * anota lo que no, y la app abre igual. Peor que un ejemplo incompleto sería
 * una cuenta que no se puede usar.
 */
function add(collection, data) {
  for (const key of PARENTS) {
    // La clave ausente significa "esta fila no cuelga de nada", que es
    // legítimo: una tarea suelta, un gasto sin proyecto. La clave presente y
    // vacía significa que el padre falló.
    if (key in data && !data[key]) return "";
  }

  try {
    const col = $app.findCollectionByNameOrId(collection);
    const r = new Record(col);
    for (const key in data) r.set(key, data[key]);
    r.set("demo", true);
    $app.save(r);
    return r.id;
  } catch (err) {
    console.log("demo: no se pudo crear " + collection + ": " + err);
    return "";
  }
}

/* ---------------------------------------------------------------- datos --- */

function seedEntities(owner) {
  return {
    client: add("entities", {
      owner: owner,
      name: "Constructora Andes Ltda.",
      kind: "company",
      tax_id: "76.543.210-9",
      email: "contacto@constructoraandes.cl",
      phone: "+56 63 234 5678",
      address: "Av. Picarte 1234, Valdivia",
      notes: "Contraparte del encargo de ejemplo.",
      active: true,
    }),
    university: add("entities", {
      owner: owner,
      name: "Universidad Austral de Chile",
      kind: "university",
      email: "direccion.escuela@uach.cl",
      address: "Campus Miraflores, Valdivia",
      notes: "Contraparte del ejemplo de docencia.",
      active: true,
    }),
    prospect: add("entities", {
      owner: owner,
      name: "Inmobiliaria Los Robles SpA",
      kind: "company",
      tax_id: "77.111.222-3",
      email: "operaciones@losrobles.cl",
      notes: "Le enviaste un presupuesto y todavía no responde.",
      active: true,
    }),
  };
}

function seedProjects(owner, people) {
  const main = add("projects", {
    owner: owner,
    name: DEMO_PREFIX + "Refuerzo estructural — Edificio Aula Magna",
    code: freeValue("projects", owner, "code", "EST-" + year() + "-01"),
    kind: "structural",
    status: "active",
    priority: "high",
    health: "ok",
    client: people.client,
    start_date: day(-35),
    due_date: day(25),
    budget: 7600000,
    budget_currency: "CLP",
    summary:
      "Diagnóstico y refuerzo de las vigas del segundo nivel tras las fisuras " +
      "detectadas en la revisión anual.",
    next_cue: "Cuando llegue el informe del laboratorio",
    next_step: "Actualizar el modelo con las resistencias reales y cerrar el capítulo 4",
    tags: ["ejemplo", "refuerzo"],
    notes:
      "<p>Este workspace es un <strong>ejemplo</strong>: puedes editarlo, o borrar " +
      "todos los datos de ejemplo desde Configuración.</p>",
  });

  const lab = add("projects", {
    owner: owner,
    name: DEMO_PREFIX + "Ensayos de laboratorio",
    code: freeValue("projects", owner, "code", "EST-" + year() + "-01-L"),
    kind: "structural",
    status: "waiting",
    priority: "normal",
    health: "risk",
    parent: main,
    client: people.client,
    start_date: day(-20),
    due_date: day(12),
    summary: "Extracción y ensayo de testigos de hormigón. Cuelga del encargo principal.",
    next_cue: "Cuando el laboratorio confirme la fecha",
    next_step: "Coordinar el retiro de los testigos y avisar en obra",
  });

  const teaching = add("projects", {
    owner: owner,
    name: DEMO_PREFIX + "Hormigón Armado — segundo semestre",
    code: freeValue("projects", owner, "code", "DOC-" + year() + "-2"),
    kind: "teaching",
    status: "active",
    priority: "normal",
    health: "ok",
    client: people.university,
    start_date: day(-10),
    due_date: day(120),
    summary: "Un ramo de pregrado: 10 horas semanales entre clases, ayudantías y corrección.",
    next_cue: "Cada lunes a las 9:00",
    next_step: "Dejar lista la clase de la semana y subir la guía",
    tags: ["ejemplo", "docencia"],
  });

  return { main: main, lab: lab, teaching: teaching };
}

/** El mapa: dónde vive de verdad el trabajo. Lo que importa es "para qué era". */
function seedResources(owner, p) {
  add("resources", {
    owner: owner,
    project: p.main,
    label: "Carpeta del encargo",
    kind: "folder",
    path: "~/Proyectos/AulaMagna",
    purpose: "Todo lo entregable: planos, informes y respaldos de cálculo.",
    state: "active",
    pinned: true,
    position: 0,
  });
  add("resources", {
    owner: owner,
    project: p.main,
    label: "Modelo estructural",
    kind: "other",
    path: "~/Proyectos/AulaMagna/modelo/aula-magna.edb",
    purpose: "El modelo con el que se calculan los refuerzos. Es el archivo que manda.",
    state: "active",
    position: 1,
  });
  add("resources", {
    owner: owner,
    project: p.main,
    label: "Planilla de costos",
    kind: "sheet",
    path: "~/Proyectos/AulaMagna/costos.xlsx",
    purpose: "Cubicaciones y precios unitarios que respaldan el presupuesto enviado.",
    state: "reference",
    position: 2,
  });
  add("resources", {
    owner: owner,
    project: p.lab,
    label: "Informes del laboratorio",
    kind: "folder",
    path: "~/Proyectos/AulaMagna/ensayos",
    purpose: "Certificados de rotura de los testigos, tal como los manda el laboratorio.",
    state: "active",
    pinned: true,
    position: 0,
  });
  add("resources", {
    owner: owner,
    project: p.teaching,
    label: "Material del curso",
    kind: "drive",
    path: "~/Docencia/HormigonArmado",
    purpose: "Guías, presentaciones y las pruebas de años anteriores.",
    state: "active",
    pinned: true,
    position: 0,
  });
}

/** La bitácora: qué pasó y cuándo. Es lo que evita reconstruir el contexto de memoria. */
function seedLog(owner, p) {
  add("log", {
    owner: owner,
    project: p.main,
    date: day(-33),
    kind: "milestone",
    title: "Visita a terreno y levantamiento",
    body: "<p>Se levantaron las cuatro vigas del eje B. Fisuras visibles en V-12 y V-14.</p>",
    hours: 6,
  });
  add("log", {
    owner: owner,
    project: p.main,
    date: day(-21),
    kind: "meeting",
    title: "Reunión con el mandante",
    body: "<p>Acuerdan avanzar con el refuerzo por fibra de carbono si los ensayos lo permiten.</p>",
    hours: 1.5,
  });
  add("log", {
    owner: owner,
    project: p.main,
    date: day(-12),
    kind: "finding",
    title: "V-12 con recubrimiento menor al de planos",
    body: "<p>3 cm contra los 5 cm del proyecto original. Afecta el anclaje previsto.</p>",
    hours: 2,
  });
  add("log", {
    owner: owner,
    project: p.main,
    date: day(-6),
    kind: "decision",
    title: "Se opta por refuerzo con fibra de carbono",
    body: "<p>Menos peso propio y no exige detener el uso del edificio.</p>",
    hours: 1,
  });
  add("log", {
    owner: owner,
    project: p.lab,
    date: day(-4),
    kind: "progress",
    title: "Testigos extraídos, a la espera del certificado",
    body: "<p>Cinco testigos del eje B. El laboratorio promete el certificado en dos semanas.</p>",
    hours: 3,
  });
  add("log", {
    owner: owner,
    project: p.teaching,
    date: day(-8),
    kind: "note",
    title: "Primera clase del semestre",
    body: "<p>38 inscritos. Se mantiene la evaluación por proyecto.</p>",
    hours: 2,
  });
}

function seedTasks(owner, p) {
  add("tasks", {
    owner: owner,
    project: p.main,
    title: "Cerrar el capítulo 4 del informe",
    status: "doing",
    priority: "high",
    due_date: day(3),
    effort_h: 6,
  });
  add("tasks", {
    owner: owner,
    project: p.main,
    title: "Enviar la propuesta de refuerzo al mandante",
    status: "todo",
    priority: "normal",
    due_date: day(8),
    effort_h: 3,
  });
  add("tasks", {
    owner: owner,
    project: p.main,
    title: "Cotizar el ensayo de testigos",
    status: "done",
    priority: "normal",
    done_date: day(-9),
    effort_h: 1,
  });
  add("tasks", {
    owner: owner,
    project: p.lab,
    title: "Coordinar el retiro de los testigos",
    status: "blocked",
    priority: "high",
    due_date: day(5),
    notes: "Esperando que el laboratorio confirme la fecha.",
    effort_h: 2,
  });
  add("tasks", {
    owner: owner,
    project: p.teaching,
    title: "Preparar la guía 3",
    status: "todo",
    priority: "normal",
    due_date: day(6),
    effort_h: 4,
  });
  // Sin proyecto y sin fecha a propósito: es lo que aparece en Hoy bajo
  // "Pendientes sin fecha", y demuestra que nada queda invisible.
  add("tasks", {
    owner: owner,
    title: "Responder los correos que quedaron abiertos",
    status: "todo",
    priority: "low",
  });
}

/** El ledger, con los cuatro estados que la app distingue. */
function seedEntries(owner, p, people) {
  const bank = accountId(owner, "Cuenta corriente");
  const cat = {
    structural: categoryId(owner, "Proyecto estructural"),
    teaching: categoryId(owner, "Docencia"),
    services: categoryId(owner, "Servicios profesionales"),
    travel: categoryId(owner, "Terreno y traslados"),
    software: categoryId(owner, "Software y suscripciones"),
    taxes: categoryId(owner, "Impuestos y contabilidad"),
  };

  add("entries", {
    owner: owner,
    date: day(-30),
    direction: "income",
    description: "Anticipo 40% — refuerzo Aula Magna",
    amount: 3040000,
    currency: "CLP",
    fx_rate: 1,
    amount_clp: 3040000,
    net: 2554622,
    tax: 485378,
    status: "paid",
    due_date: day(-16),
    paid_date: day(-14),
    project: p.main,
    entity: people.client,
    account: bank,
    category: cat.structural,
    doc_type: "factura",
    doc_number: "1041",
  });
  add("entries", {
    owner: owner,
    date: day(-5),
    direction: "income",
    description: "Estado de pago 2 — refuerzo Aula Magna",
    amount: 2280000,
    currency: "CLP",
    fx_rate: 1,
    amount_clp: 2280000,
    net: 1915966,
    tax: 364034,
    status: "invoiced",
    due_date: day(9),
    project: p.main,
    entity: people.client,
    account: bank,
    category: cat.structural,
    doc_type: "factura",
    doc_number: "1058",
  });
  add("entries", {
    owner: owner,
    date: day(-2),
    direction: "income",
    description: "Saldo final — refuerzo Aula Magna",
    amount: 2280000,
    currency: "CLP",
    fx_rate: 1,
    amount_clp: 2280000,
    status: "planned",
    due_date: day(45),
    project: p.main,
    entity: people.client,
    category: cat.structural,
    notes: "Lo dejó proyectado la aprobación del presupuesto.",
  });
  add("entries", {
    owner: owner,
    date: day(-7),
    direction: "income",
    description: "Honorarios docencia — mes en curso",
    amount: 1200000,
    currency: "CLP",
    fx_rate: 1,
    amount_clp: 1200000,
    withholding: 174000,
    status: "committed",
    due_date: day(21),
    project: p.teaching,
    entity: people.university,
    account: bank,
    category: cat.teaching,
    doc_type: "honorarios",
  });

  add("entries", {
    owner: owner,
    date: day(-8),
    direction: "expense",
    description: "Ensayo de 5 testigos de hormigón",
    amount: 480000,
    currency: "CLP",
    fx_rate: 1,
    amount_clp: 480000,
    net: 403361,
    tax: 76639,
    status: "paid",
    paid_date: day(-8),
    project: p.lab,
    account: bank,
    category: cat.services,
    doc_type: "factura",
    doc_number: "A-2291",
  });
  add("entries", {
    owner: owner,
    date: day(-33),
    direction: "expense",
    description: "Traslados a terreno (Valdivia — obra)",
    amount: 85000,
    currency: "CLP",
    fx_rate: 1,
    amount_clp: 85000,
    status: "paid",
    paid_date: day(-33),
    project: p.main,
    account: bank,
    category: cat.travel,
    doc_type: "boleta",
  });
  add("entries", {
    owner: owner,
    date: day(-18),
    direction: "expense",
    description: "Licencia mensual del software de cálculo",
    amount: 149000,
    currency: "CLP",
    fx_rate: 1,
    amount_clp: 149000,
    status: "paid",
    paid_date: day(-18),
    account: bank,
    category: cat.software,
    recurring: true,
    notes: "Marcada como recurrente: se revisa, no se renueva sola.",
  });
  // Un gasto por descuido, no por decisión. Suelto es invisible; marcado, al
  // final del año es un número.
  add("entries", {
    owner: owner,
    date: day(-11),
    direction: "expense",
    description: "Multa por declaración fuera de plazo",
    amount: 23000,
    currency: "CLP",
    fx_rate: 1,
    amount_clp: 23000,
    status: "paid",
    paid_date: day(-11),
    account: bank,
    category: cat.taxes,
    friction_cost: true,
    notes: "Marcada como costo de fricción: se perdió por un olvido, no por una decisión.",
  });
}

/**
 * Dos presupuestos: el que se aprobó y creó el encargo, y el que está
 * esperando respuesta. Los totales van congelados, como los escribe la app.
 */
function seedQuotes(owner, p, people) {
  const approved = add("quotes", {
    owner: owner,
    number: freeValue("quotes", owner, "number", "P-" + year() + "-001"),
    title: "Refuerzo estructural — Edificio Aula Magna",
    client: people.client,
    project: p.main,
    kind: "structural",
    description:
      "Diagnóstico, cálculo y proyecto de refuerzo de las vigas del segundo nivel, " +
      "incluyendo ensayos de laboratorio.",
    status: "approved",
    date: day(-45),
    valid_until: day(-15),
    decided_date: day(-36),
    currency: "CLP",
    fx_rate: 1,
    overhead_pct: 0.15,
    profit_pct: 0.1,
    direct_total: 6080000,
    overhead_amount: 912000,
    profit_amount: 608000,
    net_total: 7600000,
    net_total_clp: 7600000,
    work_hours: 180,
    max_hours_week: 12,
    earliest_start: day(-35),
    plan_start: day(-35),
    plan_end: day(30),
    plan_hours_week: 12,
    terms: "50% al inicio, 30% contra informe de diagnóstico, 20% contra entrega final.",
  });

  if (approved) {
    const items = [
      ["Levantamiento y diagnóstico estructural en terreno", "gl", 1, 1200000],
      ["Modelación y cálculo de los refuerzos", "gl", 1, 2600000],
      ["Ensayos de laboratorio (testigos de hormigón)", "un", 5, 96000],
      ["Informe final y planos de refuerzo", "gl", 1, 1800000],
    ];
    for (let i = 0; i < items.length; i++) {
      add("quote_items", {
        owner: owner,
        quote: approved,
        position: i,
        description: items[i][0],
        unit: items[i][1],
        qty: items[i][2],
        unit_price: items[i][3],
        total: items[i][2] * items[i][3],
      });
    }

    const deliverables = [
      ["Informe de diagnóstico", "Estado actual de las vigas y resultados de los ensayos.", 20],
      ["Planos de refuerzo", "Detalles de la fibra de carbono y sus anclajes.", 45],
      ["Informe final firmado", "Memoria de cálculo y especificaciones para la obra.", 60],
    ];
    for (let i = 0; i < deliverables.length; i++) {
      add("deliverables", {
        owner: owner,
        quote: approved,
        position: i,
        name: deliverables[i][0],
        detail: deliverables[i][1],
        lead_days: deliverables[i][2],
      });
    }
  }

  const pending = add("quotes", {
    owner: owner,
    number: freeValue("quotes", owner, "number", "P-" + year() + "-002"),
    title: "Inspección técnica — Bodega Ruta 5",
    client: people.prospect,
    kind: "inspection",
    description: "Inspección estructural y informe de habitabilidad de la bodega existente.",
    status: "pending",
    date: day(-6),
    valid_until: day(24),
    currency: "CLP",
    fx_rate: 1,
    overhead_pct: 0.15,
    profit_pct: 0.1,
    direct_total: 1900000,
    overhead_amount: 285000,
    profit_amount: 190000,
    net_total: 2375000,
    net_total_clp: 2375000,
    work_hours: 60,
    max_hours_week: 6,
    earliest_start: day(20),
    terms: "50% al inicio, 50% contra entrega del informe.",
    notes: "Enviado. Si lo aprueban, el proyecto y las horas se crean solos.",
  });

  if (pending) {
    const items = [
      ["Inspección en terreno (dos jornadas)", "día", 2, 450000],
      ["Informe técnico con registro fotográfico", "gl", 1, 1000000],
    ];
    for (let i = 0; i < items.length; i++) {
      add("quote_items", {
        owner: owner,
        quote: pending,
        position: i,
        description: items[i][0],
        unit: items[i][1],
        qty: items[i][2],
        unit_price: items[i][3],
        total: items[i][2] * items[i][3],
      });
    }
    add("deliverables", {
      owner: owner,
      quote: pending,
      position: 0,
      name: "Informe de inspección",
      detail: "Hallazgos, fotografías y recomendaciones priorizadas.",
      lead_days: 30,
    });
  }

  return { approved: approved, pending: pending };
}

/** Horas por semana entre dos fechas: la unidad del calendario. */
function seedCommitments(owner, p, people, quotes) {
  add("commitments", {
    owner: owner,
    title: "Refuerzo Aula Magna",
    kind: "structural",
    project: p.main,
    quote: quotes.approved,
    entity: people.client,
    start_date: day(-35),
    end_date: day(30),
    hours_per_week: 12,
    status: "confirmed",
    source: "quote",
    notes: "Lo reservó la aprobación del presupuesto.",
  });
  add("commitments", {
    owner: owner,
    title: "Hormigón Armado — clases y ayudantías",
    kind: "teaching",
    project: p.teaching,
    entity: people.university,
    start_date: day(-10),
    end_date: day(120),
    hours_per_week: 10,
    status: "confirmed",
    source: "manual",
  });
  add("commitments", {
    owner: owner,
    title: "Inspección Bodega Ruta 5 (si la aprueban)",
    kind: "inspection",
    quote: quotes.pending,
    entity: people.prospect,
    start_date: day(20),
    end_date: day(62),
    hours_per_week: 6,
    status: "tentative",
    source: "quote",
    notes: "Tentativo: ocupa lugar en el calendario sin comprometerlo.",
  });
}

function seedInbox(owner, p) {
  add("inbox", {
    owner: owner,
    text: "Llamar al laboratorio por los testigos el viernes",
    status: "open",
  });
  add("inbox", {
    owner: owner,
    text: "Idea: una guía rápida de refuerzos para el curso",
    status: "open",
  });
  add("inbox", {
    owner: owner,
    text: "Pedir cotización de andamios",
    status: "planned",
    project: p.main,
    outcome: "Quedó como tarea del encargo.",
  });
}

/** Rutinas y sus repeticiones. Sin racha: saltarse un día no penaliza nada. */
function seedRoutines(owner) {
  const writing = add("routines", {
    owner: owner,
    name: "Escribir 30 minutos",
    cue: "Después del primer café, antes de abrir el correo",
    action: "Abrir el documento en curso y escribir 30 minutos sin revisar nada",
    started: day(-28),
    active: true,
  });
  const inbox = add("routines", {
    owner: owner,
    name: "Dejar la bandeja en cero",
    cue: "Al cerrar el computador",
    action: "Triar lo que quedó en la bandeja: tarea, hoy o descarte",
    started: day(-21),
    active: true,
  });

  // Días marcados, con huecos: así se ve la grilla de verdad.
  const writingDays = [-1, -2, -3, -6, -7, -8, -9, -13, -14, -15, -16, -20, -21];
  for (let i = 0; i < writingDays.length; i++) {
    add("routine_log", {
      owner: owner,
      routine: writing,
      date: day(writingDays[i]),
      automaticity: i < 5 ? 5 : 3,
    });
  }

  const inboxDays = [-1, -2, -4, -5, -8, -11, -12, -15];
  for (let i = 0; i < inboxDays.length; i++) {
    add("routine_log", {
      owner: owner,
      routine: inbox,
      date: day(inboxDays[i]),
      automaticity: 4,
    });
  }
}

/** Unos días de sueño y energía: es lo que el Ritmo necesita para decir algo. */
function seedDaily(owner) {
  const days = [
    ["23:30", "07:00", 4, 3, 2, 5.5],
    ["00:10", "07:15", 3, 3, 2, 4],
    ["23:00", "06:45", 5, 4, 3, 6],
    ["23:45", "07:30", 4, 3, 3, 5],
    ["22:50", "06:30", 5, 4, 2, 6.5],
    ["00:30", "08:00", 2, 3, 3, 3],
    ["23:20", "07:10", 4, 4, 2, 5],
    ["23:10", "06:50", 5, 3, 2, 6],
    ["23:55", "07:20", 3, 3, 3, 4.5],
    ["23:05", "07:00", 4, 4, 2, 5.5],
  ];
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const date = day(-(i + 1));
    // Una fila por día y por cuenta: si esa persona ya anotó ese día, es suyo.
    if (taken("daily", owner, 'date >= "' + date + '" && date < "' + day(-i) + '"')) continue;
    add("daily", {
      owner: owner,
      date: date,
      sleep_start: d[0],
      sleep_end: d[1],
      energy_morning: d[2],
      energy_afternoon: d[3],
      energy_evening: d[4],
      focus_hours: d[5],
    });
  }
}

/* ------------------------------------------------------------ entrada ----- */

/** ¿Ya tiene datos de ejemplo esta cuenta (o los tuvo y los borró)? */
function alreadySeeded(settings) {
  return Boolean(settings && settings.get("demo_seeded"));
}

/**
 * Siembra el ejemplo completo. Una sola vez por cuenta.
 *
 * La marca se escribe **antes** de crear las filas: si algo falla a mitad de
 * camino, lo peor que puede pasar es un ejemplo incompleto que se puede borrar,
 * y no una siembra que se repite en cada arranque duplicándolo todo.
 */
function seedDemo(userId) {
  if (!userId) return false;

  const settings = firstOwned("settings", userId, null);
  if (!settings) return false; // la cuenta todavía no tiene catálogo
  if (alreadySeeded(settings)) return false;

  settings.set("demo_seeded", true);
  try {
    $app.save(settings);
  } catch (err) {
    console.log("demo: no se pudo marcar la cuenta: " + err);
    return false;
  }

  const people = seedEntities(userId);
  const projects = seedProjects(userId, people);
  seedResources(userId, projects);
  seedLog(userId, projects);
  seedTasks(userId, projects);
  seedEntries(userId, projects, people);
  const quotes = seedQuotes(userId, projects, people);
  seedCommitments(userId, projects, people, quotes);
  seedInbox(userId, projects);
  seedRoutines(userId);
  seedDaily(userId);

  console.log("demo: datos de ejemplo sembrados para la cuenta " + userId);
  return true;
}

module.exports = { seedDemo: seedDemo };
