"use client";

import { useCallback, useEffect, useState } from "react";
import { pending } from "@/lib/offline";

/**
 * The only thing losing the network is allowed to do to the screen.
 *
 * Before this, a failed navigation replaced the app with a full-page "Sin
 * conexión". That reads as an outage even when nothing is lost: the service
 * worker keeps the last rendered copy of every screen and captures already go
 * to IndexedDB first, so the honest report is not "you are down", it is "this
 * is what you had, and what you write now goes up later".
 *
 * So it stays a pill in the corner: visible if you look for it, ignorable if
 * you don't, never in the way of the content. It also carries the outbox count,
 * because a queue draining is the one part of this the user may want to watch.
 */
export function OfflineBadge() {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  const refresh = useCallback(async () => {
    setQueued((await pending()).length);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();

    const on = () => setOnline(true);
    const off = () => setOnline(false);

    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("outbox-changed", refresh);
    // The queue also drains from the worker, which reports back through
    // `outbox-changed`; the timer is for the flushes it cannot announce.
    const timer = setInterval(refresh, 8000);

    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("outbox-changed", refresh);
      clearInterval(timer);
    };
  }, [refresh]);

  if (online && queued === 0) return null;

  const label = online
    ? `${queued} por subir`
    : queued > 0
      ? `Sin conexión · ${queued} por subir`
      : "Sin conexión";

  return (
    <div
      role="status"
      aria-live="polite"
      className="bottom-badge pointer-events-none fixed left-4 z-30 flex items-center gap-2 rounded-full bg-panel/90 px-3 py-1.5 text-[11px] leading-none text-muted shadow-md shadow-black/30 backdrop-blur md:bottom-4"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "bg-faint" : "bg-warn"}`}
      />
      <span className="truncate">{label}</span>
      {!online && <span className="hidden text-faint sm:inline">· sube al volver la red</span>}
    </div>
  );
}
