"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Entity, InboxItem, Project } from "@/lib/types";
import { useConfig } from "@/lib/local/config";
import { useCollection } from "@/lib/local/store";
import { index, sortBy } from "@/lib/local/query";
import { applyPlan, buildContext, requestPlan } from "@/lib/local/organize";
import {
  DEFAULT_ASSISTANT_MODEL,
  expectedSeconds,
  MAX_INPUT,
  type Plan,
  type Step,
} from "@/lib/organize/plan";
import { CADENCE } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { Badge, btn, Card, cx, Empty, Group, inputClass, PageHeader, Row } from "@/components/ui";
import { Title } from "@/components/Title";

export default function OrganizeRoute() {
  return (
    <Suspense fallback={null}>
      <OrganizePage />
    </Suspense>
  );
}

/**
 * El asistente que ordena.
 *
 * La forma de esta pantalla es la respuesta a una pregunta: ¿qué pasa si el
 * modelo se equivoca? En una app que es tu índice y tu punto de reentrada, un
 * bot que escribe solo no ahorra trabajo — traslada el trabajo a revisar algo
 * que ya está escrito, que es más caro y se hace peor. Así que propone, y
 * aceptas de un toque. Sigue siendo un toque en vez de veinte formularios, que
 * era el punto.
 *
 * Por eso también cada fila se puede apagar: el modo normal es aceptar todo, y
 * la fila que no convence se saca sin tener que descartar el plan entero.
 */
function OrganizePage() {
  const cfg = useConfig();
  const router = useRouter();
  const sp = useSearchParams();

  const fromInbox = sp.get("bandeja") === "1";
  const projects = useCollection<Project>("projects");
  const entities = useCollection<Entity>("entities");
  const inbox = useCollection<InboxItem>("inbox");

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [raw, setRaw] = useState("");
  const [off, setOff] = useState<Set<number>>(new Set());
  const [correction, setCorrection] = useState("");
  const [done, setDone] = useState<Record<string, number> | null>(null);
  const [online, setOnline] = useState(true);

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

  // Ordenar la bandeja es el caso más común y el más aburrido de hacer a mano,
  // así que se llega acá con los ítems ya escritos y no con una hoja en blanco.
  const openItems = useMemo(
    () => sortBy(inbox.filter((i) => i.status === "open"), "created"),
    [inbox]
  );

  useEffect(() => {
    if (!fromInbox || text || plan) return;
    setText(openItems.map((i) => `- ${i.text}`).join("\n"));
  }, [fromInbox, openItems, text, plan]);

  /**
   * Un contador de segundos mientras espera.
   *
   * Con `deepseek-v4-flash` la espera son cien segundos, y cien segundos de un
   * botón que solo dice "Leyendo…" son indistinguibles de una app colgada — que
   * es justo el silencio contra el que esta app tiene una regla escrita. Un
   * número que sube es la señal más barata de que algo está pasando.
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

  const enabled = cfg.settings.assistant_enabled;
  const wait = `${expectedSeconds(cfg.settings.assistant_model)} s`;
  const projectById = useMemo(() => index(projects), [projects]);
  const entityById = useMemo(() => index(entities), [entities]);

  async function propose(isCorrection: boolean) {
    setBusy(true);
    setError("");
    try {
      const ctx = buildContext(cfg, fromInbox);
      const res = await requestPlan({
        text,
        context: ctx,
        model: cfg.settings.assistant_model || DEFAULT_ASSISTANT_MODEL,
        previous: isCorrection ? raw : undefined,
        correction: isCorrection ? correction : undefined,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      setPlan(res.plan);
      setRaw(res.raw);
      setOff(new Set());
      setCorrection("");
    } catch {
      setError("No se pudo hablar con el servidor. Puede ser la red.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    try {
      const accepted = { ...plan, steps: plan.steps.filter((_, i) => !off.has(i)) };
      const result = await applyPlan(accepted, buildContext(cfg, fromInbox));
      setDone(result.counts);
      setPlan(null);
      setText("");
      if (result.href) router.push(result.href);
    } finally {
      setBusy(false);
    }
  }

  function toggle(i: number) {
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const accepted = plan ? plan.steps.length - off.size : 0;

  /* ------------------------------------------------------------ apagado -- */

  if (!enabled) {
    return (
      <>
        <Title>Ordenar</Title>
        <PageHeader
          title="Ordenar"
          subtitle="Un asistente que convierte un texto desordenado en proyectos, pendientes, bitácora y plata."
        />
        <Card title="Está apagado">
          <p className="text-[15px] leading-relaxed text-muted">
            Para usarlo, el texto que escribas y un índice de tu cuenta —los nombres de tus
            proyectos y contrapartes, no sus contenidos ni los montos— salen de este servidor
            hacia el proveedor del modelo. Es la única parte de esta app que hace eso, así que
            se enciende a mano.
          </p>
          <Link href="/configuracion" className={`${btn("primary")} mt-4`}>
            Encenderlo en Configuración
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <Title>Ordenar</Title>
      <PageHeader
        title="Ordenar"
        subtitle={
          fromInbox
            ? `${openItems.length} cosa${openItems.length === 1 ? "" : "s"} de la bandeja`
            : "Escribe todo junto y sin orden. El asistente propone dónde va cada cosa."
        }
      />

      {/* Lo aplicado se muestra arriba y una sola vez: no es un historial, es
          el acuse de recibo de lo que se acaba de escribir. */}
      {done && (
        <Card className="mb-6" title="Listo">
          <p className="text-[15px] text-muted">{describe(done)}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/" className={btn("subtle", "sm")}>
              Ver Hoy
            </Link>
            <button type="button" onClick={() => setDone(null)} className={btn("ghost", "sm")}>
              Ordenar otra cosa
            </button>
          </div>
        </Card>
      )}

      {!plan && !done && (
        <Card>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_INPUT))}
            rows={10}
            placeholder={
              "Reunión con el mandante del Aula Magna: aprobaron el refuerzo con fibra.\n" +
              "Hay que actualizar el modelo antes del 5 de septiembre y cotizar los testigos.\n" +
              "Me llega el sueldo de la universidad, 1.850.000 el día 30 de cada mes.\n" +
              "El arriendo de la oficina son 420.000 mensuales."
            }
            className={`${inputClass} resize-y leading-relaxed`}
          />
          <p className="mt-2 text-right text-[12px] text-faint tabular-nums">
            {text.length} / {MAX_INPUT}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !text.trim() || !online}
              onClick={() => void propose(false)}
              className={`${btn("primary")} flex-1`}
            >
              {busy ? "Leyendo…" : "Ordenar"}
            </button>
          </div>

          {/* Se dice cuánto tarda porque tarda: el modelo razona antes de
              contestar y un volcado corriente toma cerca de un minuto. Un botón
              que se queda "Leyendo…" sin avisar se lee como app colgada, y esta
              app tiene una regla sobre eso. */}
          {busy && (
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Van {elapsed} s. Este modelo suele tardar unos {wait}: razona sobre todo el texto
              antes de proponer. No cierres la pantalla.
            </p>
          )}

          {!online && (
            <p className="mt-3 text-[13px] leading-relaxed text-warn">
              Sin señal. Es lo único de esta app que necesita internet — el modelo vive afuera.
              Lo que escribas acá no se pierde: queda en la pantalla.
            </p>
          )}
          {error && <p className="mt-3 text-[13px] leading-relaxed text-bad">{error}</p>}
        </Card>
      )}

      {/* ------------------------------------------------------- el plan -- */}

      {plan && (
        <>
          {plan.summary && (
            <Card className="mb-4" title="Lo que entendió">
              <p className="text-[15px] leading-relaxed text-muted">{plan.summary}</p>
            </Card>
          )}

          <Group title={`Propone ${plan.steps.length} cosa${plan.steps.length === 1 ? "" : "s"}`}>
            {plan.steps.length === 0 ? (
              <Empty>
                No sacó nada en limpio de ese texto. Suele pasar con notas muy telegráficas:
                prueba diciendo qué es cada cosa.
              </Empty>
            ) : (
              plan.steps.map((s, i) => {
                const skip = off.has(i);
                const view = describeStep(s, projectById, entityById, cfg.settings.default_currency);
                return (
                  <Row
                    key={i}
                    onPress={() => toggle(i)}
                    chevron={false}
                    icon={skip ? "○" : "✓"}
                    iconTone={skip ? "neutral" : "ok"}
                    label={<span className={cx(skip && "text-faint line-through")}>{view.label}</span>}
                    hint={view.hint}
                    badge={<Badge tone={skip ? "neutral" : "accent"}>{view.kind}</Badge>}
                  />
                );
              })
            )}
          </Group>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || accepted === 0}
              onClick={() => void apply()}
              className={`${btn("primary")} flex-1`}
            >
              {busy ? "Guardando…" : `Aplicar ${accepted}`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPlan(null);
                setError("");
              }}
              className={btn("ghost")}
            >
              Descartar
            </button>
          </div>

          {/* La corrección en palabras es lo que lo hace conversación y no
              formulario: "las clases son los martes" arregla cinco filas de una
              vez, y editarlas a mano una por una sería justo el trabajo que
              esta pantalla venía a evitar. */}
          <Card className="mt-6" title="¿Le falta algo?">
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value.slice(0, 2000))}
              rows={2}
              placeholder="Las clases son los martes, no los lunes. Y el arriendo lo pago yo, es un egreso."
              className={`${inputClass} resize-y`}
            />
            <button
              type="button"
              disabled={busy || !correction.trim() || !online}
              onClick={() => void propose(true)}
              className={`${btn("subtle")} mt-3`}
            >
              {busy ? "Leyendo…" : "Rehacer el plan"}
            </button>
            {error && <p className="mt-3 text-[13px] leading-relaxed text-bad">{error}</p>}
          </Card>
        </>
      )}

      <p className="mt-8 px-1 text-[13px] leading-relaxed text-faint">
        Nada se guarda hasta que aprietas «Aplicar». El asistente nunca marca algo como pagado ni
        pone una fecha que no hayas escrito: si el texto no dice cuándo, la fila llega sin plazo.
      </p>
    </>
  );
}

/* -------------------------------------------------------------- rótulos --- */

const KIND_LABEL: Record<Step["kind"], string> = {
  project: "Proyecto",
  task: "Pendiente",
  log: "Bitácora",
  entry: "Movimiento",
  series: "Recurrente",
  commitment: "Horas",
  inbox: "A la bandeja",
  inbox_close: "Resuelto",
};

/**
 * Cómo se lee un paso en la lista de revisión.
 *
 * Se arma acá y no se le pide al modelo: es un dato que ya tenemos, y cada
 * campo que se le pide de más es un campo que puede inventar. Además así el
 * rótulo dice la verdad sobre lo que se va a escribir, no sobre lo que el
 * modelo cree que escribió.
 */
function describeStep(
  s: Step,
  projectById: Map<string, Project>,
  entityById: Map<string, Entity>,
  currency: string
): { kind: string; label: string; hint: string } {
  const kind = KIND_LABEL[s.kind];
  const nameOf = (value: string) => projectById.get(value)?.name || value;

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
      return { kind, label: s.title, hint: [fmtDate(s.date), nameOf(s.project)].filter(Boolean).join(" · ") };

    case "entry":
      return {
        kind,
        label: s.description,
        hint: [
          `${s.direction === "expense" ? "−" : "+"}${
            s.currency === currency ? formatMoney(s.amount) : `${s.currency} ${s.amount}`
          }`,
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
          `${s.direction === "expense" ? "−" : "+"}${
            s.currency === currency ? formatMoney(s.amount) : `${s.currency} ${s.amount}`
          }`,
          `desde ${fmtDate(s.start_date)}`,
          s.end_date ? `hasta ${fmtDate(s.end_date)}` : s.occurrences ? `${s.occurrences} cuotas` : "",
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

    case "inbox":
      return { kind, label: s.text, hint: "No supo dónde va — queda por decidir" };

    case "inbox_close":
      return { kind, label: s.outcome, hint: "Sale de la bandeja" };
  }
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
