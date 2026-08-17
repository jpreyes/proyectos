import type { OrganizeContext } from "./plan";

/**
 * Lo que se le dice al modelo.
 *
 * Está escrito apretado y eso no es estilo: es la diferencia entre que funcione
 * y que no. Los modelos de razonamiento de este catálogo gastan tokens de
 * pensamiento **contra el mismo techo** que la respuesta, y el techo acá lo pone
 * Cloudflare, que corta a los 100 segundos. Un prompt de cinco kilobytes deja al
 * modelo pensando hasta que se acaba el presupuesto y devuelve la respuesta
 * cortada — medido: con la versión larga de esto, `deepseek-v4-flash` consumía
 * 8000 tokens y entregaba el contenido vacío.
 *
 * Dos cosas van repetidas de todas formas, porque son las que salen caras:
 *
 *  1. **Que no invente fechas.** El error caro no es equivocarse de tipo de
 *     proyecto —eso se ve y se corrige en dos segundos— sino poner un plazo que
 *     nadie dijo: se ve correcto en la pantalla de revisión y se descubre el día
 *     que no llegaste.
 *  2. **Que "income"/"expense" vayan literales.** Medido también: pedido así,
 *     `deepseek-v4-flash` devolvía `"in"` y `"out"`, y un egreso mal leído entra
 *     al ledger con el signo al revés.
 */
export function systemPrompt(ctx: OrganizeContext): string {
  return `Convierte el texto del usuario en un PLAN de registros para su app de
gestión de proyectos. No conversas ni aconsejas: devuelves JSON.

Forma: {"summary":"una línea en español","steps":[...]}

Pasos (campos omitidos = ""):
- {"kind":"project","name","project_kind","priority","summary","next_cue","next_step","start_date","due_date","client"}
  next_cue+next_step son un plan si-entonces: cuándo o ante qué ("Cuando llegue
  el informe", "Cada lunes a las 9:00") y qué se hace entonces. Dos campos.
- {"kind":"task","title","project","due_date","priority"}
- {"kind":"log","project","title","body","log_kind","date"} — algo que YA pasó.
  Exige project; sin él usa inbox.
- {"kind":"entry","direction","description","amount","currency","date","due_date","status","project","entity","category"}
  Plata, una vez. status: planned | committed | invoiced. Nunca "pagado".
  due_date: si dicen un plazo relativo ("vence a 30 días"), súmalo a "date".
- {"kind":"series","direction","description","amount","cadence","start_date","end_date","occurrences","project","entity"}
  Plata que SE REPITE: sueldo, arriendo, cuota, encargo cobrado por mes.
  cadence: weekly | biweekly | monthly | bimonthly | quarterly | semiannual | annual.
  start_date obligatorio. Si dan el día del mes y no la fecha ("me pagan el 30"),
  calcula la próxima vez que cae ese día contando desde hoy: es aritmética, no
  invención. Sin día ni fecha, usa inbox.
- {"kind":"commitment","title","project","start_date","end_date","hours_per_week"}
  Horas por semana entre dos fechas. La unidad del calendario de esta app no es
  el bloque con hora, es la carga semanal. Solo si hay dedicación sostenida.
- {"kind":"inbox","text"} — no supiste dónde va. Es la salida correcta, no un fallo.
- {"kind":"inbox_close","id","outcome"} — un ítem de la bandeja que este plan resuelve.

Reglas:
1. NUNCA INVENTES UNA FECHA. Si el texto no dice cuándo, deja "". "pronto" o
   "esta semana" no son fechas. Formato YYYY-MM-DD.
2. "direction" es literalmente "income" (recibe) o "expense" (paga). NO uses
   "in", "out", "ingreso" ni "egreso": se descartan.
3. Ante la duda, inbox. Mejor un ítem por decidir que algo colgado del proyecto
   equivocado.
4. Usa solo los ids del contexto, tal cual. Para colgar algo de un proyecto que
   creas en este mismo plan, pon en "project" su "name" exacto.
5. Texto visible, en español. No dupliques lo que ya existe en el contexto.
6. Un texto corto da pocos pasos. No rellenes.
7. Piensa poco y responde ya. SOLO el objeto JSON, sin \`\`\` y sin explicaciones.

Hoy: ${ctx.today}. Moneda base: ${ctx.currency}.
${contextBlock(ctx)}`;
}

/**
 * El contexto, recortado.
 *
 * Va como JSON y no en prosa porque lo que el modelo tiene que hacer con esto es
 * copiar ids exactos, y la prosa invita a parafrasearlos. Los topes existen para
 * que una cuenta con doscientos proyectos no convierta cada consulta en una
 * respuesta cortada.
 */
function contextBlock(ctx: OrganizeContext): string {
  const data = {
    projects: ctx.projects.slice(0, 120),
    entities: ctx.entities.slice(0, 120),
    categories: ctx.categories.slice(0, 60),
    project_kinds: ctx.projectKinds,
    priorities: ctx.priorities,
    log_kinds: ctx.logKinds,
    inbox: ctx.inbox.slice(0, 50),
  };

  return JSON.stringify(data);
}

/** El mensaje de corrección, cuando la persona ajusta un plan ya propuesto. */
export function correctionPrompt(previous: string, correction: string): string {
  return `Tu plan anterior:
${previous}

La persona lo corrige:
${correction}

Devuelve el plan COMPLETO y corregido, misma forma JSON. Lo que no se corrigió
va igual que antes.`;
}
