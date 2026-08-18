"use client";

/**
 * El día con horas, que es la vista que faltaba.
 *
 * La cuadrícula de mes contesta "¿cabe?" y esta contesta "¿qué hago ahora?".
 * Conviven porque son dos preguntas y ninguna reemplaza a la otra: la de mes se
 * mira cuando llega un proyecto nuevo, esta se mira un martes a las diez.
 *
 * Nada de lo que se dibuja acá está guardado — lo deriva `lib/dayplan.ts` de los
 * compromisos cada vez. Por eso no hay arrastrar ni soltar: mover un bloque no
 * tendría dónde escribirse, y el día siguiente volvería a salir igual. Lo que se
 * cambia es la causa (las horas del compromiso o su franja fija), no el dibujo.
 *
 * La jornada se dibuja completa aunque sobre espacio: ver el hueco vacío de las
 * 16:00 es la mitad de la información. Y el borde inferior es duro — lo que no
 * cupo se lista abajo en vez de estirarse hacia la noche.
 */

import Link from "next/link";
import type { Block, DayPlan } from "@/lib/dayplan";
import { fmtMin } from "@/lib/dayplan";
import { fmtHours } from "@/lib/capacity";
import { cx } from "./ui";

/** Alto de una hora, en px. 56 deja leer un bloque de media hora sin apretar. */
const HOUR = 56;

const TONE: Record<Block["kind"], string> = {
  event: "bg-pill text-ink border-l-2 border-line2",
  fixed: "bg-accent/20 text-ink border-l-2 border-accent",
  flex: "bg-row text-ink border-l-2 border-line2",
  lunch: "bg-transparent text-faint border-l-2 border-dashed border-line2",
};

export function DayGrid({ plan }: { plan: DayPlan }) {
  const total = plan.to - plan.from;
  const hours: number[] = [];
  for (let m = Math.ceil(plan.from / 60) * 60; m <= plan.to; m += 60) hours.push(m);

  return (
    <div>
      <div className="relative flex gap-2" style={{ height: `${(total / 60) * HOUR}px` }}>
        {/* La regla de horas. */}
        <div className="relative w-11 shrink-0">
          {hours.map((m) => (
            <span
              key={m}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-faint"
              style={{ top: `${((m - plan.from) / total) * 100}%` }}
            >
              {fmtMin(m)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl bg-panel2/40">
          {/* Las líneas de hora, detrás de todo. */}
          {hours.map((m) => (
            <span
              key={m}
              className="absolute inset-x-0 border-t border-line/60"
              style={{ top: `${((m - plan.from) / total) * 100}%` }}
            />
          ))}

          {plan.blocks.map((b) => {
            const top = ((b.from - plan.from) / total) * 100;
            const height = ((b.to - b.from) / total) * 100;
            const short = b.to - b.from <= 30;
            const body = (
              <>
                <span className={cx("block truncate font-semibold", short && "text-[12px]")}>
                  {b.label}
                </span>
                {!short && (
                  <span className="block text-[11px] tabular-nums opacity-70">
                    {fmtMin(b.from)}–{fmtMin(b.to)}
                  </span>
                )}
              </>
            );
            const cls = cx(
              "absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-[13px] leading-tight",
              TONE[b.kind]
            );
            const style = { top: `${top}%`, height: `calc(${height}% - 2px)` };

            // Un bloque que representa trabajo lleva a su proyecto; el almuerzo
            // y un evento ajeno no llevan a ninguna parte, así que no fingen
            // ser tocables.
            return b.project ? (
              <Link
                key={b.key}
                href={`/w/${b.project}`}
                style={style}
                className={cx(cls, "touch-manipulation active:opacity-70")}
              >
                {body}
              </Link>
            ) : (
              <div key={b.key} style={style} className={cls}>
                {body}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-[13px] text-faint">
        <span className="tabular-nums text-ink">{fmtHours(plan.placed)} h</span> repartidas entre{" "}
        {fmtMin(plan.from)} y {fmtMin(plan.to)}.
      </p>

      {plan.unplaced.length > 0 && (
        <div className="mt-3 rounded-xl bg-warn/10 px-3 py-2.5 text-[13px]">
          <p className="font-semibold text-warn">No cabe en la jornada</p>
          <ul className="mt-1 space-y-0.5 text-muted">
            {plan.unplaced.map((u) => (
              <li key={u.label}>
                {u.label} · faltan {fmtHours(u.hours)} h
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-faint">
            Se muestra en vez de estirarse hacia la noche: o baja las horas de algo, o mueve un
            plazo.
          </p>
        </div>
      )}
    </div>
  );
}
