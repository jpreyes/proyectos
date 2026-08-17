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
 * muestra en "Pendientes sin fecha"— y es mucho mejor que una tarea colgada de
 * un proyecto inventado.
 *
 * El caso que esto evita no es teórico. Una fecha alucinada no se descubre al
 * revisarla: se descubre el día que no llegaste.
 */

/* ------------------------------------------------------------- contexto --- */

/**
 * Lo que el asistente alcanza a ver de tu cuenta.
 *
 * Es un **índice, no el contenido**: nombres e ids de proyectos, contrapartes y
 * catálogo. No van los cuerpos de la bitácora, ni las notas, ni los montos, ni
 * las rutas de los recursos. Alcanza de sobra para que enganche una tarea al
 * proyecto correcto, y es lo mínimo que hay que mandarle a un tercero.
 */
export interface OrganizeContext {
  today: string;
  currency: string;
  projects: { id: string; name: string; status: string }[];
  entities: { id: string; name: string }[];
  categories: { id: string; name: string; direction: string }[];
  accounts: { id: string; name: string }[];
  projectKinds: string[];
  priorities: string[];
  logKinds: string[];
  /** Ítems abiertos de la bandeja, cuando se está ordenando justamente eso. */
  inbox: { id: string; text: string }[];
}

/* ---------------------------------------------------------------- pasos --- */

export type StepKind =
  | "project"
  | "task"
  | "log"
  | "entry"
  | "series"
  | "commitment"
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

export type Step =
  | ProjectStep
  | TaskStep
  | LogStep
  | EntryStep
  | SeriesStep
  | CommitmentStep
  | InboxStep
  | InboxCloseStep;

export interface Plan {
  /** Una línea sobre lo que entendió. Es lo único que se le pide en prosa. */
  summary: string;
  steps: Step[];
}

/** Tope de pasos por plan. Un texto que produce más de esto no se revisa: se relee. */
export const MAX_STEPS = 40;

/** Tope del texto que se manda. Más que esto no es un volcado: es un archivo. */
export const MAX_INPUT = 8000;

/**
 * Los modelos que la cuenta puede elegir.
 *
 * Es una lista blanca y no un campo libre porque el id del modelo viaja desde
 * el navegador: sin esto, cualquiera con la sesión abierta podría pedir el
 * modelo más caro del catálogo y la cuenta paga. El servidor valida contra esta
 * misma lista.
 *
 * El orden y la elección salen de medirlos con el prompt real y un volcado de
 * ocho cosas, contra opencode Go:
 *
 *   gpt-5.6-luna       13 s   1143 tokens   plan completo y correcto
 *   minimax-m3         44 s   7046 tokens   plan completo y correcto
 *   deepseek-v4-flash  80 s   9000 tokens   CONTENIDO VACÍO
 *
 * DeepSeek se queda porque fue el que se pidió y porque esto puede cambiar del
 * lado del proveedor, pero va rotulado con lo que hace hoy: es un modelo de
 * razonamiento cuyo pensamiento cuenta contra el mismo techo que la respuesta, y
 * agota el presupuesto antes de escribir una sola llave. No es cuestión de
 * subirle el techo: arriba está Cloudflare, que corta la petición a los 100
 * segundos. `deepseek-v4-pro` no se ofrece porque razona más, no menos.
 */
export const ASSISTANT_MODELS = [
  { value: "gpt-5.6-luna", label: "GPT 5.6 Luna — rápido y probado (recomendado)" },
  { value: "minimax-m3", label: "MiniMax M3 — también sirve, tarda tres veces más" },
  {
    value: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash — razona tanto que hoy no alcanza a contestar",
  },
] as const;

export const DEFAULT_ASSISTANT_MODEL = "gpt-5.6-luna";

/**
 * Lo que devuelve el servidor.
 *
 * El error viaja como texto en español y no como código: esta app no tiene
 * pantalla de errores, tiene una línea bajo el botón. `raw` es el JSON tal como
 * lo escribió el modelo, que hace falta para la ronda de corrección — se le
 * devuelve su propio plan para que lo reescriba entero.
 */
export type ProposeResult =
  | { ok: true; plan: Plan; raw: string }
  | { ok: false; error: string };

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

/** Estados con que puede nacer un movimiento. `paid` no: eso lo dices tú. */
const ENTRY_STATUS = ["planned", "committed", "invoiced"];

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
 * La referencia a un proyecto, que admite dos formas.
 *
 * O es el id de uno que ya existe, o es el nombre exacto de un proyecto que
 * este mismo plan está creando —el modelo no puede conocer un id que todavía no
 * se ha generado—. Cualquier otra cosa se cae, y el paso queda sin proyecto en
 * vez de colgado de uno inventado.
 */
function projectRef(value: unknown, known: Set<string>, pending: Set<string>): string {
  const raw = text(value, 200);
  if (known.has(raw)) return raw;
  if (pending.has(raw)) return raw;
  return "";
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
  const knownEntities = new Set(ctx.entities.map((e) => e.id));
  const knownCategories = new Set(ctx.categories.map((c) => c.id));
  const knownAccounts = new Set(ctx.accounts.map((a) => a.id));
  const knownInbox = new Set(ctx.inbox.map((i) => i.id));

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
          project: projectRef(s.project, knownProjects, pending),
          due_date: date(s.due_date),
          priority: pick(s.priority, ctx.priorities, "normal"),
          notes: text(s.notes, 1000),
        });
        break;
      }

      case "log": {
        const title = text(s.title, 300);
        const project = projectRef(s.project, knownProjects, pending);
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
          project: projectRef(s.project, knownProjects, pending),
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
          project: projectRef(s.project, knownProjects, pending),
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
          project: projectRef(s.project, knownProjects, pending),
          start_date: start,
          end_date: end,
          hours_per_week: hours,
        });
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

  return { summary: text(source.summary, 300), steps };
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
