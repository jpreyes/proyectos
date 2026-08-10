/** Shared by the desktop sidebar and the mobile drawer. */
export const NAV_LINKS = [
  { href: "/", label: "Hoy", icon: "◉" },
  { href: "/inbox", label: "Bandeja", icon: "⌸" },
  { href: "/w", label: "Workspaces", icon: "▤" },
  { href: "/rutinas", label: "Rutinas", icon: "∿" },
  { href: "/ritmo", label: "Ritmo", icon: "☾" },
  { href: "/finanzas", label: "Finanzas", icon: "▲" },
  { href: "/entidades", label: "Contactos", icon: "◑" },
  { href: "/configuracion", label: "Configuración", icon: "⚙" },
] as const;

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
