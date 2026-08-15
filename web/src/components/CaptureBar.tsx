"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flush, pending, queue } from "@/lib/offline";
import { btn, cx, inputClass } from "./ui";

/**
 * One field, one tap, and the write goes to IndexedDB first — the same path
 * online and offline. Anything else would make capture fail exactly when it
 * matters most, and a capture box you cannot trust is worse than none.
 *
 * The permanent bar is gone from the phone, where it cost a row of screen on
 * every view; it is now a button beside the tab bar that opens an autofocused
 * sheet. That is one tap instead of nothing, which is the most this mechanism
 * can afford to give up. On a wide screen there is room to spare, so the bar
 * stays inline and capture still costs zero.
 */
export function CaptureBar({ open }: { open: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(true);
  const [justSaved, setJustSaved] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const promptRef = useRef<(Event & { prompt?: () => Promise<void> }) | null>(null);

  const refreshQueued = useCallback(async () => {
    setQueued((await pending()).length);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshQueued();

    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const changed = () => refreshQueued();

    function onInstallPrompt(e: Event) {
      e.preventDefault();
      promptRef.current = e as Event & { prompt?: () => Promise<void> };
      setCanInstall(true);
    }

    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("outbox-changed", changed);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    const timer = setInterval(refreshQueued, 8000);

    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("outbox-changed", changed);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      clearInterval(timer);
    };
  }, [refreshQueued]);

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

      await queue("inbox", { text: value, status: "open" });
      await refreshQueued();
      await flush();
      await refreshQueued();
      router.refresh();
    },
    [refreshQueued, router]
  );

  async function install() {
    await promptRef.current?.prompt?.();
    setCanInstall(false);
  }

  const status = (
    <>
      {!online && (
        <span
          className="shrink-0 rounded-full bg-warn/15 px-2.5 py-1 text-[12px] font-semibold text-warn"
          title="Lo que captures se guarda y se sube al reconectar"
        >
          sin conexión
        </span>
      )}
      {queued > 0 && (
        <span
          className="shrink-0 rounded-full bg-pill px-2.5 py-1 text-[12px] font-semibold text-muted"
          title="Capturas esperando subir"
        >
          {queued} por subir
        </span>
      )}
    </>
  );

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
          {status}
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
              <div className="flex items-center gap-2">
                <button type="submit" className={cx(btn("primary"), "flex-1")}>
                  Capturar
                </button>
                {status}
              </div>
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
