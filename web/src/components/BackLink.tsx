"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isActivePath, TABS } from "@/lib/nav";

/**
 * Volver, y volver de verdad.
 *
 * La app se instala como PWA, y una PWA no tiene barra de navegador: **no hay
 * flecha de atrás**. En el teléfono tampoco hay una tecla que sirva siempre. Lo
 * que había era un enlace «Volver a Trabajo» escrito a mano en cinco fichas y en
 * ninguna otra, así que salir de una pantalla era distinto en cada una y en
 * varias, imposible: se entraba a editar un movimiento y la única salida era
 * tocar una pestaña, que además te dejaba al principio de la lista.
 *
 * Va en el layout y no en cada página, y eso es la mitad del arreglo: así no
 * vuelve a haber pantallas sin salida, y lo que se agregue mañana lo hereda sin
 * que nadie se acuerde.
 *
 * Dos comportamientos, y el segundo es el que importa:
 *
 * - **Si ya navegaste dentro de la app**, `router.back()`. Es lo que uno espera y
 *   devuelve al lugar exacto, incluido el punto de la lista donde estabas — que un
 *   enlace al padre no puede hacer.
 * - **Si esta pantalla es la primera de la sesión** —un enlace guardado, un acceso
 *   directo de la PWA, una recarga— no hay a dónde volver: `back()` no haría nada
 *   o te sacaría de la app hacia el sitio anterior del navegador. Ahí se sube un
 *   nivel por la ruta.
 *
 * Por eso se cuentan las navegaciones en vez de mirar `history.length`: ese número
 * incluye todo lo que el navegador visitó antes de llegar acá, así que no
 * distingue "vengo de la lista" de "abrí esto directo", que es justo la distinción
 * que hace falta. El contador vive en un `ref` del layout, que sobrevive a los
 * cambios de ruta y se reinicia en una carga completa — que es exactamente cuando
 * deja de haber historia propia.
 */
export function BackLink() {
  const pathname = usePathname();
  const router = useRouter();
  const steps = useRef(0);

  useEffect(() => {
    steps.current += 1;
  }, [pathname]);

  // La raíz de una pestaña ya es el nivel de arriba: ahí la flecha no tendría a
  // dónde apuntar, y una que a veces no hace nada es peor que ninguna.
  if (TABS.some((t) => t.href === pathname)) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (steps.current > 1) router.back();
        else router.push(parentOf(pathname));
      }}
      className="-ml-2 mb-2 inline-flex touch-manipulation items-center gap-1 rounded-full px-2 py-1.5 text-[13px] text-muted transition-colors active:bg-pill md:hover:bg-panel2"
    >
      <span aria-hidden className="text-[17px] leading-none">
        ‹
      </span>
      Volver
    </button>
  );
}

/**
 * Un nivel arriba, por la ruta.
 *
 * `/w/abc/editar` → `/w/abc` → `/w`. Cuando ya no queda segmento que soltar, el
 * padre no es una ruta: es la pestaña que ilumina esta pantalla, y `nav.ts` ya
 * sabe cuál es porque es la misma que aparece encendida en la barra. Así
 * `/finanzas` vuelve a «Yo» sin que haya que mantener una segunda tabla de
 * quién cuelga de quién.
 */
function parentOf(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length > 1) return `/${parts.slice(0, -1).join("/")}`;

  const owner = TABS.find((t) => isActivePath(pathname, t));
  return owner && owner.href !== pathname ? owner.href : "/";
}
