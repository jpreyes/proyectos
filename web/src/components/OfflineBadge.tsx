"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getSyncState, subscribeSync, syncNow } from "@/lib/local/sync";

/**
 * Lo único que la conexión puede hacerle a la pantalla.
 *
 * Ahora que las escrituras se aplican en el dispositivo, quedarse sin red dejó
 * de ser un evento: no se pierde nada, no falla nada, solo hay una cola que
 * espera. Por eso esto es una píldora en la esquina y no un aviso — visible si
 * la buscas, ignorable si no.
 *
 * Lo que sí merece decirse fuerte es lo contrario: si el servidor **rechazó**
 * algo, ya no va a subir solo, y callarlo sería mentir sobre lo que está
 * guardado. Ese es el único estado que insiste.
 */
export function OfflineBadge() {
  const sync = useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const { queued, rejected } = sync;
  if (online && queued === 0 && rejected === 0) return null;

  const tone = rejected > 0 ? "bg-bad" : online ? "bg-faint" : "bg-warn";

  // Se dice cuántas quedan y no "Guardando…": el navegador a veces cree que hay
  // señal cuando no la hay, y un "guardando" eterno miente sobre lo que está a
  // salvo. El punto que late ya indica que se está intentando.
  const label = rejected
    ? `${rejected} no se pudo${rejected === 1 ? "" : "n"} guardar`
    : queued > 0
      ? `${online ? "" : "Sin señal · "}${queued} sin guardar`
      : "Sin señal";

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      title="Sincronizar ahora"
      className="bottom-badge float fixed left-4 z-30 flex items-center gap-2 rounded-full bg-panel/90 px-3 py-1.5 text-[11px] leading-none text-muted backdrop-blur md:bottom-4"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone} ${sync.syncing ? "animate-pulse" : ""}`}
      />
      <span className="truncate" role="status" aria-live="polite">
        {label}
      </span>
      {!online && queued > 0 && (
        <span className="hidden text-faint sm:inline">· se guarda al volver la señal</span>
      )}
    </button>
  );
}
