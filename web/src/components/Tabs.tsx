"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath, TABS } from "@/lib/nav";
import { cx } from "./ui";

/**
 * Same six destinations at both widths. On a phone they sit in a floating bar
 * within thumb reach; on a wide screen they become a narrow rail, because a
 * bottom bar on a desktop wastes the one axis that screen has to spare.
 *
 * Six is what fits, and only with the tighter padding and the `short` labels
 * below — at the full label width the bar runs off a 375 px handset and every
 * caption truncates to an ellipsis. A seventh would have to drop the captions.
 *
 * The only badge in the app is the inbox count: an uncaptured item is the one
 * thing that should nag, and everything else earning a red dot is how a tool
 * starts feeling like an obligation.
 */

function count(open: number, href: string): number {
  return href === "/inbox" ? open : 0;
}

export function TabBar({ open }: { open: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Principal"
      className="bottom-tabbar fixed inset-x-0 z-40 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center rounded-full bg-panel/95 p-1 shadow-lg shadow-black/40 backdrop-blur md:hidden"
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
              "relative flex min-w-0 flex-col items-center gap-1 rounded-full px-2 py-2 transition-colors",
              active ? "bg-pill" : "active:bg-pill/50"
            )}
          >
            <span
              className={cx("text-[16px] leading-none", active ? "text-accent" : "text-muted")}
              aria-hidden
            >
              {t.icon}
            </span>
            <span
              className={cx(
                "max-w-[4.25rem] truncate text-[10px] leading-none",
                active ? "font-semibold text-ink" : "text-faint"
              )}
            >
              {t.short ?? t.label}
            </span>
            {n > 0 && (
              <span className="absolute right-0.5 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-warn px-1 text-[10px] font-bold leading-none text-bg">
                {n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function Rail({ open }: { open: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="flex h-full flex-col gap-1">
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
