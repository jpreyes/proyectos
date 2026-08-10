"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { flush, pending, queue } from "@/lib/offline";
import { btn, cx, inputClass } from "./ui";

/**
 * Always on screen, one field, one click.
 *
 * The write goes to IndexedDB first and to the server afterwards — the same
 * path online and offline. Anything else would make capture fail exactly when
 * it matters most, and a capture box you cannot trust is worse than none.
 *
 * `compact` is the phone variant: it drops its own sticky wrapper and the inbox
 * link, because on mobile it lives inside the header, which supplies both.
 */
export function CaptureBar({ open, compact = false }: { open: number; compact?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(true);
  const [justSaved, setJustSaved] = useState(false);
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = inputRef.current?.value.trim();
    if (!value) return;

    // Clear immediately: the thought is out of your head the instant you typed
    // it, and the UI should agree.
    if (inputRef.current) inputRef.current.value = "";
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1200);

    await queue("inbox", { text: value, status: "open" });
    await refreshQueued();
    await flush();
    await refreshQueued();
    router.refresh();
  }

  async function install() {
    await promptRef.current?.prompt?.();
    setCanInstall(false);
  }

  const total = open + queued;

  const form = (
    <form
      onSubmit={onSubmit}
      className={cx(
        "flex flex-wrap items-center gap-2",
        compact ? "min-w-0 flex-1" : "mx-auto max-w-6xl px-4 py-2 md:px-8"
      )}
    >
      <input
        ref={inputRef}
        name="text"
        autoComplete="off"
        enterKeyHint="done"
        placeholder={compact ? "Anota algo…" : "Anota lo que no quieres perder…"}
        className={cx(inputClass, "min-w-0 flex-1")}
      />

      <button type="submit" className={btn(justSaved ? "subtle" : "primary", "sm")}>
        {justSaved ? "✓" : "Capturar"}
      </button>

      {canInstall && (
        <button type="button" onClick={install} className={btn("ghost", "sm")}>
          Instalar
        </button>
      )}

      {!online && (
        <span
          className="shrink-0 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn"
          title="Lo que captures se guarda y se sube al reconectar"
        >
          sin conexión
        </span>
      )}

      {queued > 0 && (
        <span
          className="shrink-0 rounded-md border border-line2 bg-panel2 px-2 py-1 text-xs text-muted"
          title="Capturas esperando subir"
        >
          {queued} por subir
        </span>
      )}

      {!compact && (
        <Link
          href="/inbox"
          className={cx(
            "shrink-0 rounded-md border px-2 py-1 text-xs transition-colors",
            total > 0
              ? "border-warn/40 bg-warn/10 text-warn hover:bg-warn/20"
              : "border-line2 bg-panel2 text-faint hover:text-ink"
          )}
          title="Bandeja"
        >
          Bandeja {total > 0 ? total : ""}
        </Link>
      )}
    </form>
  );

  if (compact) return form;

  return (
    <div className="sticky top-0 z-20 hidden border-b border-line bg-bg/85 backdrop-blur md:block">
      {form}
    </div>
  );
}
