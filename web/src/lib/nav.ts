/**
 * Cuatro destinos, y cada uno responde una pregunta distinta: qué hago hoy, qué
 * anoté y no he decidido, en qué estoy trabajando, y yo.
 *
 * Eran seis. Calendario y Presupuestos parecían merecer su lugar porque son
 * herramientas grandes, pero ninguna se abre "por sí misma": se abren *por un
 * encargo*. Puestas en la barra obligaban a mantener en la cabeza un mapa de
 * seis secciones y a decidir en cuál buscar algo que en realidad pertenece a un
 * proyecto. Ahora las horas comprometidas y los presupuestos de un proyecto se
 * ven dentro del proyecto, que es donde uno los va a buscar, y las dos vistas
 * completas siguen a un toque desde "Yo".
 *
 * La regla que queda: en la barra va lo que se abre un día cualquiera sin tener
 * que saber de antemano qué contiene. Lo demás vive un toque más adentro.
 *
 * Con cuatro, además, los rótulos completos caben en un teléfono de 375 px sin
 * abreviar — antes Calendario y Presupuestos tenían que ir como "Agenda" y
 * "Presup.", que es una pista de que sobraban.
 *
 * La comparten la barra del teléfono y el riel de escritorio.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Prefijos extra que este destino ilumina. */
  owns?: readonly string[];
};

export const TABS: readonly NavItem[] = [
  { href: "/", label: "Hoy", icon: "◉" },
  { href: "/inbox", label: "Bandeja", icon: "⌸" },
  { href: "/w", label: "Trabajo", icon: "▤" },
  {
    href: "/yo",
    label: "Yo",
    icon: "◑",
    // Todo lo que se alcanza desde "Yo" mantiene esa pestaña encendida, o
    // entras a Finanzas y la barra afirma que no estás en ninguna parte.
    owns: [
      "/calendario",
      "/presupuestos",
      "/finanzas",
      "/entidades",
      "/rutinas",
      "/ritmo",
      "/configuracion",
    ],
  },
] as const;

/** Las filas agrupadas de "Yo". Línea en blanco entre grupos = arreglo nuevo. */
export const YO_GROUPS: readonly (readonly NavItem[])[] = [
  [
    { href: "/calendario", label: "Calendario", icon: "▦" },
    { href: "/presupuestos", label: "Presupuestos", icon: "▧" },
  ],
  [
    { href: "/finanzas", label: "Finanzas", icon: "▲" },
    { href: "/entidades", label: "Contactos", icon: "◑" },
  ],
  [
    { href: "/rutinas", label: "Rutinas", icon: "∿" },
    { href: "/ritmo", label: "Ritmo", icon: "☾" },
  ],
  [{ href: "/configuracion", label: "Configuración", icon: "⚙" }],
] as const;

function matches(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isActivePath(pathname: string, item: NavItem | string): boolean {
  if (typeof item === "string") return matches(pathname, item);
  if (matches(pathname, item.href)) return true;
  return (item.owns ?? []).some((p) => matches(pathname, p));
}
