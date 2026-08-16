"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "@/lib/local/mutate";
import { btn, cx, inputClass } from "./ui";

/**
 * One field, one tap, and the write lands in the local replica — the same path
 * online and offline. Every write in the app works this way now; capture was
 * simply the first one that could not afford to fail, and the rest caught up.
 *
 * The permanent bar is gone from the phone, where it cost a row of screen on
 * every view; it is now a button beside the tab bar that opens an autofocused
 * sheet. That is one tap instead of nothing, which is the most this mechanism
 * can afford to give up. On a wide screen there is room to spare, so the bar
 * stays inline and capture still costs zero.
 */
export function CaptureBar({ open }: { open: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const promptRef = useRef<(Event & { prompt?: () => Promise<void> }) | null>(null);

  useEffect(() => {
    function onInstallPrompt(e: Event) {
      e.preventDefault();
      promptRef.current = e as Event & { prompt?: () => Promise<void> };
      setCanInstall(true);
    }

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onInstallPrompt);
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    sheetInputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSheetOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const save = useCallback(
    async (el: HTMLInputElement | null) => {
      const value = el?.value.trim();
      if (!value) return;

      // Clear immediately: the thought is out of your head the instant you typed
      // it, and the UI should agree.
      if (el) el.value = "";
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1200);

      // Aparece en la bandeja en el mismo instante: la réplica ya lo tiene.
      await create("inbox", { text: value, status: "open" });
    },
    []
  );

  async function install() {
    await promptRef.current?.prompt?.();
    setCanInstall(false);
  }

  // Connection and queue live in `OfflineBadge`, one pill for the whole app:
  // repeating them beside the field turned a non-event into a warning on the
  // busiest row of the screen.

  return (
    <>
      {/* --------------------------------------------------- wide screens --- */}
      <div className="mb-6 hidden md:block">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(inputRef.current);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            ref={inputRef}
            name="text"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="Anota lo que no quieres perder…"
            className={cx(inputClass, "min-w-0 flex-1")}
          />
          <button type="submit" className={btn(justSaved ? "subtle" : "primary")}>
            {justSaved ? "✓ Guardado" : "Capturar"}
          </button>
          {canInstall && (
            <button type="button" onClick={install} className={btn("ghost")}>
              Instalar
            </button>
          )}
        </form>
      </div>

      {/* -------------------------------------------------------- phone ----- */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Capturar"
        className="bottom-fab fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-accent text-[26px] font-light leading-none text-bg shadow-lg shadow-black/50 md:hidden"
      >
        ＋
      </button>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line2" />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(sheetInputRef.current);
                setSheetOpen(false);
              }}
              className="flex flex-col gap-3"
            >
              <input
                ref={sheetInputRef}
                name="text"
                autoComplete="off"
                enterKeyHint="done"
                placeholder="Anota lo que no quieres perder…"
                className={inputClass}
              />
              <button type="submit" className={cx(btn("primary"), "w-full")}>
                Capturar
              </button>
              {open > 0 && (
                <p className="text-center text-[13px] text-faint">
                  {open} sin triar en la bandeja
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
