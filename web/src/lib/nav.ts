/**
 * Cinco destinos, y cada uno responde una pregunta distinta: qué hago hoy, qué
 * anoté y no he decidido, qué le digo al asistente, en qué estoy trabajando, y
 * yo.
 *
 * Eran seis, después cuatro, y ahora cinco. Calendario y Presupuestos salieron
 * porque ninguna se abre "por sí misma": se abren *por un proyecto*, así que sus
 * cosas viven dentro del proyecto y las vistas completas quedan a un toque desde
 * "Yo". La regla que salió de ahí sigue siendo la buena: **en la barra va lo que
 * se abre un día cualquiera sin tener que saber de antemano qué contiene.**
 *
 * El asistente entra porque cumple esa regla mejor que casi todo lo demás: se
 * abre justamente cuando *no* sabes dónde va lo que traes, que es la definición
 * del caso. Estuvo un rato como fila de "Yo" y ahí fallaba distinto — un destino
 * que uno usa a diario escondido dos toques adentro, en el cajón de las cosas que
 * se configuran una vez. La prueba de que cabe es la de siempre: "Asistente" se
 * lee completo en un teléfono de 375 px, sin abreviar. El día que un destino
 * nuevo obligue a poner "Asist." o "Presup.", es que sobra — esa sigue siendo la
 * señal, y es la que hay que respetar antes que el número.
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
  // Va en medio y no al final: en un teléfono el centro de la barra es lo que el
  // pulgar alcanza sin recolocar la mano, y esto es el destino al que uno llega
  // con algo que quiere sacarse de la cabeza. Al lado de Bandeja, además, porque
  // son los dos que reciben en vez de mostrar.
  { href: "/organizar", label: "Asistente", icon: "✳" },
  { href: "/w", label: "Proyectos", icon: "▤" },
  {
    href: "/yo",
    label: "Yo",
    icon: "◑",
    // Todo lo que se alcanza desde "Yo" mantiene esa pestaña encendida, o
    // entras a Finanzas y la barra afirma que no estás en ninguna parte.
    // `/organizar` ya no está acá: tiene su propia pestaña, y dejarlo habría
    // encendido dos a la vez.
    owns: [
      "/calendario",
      "/presupuestos",
      "/finanzas",
      "/recurrentes",
      "/entidades",
      "/rutinas",
      "/ritmo",
      "/configuracion",
    ],
  },
] as const;

/**
 * Las filas agrupadas de "Yo". Línea en blanco entre grupos = arreglo nuevo.
 *
 * El asistente estuvo acá arriba, solo en su grupo, y se fue a la barra. No se
 * repite en las dos partes a propósito: una fila que duplica una pestaña es
 * ruido, y en este menú el ruido es justo lo que hay que evitar.
 */
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
