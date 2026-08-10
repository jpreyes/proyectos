"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Nav } from "./Nav";
import { CaptureBar } from "./CaptureBar";
import { cx } from "./ui";

/**
 * On a phone the sidebar cannot simply stack: eight links rendered inline push
 * the actual page below the fold, so every visit starts with a scroll. The menu
 * collapses behind one tap and the header keeps only what is worth a permanent
 * slot — the inbox count, because an unprocessed capture is the one thing that
 * should nag.
 */
export function MobileNav({ userLabel, open }: { userLabel: string; open: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Navigating closes the drawer; without this it stays open over the new page.
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  return (
    <>
      {/* One sticky row on mobile: menu + capture. Two stacked sticky bars would
          overlap on scroll, and capture is too important to lose to scrolling. */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/90 px-3 py-2 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={open > 0 ? `Abrir menú, ${open} en bandeja` : "Abrir menú"}
          aria-expanded={isOpen}
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line2 bg-panel2 text-ink"
        >
          <span className="flex flex-col gap-[3px]">
            <span className="block h-[1.5px] w-4 rounded bg-current" />
            <span className="block h-[1.5px] w-4 rounded bg-current" />
            <span className="block h-[1.5px] w-4 rounded bg-current" />
          </span>
          {open > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-warn px-1 text-[10px] font-semibold leading-none text-bg">
              {open}
            </span>
          )}
        </button>

        <CaptureBar open={open} compact />
      </header>

      {/* Drawer */}
      <div
        className={cx(
          "fixed inset-0 z-50 md:hidden",
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!isOpen}
      >
        <button
          type="button"
          tabIndex={isOpen ? 0 : -1}
          aria-label="Cerrar menú"
          onClick={() => setIsOpen(false)}
          className={cx(
            "absolute inset-0 bg-black/60 transition-opacity duration-200",
            isOpen ? "opacity-100" : "opacity-0"
          )}
        />

        <div
          className={cx(
            "absolute inset-y-0 left-0 flex w-64 max-w-[82vw] flex-col overflow-y-auto border-r border-line bg-panel px-2 py-3 shadow-2xl transition-transform duration-200",
            isOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <Nav userLabel={userLabel} />
        </div>
      </div>
    </>
  );
}
