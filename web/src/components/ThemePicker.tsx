"use client";

import { useEffect, useState } from "react";
import { getTheme, setTheme, THEME_OPTIONS, type ThemePref } from "@/lib/theme";
import { cx } from "./ui";

/**
 * Los tres estados del tema, en un solo control.
 *
 * Se lee en un efecto y no en el primer render a propósito: el valor vive en
 * `localStorage`, que no existe en el servidor, y leerlo durante el render
 * dejaría dos HTML distintos. Hasta que el efecto corre se muestra
 * "Automático", que es el valor por defecto y el caso de la mayoría.
 */
export function ThemePicker() {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => setPref(getTheme()), []);

  function choose(next: ThemePref) {
    setPref(next);
    setTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="inline-flex gap-1 rounded-full bg-panel2 p-1"
    >
      {THEME_OPTIONS.map((o) => {
        const active = pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(o.value)}
            className={cx(
              "cursor-pointer rounded-full px-4 py-2 text-[14px] font-semibold transition-colors",
              active ? "bg-accent text-bg" : "text-muted hover:bg-pill hover:text-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
