"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { completeTour } from "@/lib/local/actions";
import { useConfig } from "@/lib/local/config";
import { TOUR, TOUR_START_EVENT } from "@/lib/tour";
import { btn, cx } from "./ui";

/** Margen entre el recuadro iluminado y el borde del velo. */
const PAD = 8;
/** Separación entre el recuadro y la tarjeta. */
const GAP = 12;

/**
 * Respaldo local de "ya la vi".
 *
 * La marca de verdad va en la cuenta (`settings.tour_done`), que es lo correcto
 * cuando hay dos dispositivos. Pero esa escritura pasa por la cola, y si la fila
 * de ajustes todavía no bajó no hay nada que actualizar: sin este respaldo, una
 * guía cerrada volvería a abrirse en la siguiente carga.
 */
const SEEN_KEY = "tour-seen";

function markSeenLocally() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // sin almacenamiento: manda la marca de la cuenta y basta
  }
}

function seenLocally() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

type Box = { top: number; left: number; width: number; height: number };

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

/**
 * El elemento visible con ese `data-tour`.
 *
 * Puede haber dos —la barra del teléfono y el riel del escritorio llevan el
 * mismo nombre— y solo uno está en pantalla a la vez. Se elige por tamaño, que
 * es la forma barata de preguntar "¿cuál de los dos existe ahora?".
 */
function findAnchor(name: string): Element | null {
  const all = document.querySelectorAll(`[data-tour="${name}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function Tour() {
  const cfg = useConfig();
  const router = useRouter();
  const pathname = usePathname();

  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  /** Ya se cerró en esta sesión: evita que vuelva mientras la marca sube. */
  const closed = useRef(false);

  const current = step === null ? null : TOUR[step];

  /* ------------------------------------------------------------ arranque -- */

  // Arranca sola la primera vez. Espera a que la fila de ajustes exista, que es
  // la señal de que la réplica ya bajó: sin eso `tour_done` se leería como
  // false en cada carga y la guía saldría siempre.
  useEffect(() => {
    if (closed.current || step !== null) return;
    if (!cfg.settings.id || cfg.settings.tour_done) return;
    if (seenLocally()) return;
    setStep(0);
  }, [cfg.settings.id, cfg.settings.tour_done, step]);

  useEffect(() => {
    function onStart() {
      closed.current = false;
      setStep(0);
    }
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, []);

  /* ---------------------------------------------------------- navegación -- */

  useEffect(() => {
    if (!current) return;
    if (pathname !== current.route) router.push(current.route);
  }, [current, pathname, router]);

  /* ------------------------------------------------------------ medición -- */

  // Se vuelve a medir en un intervalo corto en vez de escuchar scroll, resize y
  // la navegación por separado: el elemento puede aparecer tarde (la pantalla
  // se pinta desde la réplica), moverse al hacer scroll o cambiar de tamaño al
  // girar el teléfono, y un intervalo cubre los tres casos con un solo camino.
  useEffect(() => {
    if (!current) return;

    if (!current.anchor) {
      setBox(null);
      return;
    }

    let scrolled = false;

    function measure() {
      const el = current?.anchor ? findAnchor(current.anchor) : null;
      if (!el) {
        setBox(null);
        return;
      }
      if (!scrolled) {
        scrolled = true;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      setBox(boxOf(el));
    }

    measure();
    const timer = setInterval(measure, 250);
    return () => clearInterval(timer);
  }, [current, pathname]);

  /* -------------------------------------------------------------- cierre -- */

  const finish = useCallback(() => {
    closed.current = true;
    markSeenLocally();
    setStep(null);
    setBox(null);
    void completeTour();
  }, []);

  const next = useCallback(() => {
    if (step === null) return;
    if (step + 1 >= TOUR.length) {
      finish();
      return;
    }
    setStep(step + 1);
    setBox(null);
  }, [step, finish]);

  useEffect(() => {
    if (step === null) return;
    // Enter no está acá a propósito: el botón "Siguiente" tiene el foco, así
    // que ya lo maneja él. Escucharlo también avanzaría dos pasos de un golpe.
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") setStep((s) => (s === null || s === 0 ? s : s - 1));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, finish, next]);

  if (step === null || !current) return null;

  const last = step === TOUR.length - 1;

  /* ------------------------------------------------------------- tarjeta -- */

  const cardH = cardRef.current?.offsetHeight ?? 240;
  const viewportH = typeof window === "undefined" ? 800 : window.innerHeight;

  let cardStyle: React.CSSProperties = {};
  if (box) {
    const below = box.top + box.height + GAP;
    const above = box.top - GAP - cardH;
    cardStyle =
      below + cardH < viewportH - 16
        ? { top: below }
        : above > 16
          ? { top: above }
          : { top: Math.max(16, viewportH - cardH - 16) };
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Guía">
      {/* El velo, en cuatro trozos alrededor de lo iluminado. Un solo div con un
          agujero exigiría una máscara SVG; cuatro rectángulos hacen lo mismo y
          se entienden leyéndolos. */}
      {box ? (
        <>
          <div className="scrim absolute inset-x-0 top-0" style={{ height: Math.max(0, box.top) }} />
          <div
            className="scrim absolute inset-x-0 bottom-0"
            style={{ top: box.top + box.height }}
          />
          <div
            className="scrim absolute left-0"
            style={{ top: box.top, height: box.height, width: Math.max(0, box.left) }}
          />
          <div
            className="scrim absolute right-0"
            style={{ top: box.top, height: box.height, left: box.left + box.width }}
          />
          <div
            className="pointer-events-none absolute rounded-2xl ring-2 ring-accent"
            style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          />
        </>
      ) : (
        <div className="scrim absolute inset-0" />
      )}

      <div
        ref={cardRef}
        style={cardStyle}
        className={cx(
          "float-strong absolute inset-x-4 mx-auto w-auto max-w-md rounded-3xl bg-panel px-5 py-5 md:inset-x-auto md:left-1/2 md:w-[26rem] md:-translate-x-1/2",
          !box && "top-1/2 -translate-y-1/2"
        )}
      >
        <p className="text-[12px] font-semibold uppercase tracking-wider text-faint">
          Guía · {step + 1} de {TOUR.length}
        </p>
        <h2 className="mt-1.5 text-[20px] font-bold leading-tight tracking-tight">
          {current.title}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{current.body}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={finish} className={btn("ghost", "sm")}>
            {last ? "Cerrar" : "Saltar"}
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s === null ? null : s - 1))}
                className={btn("subtle", "sm")}
              >
                Atrás
              </button>
            )}
            <button type="button" onClick={next} className={btn("primary", "sm")} autoFocus>
              {last ? "Listo" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
