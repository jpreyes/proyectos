"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath, TABS } from "@/lib/nav";
import { cx } from "./ui";

/**
 * Los mismos destinos en ambos anchos. En el teléfono viven en una barra
 * flotante al alcance del pulgar; en una pantalla ancha se vuelven un riel
 * angosto, porque una barra inferior en un escritorio desperdicia el único eje
 * que a esa pantalla le sobra.
 *
 * Son cinco y los rótulos completos siguen cabiendo en un teléfono de 375 px sin
 * abreviaturas — el día que haya que abreviar uno, sobra un destino. El motivo de
 * cuáles son está en lib/nav.ts.
 *
 * La barra ocupa el ancho de la pantalla y los destinos se reparten en partes
 * iguales (`flex-1 basis-0`), no el ancho de su contenido. Ajustada al contenido
 * quedaba una pastilla angosta en medio de un teléfono: los blancos de los lados
 * no se pueden tocar, y cada destino recibía apenas los ~64 px de su rótulo, que
 * es menos de lo que mide un pulgar. Además el tamaño de la barra dejaba de ser
 * el mismo entre pantallas —crecía y se encogía con cuántos destinos hubiera— y
 * los rótulos se movían de sitio al agregar uno. Repartiendo el ancho, agregar o
 * quitar un destino cambia el tamaño de las zonas de toque y nada más.
 *
 * La única insignia de la app es el contador de la bandeja: algo escrito y sin
 * decidir es lo único que debería insistir. Cualquier otra cosa ganándose un
 * punto rojo es cómo una herramienta empieza a sentirse como una obligación.
 */

function count(open: number, href: string): number {
  return href === "/inbox" ? open : 0;
}

export function TabBar({ open }: { open: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Principal"
      data-tour="nav"
      className="bottom-tabbar float fixed inset-x-3 z-40 flex items-center rounded-full bg-panel/95 p-1 backdrop-blur md:hidden"
    >
      {TABS.map((t) => {
        const active = isActivePath(pathname, t);
        const n = count(open, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 rounded-full px-1 py-2 transition-colors",
              active ? "bg-pill" : "active:bg-pill/50"
            )}
          >
            {/* La insignia cuelga del icono, no de la esquina de la pestaña: al
                repartirse el ancho completo la esquina queda lejos del glifo y
                el número se leería como si fuera de la pestaña vecina. */}
            <span className="relative">
              <span
                className={cx("text-[21px] leading-none", active ? "text-accent" : "text-muted")}
                aria-hidden
              >
                {t.icon}
              </span>
              {n > 0 && (
                <span className="absolute -right-3 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-warn px-1 text-[10px] font-bold leading-none text-bg">
                  {n}
                </span>
              )}
            </span>
            <span
              className={cx(
                "w-full truncate text-center text-[11px] leading-none",
                active ? "font-semibold text-ink" : "text-faint"
              )}
            >
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Rail({ open }: { open: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" data-tour="nav" className="flex h-full flex-col gap-1">
      <div className="px-3 pb-6 pt-2 text-[17px] font-bold tracking-tight">Proyectos</div>

      {TABS.map((t) => {
        const active = isActivePath(pathname, t);
        const n = count(open, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px] transition-colors",
              active ? "bg-pill font-semibold text-ink" : "text-muted hover:bg-panel2"
            )}
          >
            <span
              className={cx("w-4 text-center text-[15px]", active ? "text-accent" : "text-faint")}
              aria-hidden
            >
              {t.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{t.label}</span>
            {n > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-warn px-1.5 text-[11px] font-bold leading-none text-bg">
                {n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
