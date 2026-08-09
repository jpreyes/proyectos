"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { pbBrowser } from "@/lib/pb.client";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Hoy", icon: "◉" },
  { href: "/inbox", label: "Bandeja", icon: "⌸" },
  { href: "/w", label: "Workspaces", icon: "▤" },
  { href: "/rutinas", label: "Rutinas", icon: "∿" },
  { href: "/ritmo", label: "Ritmo", icon: "☾" },
  { href: "/finanzas", label: "Finanzas", icon: "▲" },
  { href: "/entidades", label: "Contactos", icon: "◑" },
  { href: "/configuracion", label: "Configuración", icon: "⚙" },
];

export function Nav({ userLabel }: { userLabel: string }) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function logout() {
    const pb = pbBrowser();
    pb.authStore.clear();
    document.cookie = "pb_auth=; Path=/; Max-Age=0";
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="flex h-full flex-col gap-1">
      <div className="px-3 pb-4 pt-1">
        <div className="text-[13px] font-semibold tracking-tight">Proyectos</div>
        <div className="truncate text-[11px] text-faint">{userLabel}</div>
      </div>

      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cx(
            "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition-colors",
            isActive(l.href)
              ? "bg-accent/12 text-accent"
              : "text-muted hover:bg-panel2 hover:text-ink"
          )}
        >
          <span className="w-3.5 text-center text-[11px] opacity-80">{l.icon}</span>
          {l.label}
        </Link>
      ))}

      <div className="mt-auto space-y-1 pt-4">
        <a
          href="/_/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-faint transition-colors hover:bg-panel2 hover:text-ink"
        >
          <span className="w-3.5 text-center text-[11px]">▤</span>
          Admin PocketBase
        </a>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] text-faint transition-colors hover:bg-panel2 hover:text-ink"
        >
          <span className="w-3.5 text-center text-[11px]">⏻</span>
          Salir
        </button>
      </div>
    </nav>
  );
}
