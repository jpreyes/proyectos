"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ChatMessage, Entity, InboxItem, Project } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { create, remove, update } from "@/lib/local/mutate";
import { index, sortBy } from "@/lib/local/query";
import { applyPlan, buildContext, historyFor, requestPlan } from "@/lib/local/organize";
import { EXPECTED_SECONDS, MAX_INPUT, type Plan, type Step } from "@/lib/organize/plan";
import { CADENCE } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { Badge, btn, Card, cx, Empty, Group, inputClass, PageHeader, Row } from "@/components/ui";
import { Title } from "@/components/Title";

/**
 * El agente: contesta y propone, y lo segundo nunca lo escribe solo.
 *
 * La forma de esta pantalla es la respuesta a una pregunta: ¿qué pasa si el
 * modelo se equivoca? En una app que es tu índice y tu punto de reentrada, un
 * bot que escribe a tus espaldas no ahorra trabajo — traslada el trabajo a
 * auditar algo que ya está escrito, que es más caro y se hace peor. Así que
 * propone, y aceptas de un toque. Sigue siendo un toque en vez de veinte
 * formularios, que era el punto.
 *
 * Por qué es una conversación y no el cuadro de un solo tiro que fue antes: la
 * corrección era una ronda especial —"acá está tu plan, dime qué está mal"— y en
 * cuanto el agente además **contesta** preguntas, esa ronda especial es
 * simplemente el turno siguiente. Un cuadro que se vacía al enviar convierte
 * cada consulta en la primera, así que "¿y en marzo?" no significaba nada. El
 * hilo vive en la base (`chat`) y no en el estado de esta pantalla: si se
 * perdiera al recargar dejaría de usarse para pensar y volvería a ser un
 * buscador.
 *
 * Lo que **no** vive en la base son los interruptores de cada fila. Son la
 * revisión de un plan que todavía no se aplicó; guardarlos sincronizaría entre
 * dispositivos una decisión a medio tomar, y al aplicar quedaría un registro de
 * apagados sin nada que apagar.
 */
export default function OrganizeRoute() {
  return (
    <Suspense fallback={null}>
      <OrganizePage />
    </Suspense>
  );
}

function OrganizePage() {
  const cfg = useConfig();
  const sp = useSearchParams();
  const rows = useCollection<ChatMessage>("chat");
  const projects = useCollection<Project>("projects");
  const entities = useCollection<Entity>("entities");
  const inbox = useCollection<InboxItem>("inbox");

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [off, setOff] = useState<Record<string, Set<number>>>({});
  const [went, setWent] = useState("");
  const [online, setOnline] = useState(true);

  const messages = useMemo(
    () => sortBy(rows.filter((m) => !m.deleted), "created"),
    [rows]
  );

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const offline = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", offline);
    };
  }, []);

  /**
   * Un contador de segundos mientras espera.
   *
   * El modelo tarda cerca de cien segundos porque razona antes de contestar, y
   * cien segundos de un botón que solo dice "Pensando…" son indistinguibles de
   * una app colgada — que es justo el silencio contra el que esta app tiene una
   * regla escrita. Un número que sube es la señal más barata de que algo pasa.
   */
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [busy]);

  // El hilo crece hacia abajo, así que lo último dicho tiene que quedar a la
  // vista sin que nadie deslice. Se ancla al final y no al mensaje nuevo: en el
  // teléfono el teclado ya se comió media pantalla.
  const foot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    foot.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  /*
   * Se llega desde la bandeja con los ítems ya escritos en el cuadro.
   *
   * Ordenar la bandeja es el caso más común y el más aburrido de hacer a mano.
   * Se escriben en el cuadro y no se envían solos: el agente ya ve la bandeja en
   * su contexto, así que lo que esto hace es dejar la frase a mano para
   * completarla —"esto es del Aula Magna", "el segundo bótalo"— antes de enviar.
   */
  const openItems = useMemo(
    () => sortBy(inbox.filter((i) => !i.deleted && i.status === "open"), "created"),
    [inbox]
  );
  const prefilled = useRef(false);

  useEffect(() => {
    if (prefilled.current || sp.get("bandeja") !== "1" || !openItems.length) return;
    prefilled.current = true;
    setDraft(`Ordena esto:\n${openItems.map((i) => `- ${i.text}`).join("\n")}`);
  }, [sp, openItems]);

  const projectById = useMemo(() => index(projects), [projects]);
  const entityById = useMemo(() => index(entities), [entities]);

  /** El último turno de la persona, para reintentar cuando la respuesta se cayó. */
  const last = messages[messages.length - 1];
  const orphan = last?.role === "user" ? last : null;

  async function send(text: string, existing?: ChatMessage) {
    const body = text.trim().slice(0, MAX_INPUT);
    if (!body || busy) return;

    setBusy(true);
    setError("");
    setWent("");

    // El turno de la persona se escribe **antes** de preguntar, y queda escrito
    // aunque la respuesta se caiga: lo dicho no se pierde por un problema de red.
    // Al reintentar se reusa el que ya está en vez de anotarlo dos veces.
    const previous = existing ? messages.slice(0, -1) : messages;
    if (!existing) {
      await create("chat", { role: "user", text: body, applied: false, result: "" });
      setDraft("");
    }

    try {
      const res = await requestPlan({
        text: body,
        context: buildContext(cfg),
        history: historyFor(previous),
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      // El plan cuelga del turno que lo propuso. Sin eso, un plan de tres tareas
      // es una lista sin la frase que explica por qué son tres.
      //
      // El campo se omite cuando no hay pasos, en vez de escribir un null: una
      // respuesta a una pregunta no tiene plan, y "no tiene" se dice no mandando
      // el campo.
      const turn: Record<string, unknown> = {
        role: "assistant",
        text: res.plan.summary,
        applied: false,
        result: "",
      };
      if (res.plan.steps.length) turn.plan = res.plan;
      await create("chat", turn);
    } catch {
      setError("No se pudo hablar con el servidor. Puede ser la red.");
    } finally {
      setBusy(false);
    }
  }

  async function apply(message: ChatMessage) {
    const plan = message.plan as Plan | null;
    if (!plan || busy) return;

    // `skipped` y no `off[id]`: sin tocar nada, los pasos que borran están
    // apagados, y leer el estado en crudo los habría dado por aceptados — que es
    // exactamente lo que el apagado por omisión venía a evitar.
    const skip = skipped(message);
    const steps = plan.steps.filter((_, i) => !skip.has(i));
    if (!steps.length) return;

    setBusy(true);
    setError("");
    try {
      const result = await applyPlan({ ...plan, steps }, buildContext(cfg));
      // El acuse va en el mensaje y no en un cartel: mañana, al volver a abrir
      // la conversación, es lo que distingue lo que se hizo de lo que quedó sobre
      // la mesa.
      await update("chat", message.id, { applied: true, result: describe(result.counts) });
      setWent(result.href);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string, i: number) {
    setOff((prev) => {
      const next = new Set(defaultOff(prev, id));
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return { ...prev, [id]: next };
    });
  }

  /**
   * Los borrados llegan apagados.
   *
   * Aceptar todo de un toque es el modo normal de esta app, y en un plan que
   * borra cosas ese modo normal es exactamente el equivocado. Se calcula al
   * vuelo desde el plan y no se guarda: es lo que ve quien abre el mensaje.
   */
  function initial(message: ChatMessage): Set<number> {
    const plan = message.plan as Plan | null;
    const set = new Set<number>();
    plan?.steps.forEach((s, i) => {
      if (s.kind === "remove") set.add(i);
    });
    return set;
  }

  function defaultOff(state: Record<string, Set<number>>, id: string): Set<number> {
    if (state[id]) return state[id];
    const message = messages.find((m) => m.id === id);
    return message ? initial(message) : new Set<number>();
  }

  function skipped(message: ChatMessage): Set<number> {
    return off[message.id] || initial(message);
  }

  async function reset() {
    if (!messages.length) return;
    if (!window.confirm(`¿Borrar la conversación? Son ${messages.length} mensajes.`)) return;
    for (const m of messages) await remove("chat", m.id);
    setOff({});
    setWent("");
    setError("");
  }

  /*
   * Acá había un portero: sin `settings.assistant_enabled` esta pantalla era un
   * cartel que decía "está apagado" y un enlace a Configuración. Se fue porque
   * el interruptor no estaba protegiendo nada que la cuenta pudiera decidir —el
   * asistente es parte de la app, con un modelo elegido y una clave puesta en el
   * servidor— y a cambio dejaba la mitad de los accesos invisibles: la bandeja
   * ocultaba su botón de «ordenar de una vez» y este destino llevaba a una
   * pantalla muerta. Lo que el interruptor sí llevaba encima era el aviso de qué
   * sale de esta máquina, y eso no se perdió: vive en Configuración y en el pie
   * de esta pantalla, que es donde se lee sin tener que apagar nada.
   */

  return (
    <>
      <Title>Asistente</Title>
      {/* Las instrucciones van detrás del «?» y no en la pantalla. Puestas
          arriba, servían una vez y después empujaban la conversación hacia abajo
          en cada visita — y esta es una pantalla a la que se vuelve. */}
      <PageHeader
        title="Asistente"
        subtitle="Cuéntale lo que pasó, o pregúntale por lo que tienes anotado."
        action={
          messages.length ? (
            <button type="button" onClick={() => void reset()} className={btn("ghost", "sm")}>
              Empezar de nuevo
            </button>
          ) : undefined
        }
        help={
          <>
            <p>
              Escribe todo junto y sin orden —lo que pasó en una reunión, lo que hay que hacer,
              lo que se cobra— y te propone dónde va cada cosa. También contesta: «¿qué tengo
              esta semana?», «¿cuánto llevo cobrado este año?», «¿me queda espacio en
              septiembre?».
            </p>
            <p>
              Nada se escribe hasta que aprietas «Aplicar», y cada fila se puede apagar. No pone
              fechas que no hayas dicho, no reescribe tu bitácora, y lo que borra llega apagado:
              hay que encenderlo a mano.
            </p>
            <p>
              Es la única parte de la app que manda algo afuera: lo que le escribes y un índice
              de tu cuenta —nombres de proyectos y contactos, títulos de tareas y tres
              totales del año— nunca los cuerpos de tu bitácora, tus notas ni tus movimientos
              uno por uno.
            </p>
          </>
        }
      />

      {messages.map((m) =>
        m.role === "user" ? (
          <Said key={m.id} text={m.text} />
        ) : (
          <Answer
            key={m.id}
            message={m}
            busy={busy}
            skipped={skipped(m)}
            onToggle={(i) => toggle(m.id, i)}
            onApply={() => void apply(m)}
            describeStep={(s) =>
              describeStep(s, projectById, entityById, cfg.settings.default_currency)
            }
          />
        )
      )}

      {/* A dónde ir a ver lo que se acaba de escribir, ofrecido y no impuesto:
          navegar solo sacaría a la persona de la conversación que estaba
          teniendo, y el hilo es justamente donde queda el registro de lo hecho. */}
      {went && (
        <Card className="mb-6">
          <Link href={went} className={btn("subtle", "sm")} onClick={() => setWent("")}>
            Ver lo que se creó
          </Link>
        </Card>
      )}

      {/* Se dice el rango y no un promedio porque el rango es real: medido, un
          turno corto vuelve en unos 17 s y un volcado de ocho cosas se acerca a
          los cien. Prometer el promedio deja la espera larga pareciendo una
          falla, que es justo lo que el contador viene a evitar. */}
      {busy && (
        <p className="mb-6 px-1 text-[13px] leading-relaxed text-muted">
          Van {elapsed} s. Puede tomar desde unos segundos hasta cerca de{" "}
          {EXPECTED_SECONDS} s: razona sobre todo lo que le dijiste antes de contestar. No
          cierres la pantalla.
        </p>
      )}

      {error && (
        <Card className="mb-6">
          <p className="text-[13px] leading-relaxed text-bad">{error}</p>
          {orphan && (
            <button
              type="button"
              disabled={busy || !online}
              onClick={() => void send(orphan.text, orphan)}
              className={`${btn("subtle", "sm")} mt-3`}
            >
              Reintentar
            </button>
          )}
        </Card>
      )}

      {/* ------------------------------------------------------ el cuadro -- */}

      <Card>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_INPUT))}
          rows={4}
          placeholder={
            messages.length
              ? "Sigue contándole, o pregúntale otra cosa."
              : "Reunión con el mandante del Aula Magna: aprobaron el refuerzo con fibra.\n" +
                "Hay que actualizar el modelo antes del 5 de septiembre.\n" +
                "Me llega el sueldo, 1.850.000 el día 30 de cada mes."
          }
          className={`${inputClass} resize-y leading-relaxed`}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[12px] text-faint tabular-nums">
            {draft.length} / {MAX_INPUT}
          </p>
          <button
            type="button"
            disabled={busy || !draft.trim() || !online}
            onClick={() => void send(draft)}
            className={btn("primary")}
          >
            {busy ? "Pensando…" : "Enviar"}
          </button>
        </div>

        {!online && (
          <p className="mt-3 text-[13px] leading-relaxed text-warn">
            Sin señal. Es lo único de esta app que necesita internet — el modelo vive afuera. Lo
            que escribas acá no se pierde: queda en la pantalla.
          </p>
        )}
      </Card>

      <div ref={foot} />

      {/* Una sola línea, y solo la que cambia lo que estás a punto de hacer. Lo
          demás —qué sale de esta máquina, qué no toca— está en el «?» de arriba:
          repetirlo acá era la misma pared de texto dos veces en la misma
          pantalla. */}
      <p className="mt-8 px-1 text-[13px] leading-relaxed text-faint">
        Nada se guarda hasta que aprietas «Aplicar».
      </p>
    </>
  );
}

/* ------------------------------------------------------------ los turnos --- */

/** Lo que dijo la persona. Sangrado al otro lado, que es todo lo que hace falta. */
function Said({ text }: { text: string }) {
  return (
    <div className="mb-4 flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-pill px-4 py-2.5 text-[15px] leading-relaxed text-ink">
        {text}
      </p>
    </div>
  );
}

/**
 * Lo que contestó el agente, y el plan si propuso algo.
 *
 * Las dos cosas van juntas y en ese orden porque la frase es lo que explica la
 * lista. Un plan sin su frase es un montón de filas que hay que interpretar.
 */
function Answer({
  message,
  busy,
  skipped,
  onToggle,
  onApply,
  describeStep,
}: {
  message: ChatMessage;
  busy: boolean;
  skipped: Set<number>;
  onToggle: (i: number) => void;
  onApply: () => void;
  describeStep: (s: Step) => { kind: string; label: string; hint: string };
}) {
  const plan = message.plan as Plan | null;
  const steps = plan?.steps || [];
  const accepted = steps.length - skipped.size;

  return (
    <div className="mb-6">
      {message.text && (
        <p className="mb-3 whitespace-pre-wrap px-1 text-[15px] leading-relaxed text-ink">
          {message.text}
        </p>
      )}

      {steps.length > 0 && (
        <>
          <Group
            title={
              message.applied
                ? "Lo que propuso"
                : `Propone ${steps.length} cosa${steps.length === 1 ? "" : "s"}`
            }
          >
            {steps.map((s, i) => {
              const skip = skipped.has(i);
              const view = describeStep(s);
              const done = message.applied;
              return (
                <Row
                  key={i}
                  onPress={done ? undefined : () => onToggle(i)}
                  chevron={false}
                  icon={done ? "·" : skip ? "○" : "✓"}
                  iconTone={done ? "neutral" : skip ? "neutral" : s.kind === "remove" ? "bad" : "ok"}
                  label={
                    <span className={cx(!done && skip && "text-faint line-through")}>
                      {view.label}
                    </span>
                  }
                  hint={view.hint}
                  badge={
                    <Badge tone={done ? "neutral" : skip ? "neutral" : "accent"}>{view.kind}</Badge>
                  }
                />
              );
            })}
          </Group>

          {message.applied ? (
            <p className="px-1 text-[13px] leading-relaxed text-ok">{message.result}</p>
          ) : (
            <button
              type="button"
              disabled={busy || accepted === 0}
              onClick={onApply}
              className={btn("primary")}
            >
              {accepted === 0 ? "No queda nada encendido" : `Aplicar ${accepted}`}
            </button>
          )}
        </>
      )}

      {/* Una respuesta sin pasos es lo normal cuando le preguntaste algo. No
          lleva ningún aviso: la frase de arriba ya es la respuesta completa. */}
      {!message.text && !steps.length && (
        <Empty>No sacó nada en limpio de eso. Prueba diciendo qué es cada cosa.</Empty>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- rótulos --- */

const KIND_LABEL: Record<Step["kind"], string> = {
  project: "Proyecto",
  task: "Tarea",
  log: "Bitácora",
  entry: "Movimiento",
  series: "Recurrente",
  commitment: "Horas",
  quote: "Presupuesto",
  update: "Cambio",
  remove: "Borrar",
  inbox: "A la bandeja",
  inbox_close: "Resuelto",
};

/** Cómo se lee un campo cambiado. Los mismos rótulos que usa el resto de la UI. */
const FIELD_LABEL: Record<string, string> = {
  status: "estado",
  priority: "prioridad",
  health: "salud",
  start_date: "inicio",
  due_date: "plazo",
  end_date: "término",
  paid_date: "pagado el",
  date: "fecha",
  valid_until: "vigente hasta",
  next_cue: "cuando",
  next_step: "entonces",
  hours_per_week: "h/semana",
  title: "título",
  description: "descripción",
  kind: "tipo",
  terms: "condiciones",
};

/** Qué se está tocando, en palabras. Sale del `target` del paso. */
const TARGET_LABEL: Record<string, string> = {
  projects: "proyecto",
  tasks: "pendiente",
  entries: "movimiento",
  entry_series: "recurrente",
  commitments: "reserva de horas",
  quotes: "presupuesto",
  inbox: "ítem de la bandeja",
};

/**
 * Cómo se lee un paso en la lista de revisión.
 *
 * Se arma acá y no se le pide al modelo: es un dato que ya tenemos, y cada campo
 * que se le pide de más es un campo que puede inventar. Además así el rótulo dice
 * la verdad sobre lo que se va a escribir, no sobre lo que el modelo cree que
 * escribió.
 */
function describeStep(
  s: Step,
  projectById: Map<string, Project>,
  entityById: Map<string, Entity>,
  currency: string
): { kind: string; label: string; hint: string } {
  const kind = KIND_LABEL[s.kind];
  const nameOf = (value: string) => projectById.get(value)?.name || value;
  const signed = (direction: string, amount: number, money: string) =>
    `${direction === "expense" ? "−" : "+"}${
      money === currency ? formatMoney(amount) : `${money} ${amount}`
    }`;

  switch (s.kind) {
    case "project":
      return {
        kind,
        label: s.name,
        hint: [
          s.next_cue && s.next_step ? `Cuando ${s.next_cue.toLowerCase()} → ${s.next_step}` : "",
          s.due_date ? `entrega ${fmtDate(s.due_date)}` : "sin plazo",
          entityById.get(s.client)?.name,
        ]
          .filter(Boolean)
          .join(" · "),
      };

    case "task":
      return {
        kind,
        label: s.title,
        hint: [s.due_date ? fmtDate(s.due_date) : "sin plazo", nameOf(s.project)]
          .filter(Boolean)
          .join(" · "),
      };

    case "log":
      return {
        kind,
        label: s.title,
        hint: [fmtDate(s.date), nameOf(s.project)].filter(Boolean).join(" · "),
      };

    case "entry":
      return {
        kind,
        label: s.description,
        hint: [
          signed(s.direction, s.amount, s.currency),
          fmtDate(s.date),
          nameOf(s.project),
          entityById.get(s.entity)?.name,
        ]
          .filter(Boolean)
          .join(" · "),
      };

    case "series":
      return {
        kind,
        label: s.description,
        hint: [
          CADENCE[s.cadence as keyof typeof CADENCE] || s.cadence,
          signed(s.direction, s.amount, s.currency),
          `desde ${fmtDate(s.start_date)}`,
          s.end_date
            ? `hasta ${fmtDate(s.end_date)}`
            : s.occurrences
              ? `${s.occurrences} cuotas`
              : "",
          nameOf(s.project),
        ]
          .filter(Boolean)
          .join(" · "),
      };

    case "commitment":
      return {
        kind,
        label: s.title,
        hint: `${s.hours_per_week} h/semana · ${fmtDate(s.start_date)} a ${fmtDate(s.end_date)}`,
      };

    case "quote": {
      // El total se calcula acá con las partidas propuestas, sin los porcentajes
      // de la cuenta: son los que se van a aplicar al escribirlo, y adelantarlos
      // en el rótulo sería prometer un número que todavía no existe.
      const direct = s.items.reduce((sum, it) => sum + it.qty * it.unit_price, 0);
      return {
        kind,
        label: s.title,
        hint: [
          `${s.items.length} partida${s.items.length === 1 ? "" : "s"}`,
          `costo directo ${s.currency === currency ? formatMoney(direct) : `${s.currency} ${direct}`}`,
          s.deliverables.length ? `${s.deliverables.length} entregables` : "",
          entityById.get(s.client)?.name,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }

    case "update":
      return {
        kind,
        label: s.label || `Cambiar ${TARGET_LABEL[s.target] || s.target}`,
        hint: Object.entries(s.fields)
          .map(([field, value]) => `${FIELD_LABEL[field] || field}: ${fieldText(field, value)}`)
          .join(" · "),
      };

    case "remove":
      return {
        kind,
        label: s.label || `Borrar ${TARGET_LABEL[s.target] || s.target}`,
        hint: "Llega apagado — enciéndelo si de verdad va",
      };

    case "inbox":
      return { kind, label: s.text, hint: "No supo dónde va — queda por decidir" };

    case "inbox_close":
      return { kind, label: s.outcome, hint: "Sale de la bandeja" };
  }
}

/** El valor de un campo cambiado, legible. Una fecha vacía es una fecha que se quita. */
function fieldText(field: string, value: string | number): string {
  if (typeof value === "number") return String(value);
  if (!value) return "sin nada";
  return /_date$|^date$|^valid_until$/.test(field) ? fmtDate(value) : value;
}

/** "2 proyectos, 5 pendientes y 1 recurrente." */
function describe(counts: Record<string, number>): string {
  const names: Record<string, [string, string]> = {
    projects: ["proyecto", "proyectos"],
    tasks: ["pendiente", "pendientes"],
    log: ["nota de bitácora", "notas de bitácora"],
    entries: ["movimiento", "movimientos"],
    entry_series: ["recurrente", "recurrentes"],
    commitments: ["reserva de horas", "reservas de horas"],
    quotes: ["presupuesto", "presupuestos"],
    updates: ["cambio", "cambios"],
    removed: ["cosa borrada", "cosas borradas"],
    inbox: ["cosa a la bandeja", "cosas a la bandeja"],
    inbox_close: ["ítem resuelto", "ítems resueltos"],
  };

  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${n} ${names[key]?.[n === 1 ? 0 : 1] || key}`);

  if (!parts.length) return "No se escribió nada.";
  if (parts.length === 1) return `Se escribió ${parts[0]}.`;
  return `Se escribieron ${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}.`;
}
