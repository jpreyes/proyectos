/**
 * Five destinations, not ten. The sidebar used to list every screen the app
 * has, which made the app feel like a control panel and pushed the daily work
 * into the same visual weight as settings. What stays on the bar is what gets
 * opened on an ordinary day; everything else lives one tap deeper, on "Yo".
 *
 * Shared by the mobile tab bar and the desktop rail.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Extra path prefixes this destination is responsible for highlighting. */
  owns?: readonly string[];
};

export const TABS: readonly NavItem[] = [
  { href: "/", label: "Hoy", icon: "◉" },
  { href: "/inbox", label: "Bandeja", icon: "⌸" },
  { href: "/w", label: "Trabajo", icon: "▤" },
  { href: "/calendario", label: "Calendario", icon: "▦" },
  {
    href: "/yo",
    label: "Yo",
    icon: "◑",
    // Everything reachable from the "Yo" screen keeps that tab lit, or you tap
    // through to Finanzas and the bar claims you are nowhere.
    owns: ["/finanzas", "/presupuestos", "/entidades", "/rutinas", "/ritmo", "/configuracion"],
  },
] as const;

/** The grouped rows on the "Yo" screen. Blank line between groups = new array. */
export const YO_GROUPS: readonly (readonly NavItem[])[] = [
  [
    { href: "/finanzas", label: "Finanzas", icon: "▲" },
    { href: "/presupuestos", label: "Presupuestos", icon: "▧" },
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
