/**
 * El plan que propone el asistente, y la aduana por la que pasa.
 *
 * Este módulo no habla con nadie: define qué forma tiene un plan y **valida**
 * lo que vuelve del modelo. Va aparte y es puro a propósito, porque lo usan los
 * dos lados —el servidor antes de devolver el plan, el cliente antes de
 * aplicarlo— y porque validar dos veces lo mismo es exactamente lo que uno
 * quiere cuando en el medio hay un modelo de lenguaje.
 *
 * La regla que ordena todo lo de acá: **nada de lo que diga el modelo se cree
 * por su cara**. Un id que no exista se descarta, una fecha que no tenga la
 * forma exacta se descarta, un tipo que no esté en tu vocabulario cae al valor
 * por defecto, un monto que no sea un número se descarta. Descartar un campo no
 * bota el paso entero: una tarea sin proyecto es perfectamente legal —Hoy las
 * muestra en "Tareas sin fecha"— y es mucho mejor que una tarea colgada de
 * un proyecto inventado.
 *
 * El caso que esto evita no es teórico. Una fecha alucinada no se descubre al
 * revisarla: se descubre el día que no llegaste.
 */

/* ------------------------------------------------------------- contexto --- */

/**
 * Lo que el asistente alcanza a ver de tu cuenta.
 *
 * Es un **índice, no el contenido**: nombres e ids de proyectos, contactos y
 * catálogo. No van los cuerpos de la bitácora, ni las notas, ni los montos, ni
 * las rutas de los recursos. Alcanza de sobra para que enganche una tarea al
 * proyecto correcto, y es lo mínimo que hay que mandarle a un tercero.
 */
export interface OrganizeContext {
  today: string;
  currency: string;
  projects: {
    id: string;
    name: string;
    status: string;
    kind?: string;
    due_date?: string;
    next_step?: string;
  }[];
  entities: { id: string; name: string }[];
  categories: { id: string; name: string; direction: string }[];
  accounts: { id: string; name: string }[];
  projectKinds: string[];
  priorities: string[];
  /** El vocabulario de salud del proyecto. Va porque el agente puede cambiarla. */
  healths: string[];
  logKinds: string[];
  /** Ítems abiertos de la bandeja, cuando se está ordenando justamente eso. */
  inbox: { id: string; text: string }[];

  /*
   * Lo de abajo existe para que el agente pueda **contestar** y no solo anotar.
   * Es la parte que hay que mirar con desconfianza al agregarle campos: cada uno
   * es algo más que sale de esta máquina. Siguen siendo títulos y totales —lo
   * que se lee en una lista— nunca cuerpos de bitácora, notas ni movimiento por
   * movimiento.
   */
  /**
   * Tareas abiertas. Llevan `id` porque el agente puede cerrarlos y mover
   * sus plazos: sin el id no hay a qué apuntar.
   */
  tasks?: { id: string; title: string; project: string; due_date: string; priority: string }[];
  /** Títulos recientes de la bitácora, para "¿en qué quedó esto?". */
  recent?: { date: string; project: string; title: string }[];
  /** Horas comprometidas vigentes, para "¿tengo espacio?". */
  commitments?: {
    id: string;
    title: string;
    project: string;
    start: string;
    end: string;
    hours: number;
  }[];
  /**
   * Cobros y pagos que todavía no se cerraron, para "me pagaron la de Andes".
   * Solo los pendientes: el histórico no hace falta para administrar, y mandarlo
   * sería mandar la contabilidad entera.
   */
  pending?: {
    id: string;
    description: string;
    direction: string;
    amount: number;
    status: string;
    due_date: string;
  }[];
  /** Presupuestos, con su estado: es lo que decide si se pueden editar o no. */
  quotes?: { id: string; number: string; title: string; status: string }[];
  /** Lo que se repite, para "¿cuánto me entra al mes?". */
  recurring?: {
    id: string;
    description: string;
    direction: string;
    amount: number;
    cadence: string;
  }[];
  /**
   * Tres números del año en curso, en moneda base. Un resumen y no el ledger:
   * "¿cuánto llevo cobrado?" se contesta con esto, y mandar cada movimiento
   * sería mandar la contabilidad completa para responder una suma.
   */
  money?: { year: string; received: number; spent: number; receivable: number };
}

/* ---------------------------------------------------------------- pasos --- */

export type StepKind =
  | "project"
  | "task"
  | "log"
  | "entry"
  | "series"
  | "commitment"
  | "quote"
  | "update"
  | "remove"
  | "inbox"
  | "inbox_close";

export interface ProjectStep {
  kind: "project";
  name: string;
  project_kind: string;
  priority: string;
  summary: string;
  next_cue: string;
  next_step: string;
  start_date: string;
  due_date: string;
  client: string;
}

export interface TaskStep {
  kind: "task";
  title: string;
  project: string;
  due_date: string;
  priority: string;
  notes: string;
}

export interface LogStep {
  kind: "log";
  project: string;
  title: string;
  body: string;
  log_kind: string;
  date: string;
}

export interface EntryStep {
  kind: "entry";
  direction: "income" | "expense";
  description: string;
  amount: number;
  currency: string;
  date: string;
  due_date: string;
  status: string;
  project: string;
  entity: string;
  category: string;
}

export interface SeriesStep {
  kind: "series";
  direction: "income" | "expense";
  description: string;
  amount: number;
  currency: string;
  cadence: string;
  start_date: string;
  end_date: string;
  occurrences: number;
  project: string;
  entity: string;
}

export interface CommitmentStep {
  kind: "commitment";
  title: string;
  project: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
}

/** No se pudo clasificar: se guarda en la bandeja, que para eso está. */
export interface InboxStep {
  kind: "inbox";
  text: string;
}

/** Un ítem de la bandeja que este plan resuelve. */
export interface InboxCloseStep {
  kind: "inbox_close";
  id: string;
  outcome: string;
}

/** Un presupuesto en borrador, con sus partidas y entregables. */
export interface QuoteStep {
  kind: "quote";
  title: string;
  client: string;
  project_kind: string;
  description: string;
  currency: string;
  terms: string;
  items: { description: string; unit: string; qty: number; unit_price: number }[];
  deliverables: { name: string; detail: string; lead_days: number }[];
}

/**
 * Cambiar el estado o la planificación de algo que ya existe.
 *
 * Un solo paso para las cinco colecciones, y no cinco pasos parecidos, porque
 * así el permiso vive **en la tabla `EDITABLE`** y no repartido por el
 * validador. Lo que no está en esa tabla no se puede tocar, y eso se lee de un
 * vistazo.
 */
export interface UpdateStep {
  kind: "update";
  target: "projects" | "tasks" | "entries" | "commitments" | "quotes";
  id: string;
  /** Ya filtrados contra `EDITABLE` y validados campo por campo. */
  fields: Record<string, string | number>;
  /** Cómo se lee el cambio en la fila de revisión. */
  label: string;
}

/**
 * Borrar.
 *
 * Es el único paso que **llega apagado** en la pantalla de revisión: aceptar
 * todo de un toque es el modo normal de esta app, y en un plan que borra cosas
 * ese modo normal es exactamente el equivocado. Encenderlo es un acto aparte.
 */
export interface RemoveStep {
  kind: "remove";
  target: string;
  id: string;
  label: string;
}

export type Step =
  | ProjectStep
  | TaskStep
  | LogStep
  | EntryStep
  | SeriesStep
  | CommitmentStep
  | QuoteStep
  | UpdateStep
  | RemoveStep
  | InboxStep
  | InboxCloseStep;

export interface Plan {
  /**
   * Lo que el agente contesta en palabras: el turno de la conversación.
   *
   * Puede venir solo —una pregunta contestada, sin nada que escribir— o
   * acompañando a los pasos. Es lo único que se le pide en prosa, y por eso es
   * lo único que no pasa por una aduana de campos: se recorta y se muestra.
   */
  summary: string;
  steps: Step[];
}

/** Tope de pasos por plan. Un texto que produce más de esto no se revisa: se relee. */
export const MAX_STEPS = 40;

/** Tope del texto que se manda. Más que esto no es un volcado: es un archivo. */
export const MAX_INPUT = 8000;

/**
 * El modelo, decidido acá y en un solo lugar.
 *
 * **No es un ajuste y no se nombra en la interfaz.** Cuál modelo hay detrás es
 * una decisión de ingeniería, no una preferencia: se eligió midiendo, y ponerla
 * en Configuración solo ofrece formas de empeorarla. Para quien usa la app hay
 * "el agente", igual que no hay una pantalla para elegir el motor de la base de
 * datos.
 *
 * Medido con el prompt real y un volcado de ocho cosas, contra opencode Go:
 *
 *   modelo             tiempo   tokens de salida   resultado
 *   deepseek-v4-flash   101 s        13.284        plan completo; el mejor
 *   minimax-m3           44 s         7.046        plan completo
 *   gpt-5.6-luna         13 s         1.143        plan completo
 *
 * Gana el más lento porque es el que entendió mejor: el único que sacó la
 * prioridad de un "eso es urgente". Tarda porque razona antes de contestar, y
 * esos tokens **cuentan contra el mismo techo que la respuesta** — de ahí que
 * `MAX_OUTPUT_TOKENS` en `call.ts` sea tan alto. Con un techo bajo el modelo no
 * parece lento: parece roto, porque devuelve la respuesta cortada y el JSON
 * truncado no parsea.
 *
 * `deepseek-v4-pro` no se usa: razona más, no menos, y ya estamos al filo de lo
 * que alguien espera. `kimi-k2.7-code` y `qwen3.7-plus` devolvieron error del
 * proveedor; `glm-5.2` se cortó.
 */
export const ASSISTANT_MODEL = "deepseek-v4-flash";

/** Lo que se avisa que va a tardar, en segundos. Sale de la tabla de arriba. */
export const EXPECTED_SECONDS = 100;

/**
 * Lo que devuelve el servidor.
 *
 * El error viaja como texto en español y no como código: esta app no tiene
 * pantalla de errores, tiene una línea bajo el botón.
 *
 * No devuelve el JSON crudo del modelo. Lo devolvía cuando la corrección era una
 * ronda aparte —"acá está tu plan, reescríbelo"— y ya no hace falta: el plan
 * queda guardado en su turno de la conversación, y de ahí sale lo que se le
 * recuerda en el turno siguiente. Guardar la versión sin pasar por la aduana solo
 * habría dado una segunda copia, la sucia, de lo mismo.
 */
export type ProposeResult = { ok: true; plan: Plan } | { ok: false; error: string };

/** Cadencias válidas de una recurrencia. Espeja `lib/local/recurring.ts`. */
const CADENCES = [
  "weekly",
  "biweekly",
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "annual",
];

/** Estados con que puede **nacer** un movimiento. `paid` no: un cobro futuro no está pagado. */
const ENTRY_STATUS = ["planned", "committed", "invoiced"];

/* ------------------------------------------------------------ permisos ----- */

/**
 * Lo que el agente puede cambiar de un registro que ya existe.
 *
 * **Esta tabla es la política de permisos completa.** Está en un solo lugar a
 * propósito: repartida por veinte ramas del validador sería imposible responder
 * "¿qué puede tocar?" sin leer el archivo entero, y esa pregunta hay que poder
 * contestarla de un vistazo.
 *
 * La regla que la ordena: **puede cambiar el estado y la planificación; no
 * puede reescribir el texto que escribiste tú.** Cerrar una tarea, mover un
 * plazo, marcar un cobro como pagado o actualizar el «cuando… entonces» son
 * datos de gestión — si se equivoca se ve y se arregla en dos segundos. En
 * cambio la bitácora de esta app es append-only por diseño, y un agente que
 * reescribe lo que anotaste destruye justo aquello para lo que existe: saber qué
 * pasó de verdad. Por eso no aparecen acá `summary`, `notes`, `body` ni
 * `purpose`.
 *
 * Los presupuestos son la excepción con excepción: se les puede editar el texto,
 * pero **solo mientras son borrador** (ver `draftQuotes`). Un presupuesto
 * enviado es una promesa hecha en una fecha y el papel que el cliente tiene en
 * la mano no puede cambiar porque el agente ajustó una palabra.
 */
const EDITABLE: Record<string, string[]> = {
  projects: ["status", "priority", "health", "start_date", "due_date", "next_cue", "next_step"],
  tasks: ["status", "due_date", "priority"],
  entries: ["status", "due_date", "paid_date"],
  commitments: ["status", "hours_per_week", "start_date", "end_date"],
  quotes: ["status", "title", "description", "kind", "date", "valid_until", "terms"],
};

/** Los estados válidos de cada colección. Un estado inventado deja el registro inalcanzable. */
const STATUSES: Record<string, string[]> = {
  projects: ["idea", "active", "paused", "waiting", "done", "archived"],
  tasks: ["todo", "doing", "blocked", "done"],
  // Acá sí entra `paid`: marcar pagado es un hecho que le cuentas tú.
  entries: ["planned", "committed", "invoiced", "paid", "cancelled"],
  commitments: ["tentative", "confirmed", "done", "cancelled"],
  quotes: ["draft", "pending", "approved", "rejected"],
};

/** Qué se puede borrar. Nada que sea histórico: la bitácora y los movimientos no están. */
const REMOVABLE = ["projects", "tasks", "entries", "entry_series", "commitments", "quotes", "inbox"];

/** Los campos que son fechas, para validarlos como tales y no como texto. */
const DATE_FIELDS = new Set([
  "start_date",
  "due_date",
  "end_date",
  "paid_date",
  "date",
  "valid_until",
]);

/** Los que son números. */
const NUMBER_FIELDS = new Set(["hours_per_week"]);

/** Cuánto texto admite cada campo libre. Solo los hay en presupuestos borrador. */
const TEXT_CAPS: Record<string, number> = {
  title: 200,
  description: 2000,
  terms: 1000,
  next_cue: 200,
  next_step: 200,
};

/* --------------------------------------------------------------- aduana --- */

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/**
 * Una fecha, o nada.
 *
 * Exige la forma exacta y que el calendario la acepte —"2026-02-31" pasa el
 * regex y no existe— y la encierra en una ventana razonable. Un modelo que
 * duda escribe "el viernes" o "2026-13-01"; las dos cosas tienen que salir de
 * acá como cadena vacía y no como una fecha cualquiera.
 */
function date(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";

  const [y, m, d] = raw.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) return "";
  if (y < 2000 || y > new Date().getUTCFullYear() + 10) return "";

  return raw;
}

function amount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return 0;
  return Math.round(n * 100) / 100;
}

function count(value: unknown, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), max);
}

/** Un valor del vocabulario de la cuenta, o el primero como red de seguridad. */
function pick(value: unknown, allowed: string[], fallback: string): string {
  const raw = text(value, 40);
  return allowed.includes(raw) ? raw : fallback;
}

/**
 * Ingreso o egreso, y **nunca a la suerte**.
 *
 * Esto se aprendió con el modelo en la mano: pedido "income" o "expense",
 * `deepseek-v4-flash` devolvió `"in"` y `"out"`. La versión anterior de esta
 * función mandaba a `income` todo lo que no fuera exactamente `"expense"`, así
 * que el arriendo entraba al ledger **como un ingreso** — un error de signo,
 * silencioso, en la única parte de la app donde los números tienen que cuadrar
 * con la realidad.
 *
 * Ahora se traducen las formas conocidas y lo que no se reconoce devuelve
 * vacío, que hace caer el paso a la bandeja. Adivinar la dirección de la plata
 * es exactamente lo que esta app no debe hacer.
 */
const DIRECTIONS: Record<string, "income" | "expense"> = {
  income: "income",
  expense: "expense",
  in: "income",
  out: "expense",
  ingreso: "income",
  egreso: "expense",
  gasto: "expense",
  entrada: "income",
  salida: "expense",
  cobro: "income",
  pago: "expense",
};

function direction(value: unknown): "income" | "expense" | "" {
  return DIRECTIONS[text(value, 20).toLowerCase()] || "";
}

/**
 * Un paso que no pasó la aduana, convertido en algo que la persona igual ve.
 *
 * Descartarlo en silencio sería el peor final posible: el texto decía algo, la
 * pantalla dice "listo", y eso no quedó en ninguna parte. La bandeja existe
 * justamente para lo que no se sabe dónde va, así que ahí cae — con el motivo
 * escrito, para que se entienda por qué no se convirtió en lo que prometía.
 */
function salvage(s: Record<string, unknown>, why: string): InboxStep | null {
  const label =
    text(s.description, 200) ||
    text(s.title, 200) ||
    text(s.name, 200) ||
    text(s.text, 200) ||
    text(s.body, 200);

  if (!label) return null;
  return { kind: "inbox", text: `${label} — ${why}`.slice(0, 500) };
}

/** Una relación: solo pasa si el id existe de verdad en esta cuenta. */
function ref(value: unknown, known: Set<string>): string {
  const raw = text(value, 20);
  return known.has(raw) ? raw : "";
}

/**
 * La referencia a un proyecto, que admite tres formas.
 *
 * O es el id de uno que ya existe, o es el nombre exacto de un proyecto que este
 * mismo plan está creando —el modelo no puede conocer un id que todavía no se ha
 * generado—, o es el **nombre exacto de uno que ya existe**, que se traduce a su
 * id acá mismo.
 *
 * La tercera se agregó viéndolo fallar en vivo. El prompt pide el id para lo que
 * existe y el nombre para lo que nace, y el modelo mezcló las dos reglas: mandó
 * "Galerías de Drenaje" para un proyecto que sí estaba en el contexto. La aduana
 * hizo lo suyo —descartó la referencia— y el resultado fue una bitácora
 * rescatada a la bandeja y una tarea sin proyecto, o sea el trabajo bien hecho
 * produciendo el peor resultado disponible. Traducir un nombre que **coincide
 * exacto** con algo de esta cuenta no es creerle nada al modelo: la referencia
 * sigue validándose contra el contexto, solo que por la otra columna.
 *
 * Devuelve siempre un id o el nombre de un proyecto por nacer, nunca el nombre
 * de uno que ya existe: `applyPlan` resuelve lo segundo con los ids que acaba de
 * generar, y un nombre de proyecto viejo no lo encontraría ahí.
 */
function projectRef(
  value: unknown,
  known: Set<string>,
  pending: Set<string>,
  byName: Map<string, string>
): string {
  const raw = text(value, 200);
  if (known.has(raw)) return raw;
  if (pending.has(raw)) return raw;
  return byName.get(raw) || "";
}

/**
 * Un campo de un `update`, validado por lo que **es** y no por cómo se llama.
 *
 * Devuelve `null` cuando el valor no sirve, y `null` significa "este campo no
 * viaja" — no "escribe vacío". La diferencia es toda la función: un `due_date`
 * que el modelo escribió como "el viernes" no parsea, y si eso cayera a cadena
 * vacía **borraría el plazo** del pendiente en vez de dejarlo como estaba. Es el
 * mismo error de siempre en esta app —una fecha que nadie puso— pero al revés y
 * peor, porque desaparecer un plazo no deja rastro que revisar.
 *
 * Vaciar sí se puede, y por eso se distingue: `""` explícito es una orden
 * («quítale la fecha»), un valor ilegible no lo es.
 */
function fieldValue(
  target: string,
  field: string,
  raw: unknown,
  ctx: OrganizeContext
): string | number | null {
  if (field === "status") {
    const value = text(raw, 40);
    return (STATUSES[target] || []).includes(value) ? value : null;
  }

  if (DATE_FIELDS.has(field)) {
    if (raw === "" || raw === null) return "";
    return date(raw) || null;
  }

  if (NUMBER_FIELDS.has(field)) {
    // Cero horas por semana no es un compromiso más chico: es cancelarlo, y eso
    // se dice con `status`.
    const n = count(raw, 80);
    return n || null;
  }

  // Los tres que salen del vocabulario de la cuenta. Un valor inventado deja el
  // registro con una etiqueta que ninguna pantalla sabe mostrar.
  if (field === "priority") {
    const value = text(raw, 40);
    return ctx.priorities.includes(value) ? value : null;
  }
  if (field === "health") {
    const value = text(raw, 40);
    return ctx.healths.includes(value) ? value : null;
  }
  if (field === "kind") {
    const value = text(raw, 40);
    return ctx.projectKinds.includes(value) ? value : null;
  }

  const value = text(raw, TEXT_CAPS[field] ?? 200);
  // Un título vacío deja el registro sin nombre en todas las listas. El resto
  // del texto libre sí se puede vaciar.
  if (!value && field === "title") return null;
  return value;
}

/**
 * Convierte lo que devolvió el modelo en un plan que se puede aplicar.
 *
 * Nunca lanza: un plan roto se convierte en un plan vacío, y un plan vacío es
 * una pantalla que dice "no entendí nada, prueba con más detalle". Que una
 * respuesta malformada tumbe la pantalla sería regalarle el control del flujo
 * al modelo.
 */
export function sanitizePlan(raw: unknown, ctx: OrganizeContext): Plan {
  const source = (raw ?? {}) as Record<string, unknown>;
  const rawSteps = Array.isArray(source.steps) ? source.steps : [];

  const knownProjects = new Set(ctx.projects.map((p) => p.id));
  // Nombre exacto -> id, para el modelo que manda el nombre de un proyecto que ya
  // existe. Ver `projectRef`. El primero gana: con dos proyectos del mismo nombre
  // no hay elección correcta, y elegir el más nuevo sería igual de arbitrario con
  // menos aviso.
  const projectByName = new Map<string, string>();
  for (const p of ctx.projects) if (!projectByName.has(p.name)) projectByName.set(p.name, p.id);
  const knownEntities = new Set(ctx.entities.map((e) => e.id));
  const knownCategories = new Set(ctx.categories.map((c) => c.id));
  const knownAccounts = new Set(ctx.accounts.map((a) => a.id));
  const knownInbox = new Set(ctx.inbox.map((i) => i.id));

  /*
   * Los ids que el agente puede tocar, por colección.
   *
   * Es la otra mitad de `EDITABLE`: esa tabla dice qué campos, esta dice qué
   * registros. Y sale del **contexto que se le mandó**, no de la base: lo que el
   * agente no alcanzó a ver no puede modificar ni borrar, así que un id
   * alucinado —o el de otra cuenta, o el de un proyecto archivado que no viajó—
   * simplemente no existe para él.
   */
  const knownIds: Record<string, Set<string>> = {
    projects: knownProjects,
    tasks: new Set((ctx.tasks || []).map((t) => t.id)),
    entries: new Set((ctx.pending || []).map((e) => e.id)),
    entry_series: new Set((ctx.recurring || []).map((r) => r.id)),
    commitments: new Set((ctx.commitments || []).map((c) => c.id)),
    quotes: new Set((ctx.quotes || []).map((q) => q.id)),
    inbox: knownInbox,
  };

  /** Los presupuestos que todavía son borrador; ver `EDITABLE`. */
  const draftQuotes = new Set(
    (ctx.quotes || []).filter((q) => q.status === "draft").map((q) => q.id)
  );

  // Los proyectos que el propio plan crea, para que lo que venga detrás pueda
  // colgarse de ellos por nombre.
  const pending = new Set<string>();
  for (const item of rawSteps) {
    const s = (item ?? {}) as Record<string, unknown>;
    if (s.kind === "project") {
      const name = text(s.name, 200);
      if (name) pending.add(name);
    }
  }

  const steps: Step[] = [];

  for (const item of rawSteps) {
    if (steps.length >= MAX_STEPS) break;
    const s = (item ?? {}) as Record<string, unknown>;

    switch (s.kind) {
      case "project": {
        const name = text(s.name, 200);
        if (!name) break;
        steps.push({
          kind: "project",
          name,
          project_kind: pick(s.project_kind, ctx.projectKinds, ctx.projectKinds[0] || "personal"),
          priority: pick(s.priority, ctx.priorities, "normal"),
          summary: text(s.summary, 1000),
          next_cue: text(s.next_cue, 200),
          next_step: text(s.next_step, 200),
          start_date: date(s.start_date),
          due_date: date(s.due_date),
          client: ref(s.client, knownEntities),
        });
        break;
      }

      case "task": {
        const title = text(s.title, 300);
        if (!title) break;
        steps.push({
          kind: "task",
          title,
          project: projectRef(s.project, knownProjects, pending, projectByName),
          due_date: date(s.due_date),
          priority: pick(s.priority, ctx.priorities, "normal"),
          notes: text(s.notes, 1000),
        });
        break;
      }

      case "log": {
        const title = text(s.title, 300);
        const project = projectRef(s.project, knownProjects, pending, projectByName);
        // Una bitácora sin proyecto no se lee en ninguna parte. Es la misma
        // regla que ya aplica el formulario de la bandeja.
        if (!title) break;
        if (!project) {
          const parked = salvage(s, "no quedó claro de qué proyecto es");
          if (parked) steps.push(parked);
          break;
        }
        steps.push({
          kind: "log",
          project,
          title,
          body: text(s.body, 4000),
          log_kind: pick(s.log_kind, ctx.logKinds, "note"),
          date: date(s.date) || ctx.today,
        });
        break;
      }

      case "entry": {
        const description = text(s.description, 300);
        const value = amount(s.amount);
        const way = direction(s.direction);
        if (!description) break;
        if (!value || !way) {
          const parked = salvage(s, !way ? "no se entendió si entra o sale" : "sin monto claro");
          if (parked) steps.push(parked);
          break;
        }
        steps.push({
          kind: "entry",
          direction: way,
          description,
          amount: value,
          currency: text(s.currency, 20) || ctx.currency,
          date: date(s.date) || ctx.today,
          due_date: date(s.due_date),
          status: pick(s.status, ENTRY_STATUS, "planned"),
          project: projectRef(s.project, knownProjects, pending, projectByName),
          entity: ref(s.entity, knownEntities),
          category: ref(s.category, knownCategories),
        });
        break;
      }

      case "series": {
        const description = text(s.description, 300);
        const value = amount(s.amount);
        const start = date(s.start_date);
        const way = direction(s.direction);
        if (!description) break;
        if (!value || !way || !start) {
          // El caso real: "me llega el sueldo el día 30 de cada mes" produce
          // una serie sin fecha de inicio, y una serie sin eso no se puede
          // materializar. A la bandeja, no a la basura.
          const parked = salvage(
            s,
            !start
              ? "falta desde cuándo se repite"
              : !way
                ? "no se entendió si entra o sale"
                : "sin monto claro"
          );
          if (parked) steps.push(parked);
          break;
        }
        steps.push({
          kind: "series",
          direction: way,
          description,
          amount: value,
          currency: text(s.currency, 20) || ctx.currency,
          cadence: pick(s.cadence, CADENCES, "monthly"),
          start_date: start,
          end_date: date(s.end_date),
          occurrences: count(s.occurrences, 400),
          project: projectRef(s.project, knownProjects, pending, projectByName),
          entity: ref(s.entity, knownEntities),
        });
        break;
      }

      case "commitment": {
        const title = text(s.title, 200);
        const end = date(s.end_date);
        // "el ramo me toma 10 horas semanales hasta el 15 de diciembre" trae el
        // final y las horas, no el principio. Empezar hoy no es inventar una
        // fecha: es lo que significa. Y la fila de revisión muestra el tramo
        // completo, así que nadie la ve por primera vez ya escrita.
        const start = date(s.start_date) || (end ? ctx.today : "");
        const hours = count(s.hours_per_week, 80);
        // Sin las dos fechas y sin horas no es un compromiso, es una intención.
        if (!title) break;
        if (!start || !end || !hours || end < start) {
          const parked = salvage(s, "faltan las fechas o las horas por semana");
          if (parked) steps.push(parked);
          break;
        }
        steps.push({
          kind: "commitment",
          title,
          project: projectRef(s.project, knownProjects, pending, projectByName),
          start_date: start,
          end_date: end,
          hours_per_week: hours,
        });
        break;
      }

      case "quote": {
        const title = text(s.title, 200);
        if (!title) break;

        const rawItems = Array.isArray(s.items) ? s.items : [];
        const items = rawItems
          .slice(0, 40)
          .map((raw) => {
            const it = (raw ?? {}) as Record<string, unknown>;
            return {
              description: text(it.description, 300),
              unit: text(it.unit, 20) || "gl",
              qty: amount(it.qty) || 1,
              unit_price: amount(it.unit_price),
            };
          })
          .filter((it) => it.description);

        // Un presupuesto sin partidas no es un presupuesto: es un título. Mejor
        // a la bandeja que un borrador vacío que hay que descubrir y completar.
        if (!items.length) {
          const parked = salvage(s, "el presupuesto llegó sin partidas");
          if (parked) steps.push(parked);
          break;
        }

        const rawDeliverables = Array.isArray(s.deliverables) ? s.deliverables : [];
        steps.push({
          kind: "quote",
          title,
          client: ref(s.client, knownEntities),
          project_kind: pick(s.project_kind, ctx.projectKinds, ctx.projectKinds[0] || "personal"),
          description: text(s.description, 2000),
          currency: text(s.currency, 20) || ctx.currency,
          terms: text(s.terms, 1000),
          items,
          deliverables: rawDeliverables
            .slice(0, 20)
            .map((raw) => {
              const d = (raw ?? {}) as Record<string, unknown>;
              return {
                name: text(d.name, 200),
                detail: text(d.detail, 500),
                lead_days: count(d.lead_days, 3650),
              };
            })
            .filter((d) => d.name),
        });
        break;
      }

      case "update": {
        const target = text(s.target, 20);
        const allowed = EDITABLE[target];
        if (!allowed) break; // colección fuera de la política: no existe para el agente

        const id = ref(s.id, knownIds[target] || new Set());
        if (!id) break;

        // Un presupuesto que ya salió no se toca. Es la única regla de esta
        // tabla que depende del estado del registro y no solo de su colección.
        if (target === "quotes" && !draftQuotes.has(id)) {
          const parked = salvage(s, "ese presupuesto ya no es borrador");
          if (parked) steps.push(parked);
          break;
        }

        // Se recorre `allowed` y no lo que mandó el modelo: así un campo fuera
        // de la política no se descarta después, es que nunca se mira.
        const given = (s.fields ?? {}) as Record<string, unknown>;
        const fields: Record<string, string | number> = {};

        for (const field of allowed) {
          if (!(field in given)) continue;
          const value = fieldValue(target, field, given[field], ctx);
          if (value !== null) fields[field] = value;
        }

        if (!Object.keys(fields).length) break;
        steps.push({
          kind: "update",
          target: target as UpdateStep["target"],
          id,
          fields,
          label: text(s.label, 200),
        });
        break;
      }

      case "remove": {
        const target = text(s.target, 20);
        if (!REMOVABLE.includes(target)) break;
        const id = ref(s.id, knownIds[target] || new Set());
        if (!id) break;
        steps.push({ kind: "remove", target, id, label: text(s.label, 200) });
        break;
      }

      case "inbox": {
        const body = text(s.text, 500);
        if (!body) break;
        steps.push({ kind: "inbox", text: body });
        break;
      }

      case "inbox_close": {
        const id = ref(s.id, knownInbox);
        if (!id) break;
        steps.push({ kind: "inbox_close", id, outcome: text(s.outcome, 200) || "Ordenado" });
        break;
      }

      default:
        break; // un `kind` que no conocemos no se inventa: se ignora
    }
  }

  // Los cuatro accounts del catálogo no se usan todavía en ningún paso; se
  // validan igual para que agregar un campo `account` mañana no se olvide de
  // pasar por la aduana.
  void knownAccounts;

  // `reply` es como lo pide el prompt del agente; `summary` es como lo pedía la
  // versión anterior. Se aceptan los dos: los planes que ya están guardados en
  // la conversación de alguien no tienen por qué volverse ilegibles.
  return { summary: text(source.reply ?? source.summary, 2000), steps };
}

/**
 * El primer objeto JSON balanceado del texto.
 *
 * Los modelos envuelven el JSON en ``` o lo anteceden de una frase amable por
 * mucho que se les pida lo contrario, y `JSON.parse` sobre eso revienta. Se
 * busca la primera llave y se cuenta hasta cerrarla, saltando lo que esté
 * dentro de comillas — si no, una llave dentro de una descripción cierra el
 * objeto antes de tiempo.
 */
export function extractJSON(raw: string): unknown {
  const start = raw.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const c = raw[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }

    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
