"use client";

import { useEffect, useRef, useState } from "react";
import { create } from "@/lib/local/mutate";
import { boot, getSyncState, subscribeSync } from "@/lib/local/sync";
import { btn, cx, inputClass } from "./ui";

/**
 * La captura de último recurso.
 *
 * Vive en `/offline`, que hoy solo aparece en una vista que nunca se abrió en
 * este dispositivo. Aun así escribe en el mismo sitio que el resto de la app, y
 * arranca la capa local por su cuenta porque acá no hay `AppShell` que lo haga.
 */
export function OfflineCapture() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [queued, setQueued] = useState(0);
  const [saved, setSaved] = useState(false);
  const [online, setOnline] = useState(false);

  useEffect(() => {
    void boot();
    setOnline(navigator.onLine);
    setQueued(getSyncState().queued);

    const offSync = subscribeSync(() => setQueued(getSyncState().queued));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    return () => {
      offSync();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = inputRef.current?.value.trim();
    if (!value) return;
    if (inputRef.current) inputRef.current.value = "";

    setSaved(true);
    setTimeout(() => setSaved(false), 1500);

    await create("inbox", { text: value, status: "open" });
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md">
      <textarea
        ref={inputRef}
        rows={4}
        autoFocus
        placeholder="Anótalo igual. Se guarda acá y sube solo cuando vuelva la señal."
        className={cx(inputClass, "resize-y")}
      />

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" className={btn("primary")}>
          {saved ? "Guardado" : "Capturar"}
        </button>

        <span className="text-[13px] text-faint">
          {queued > 0 ? `${queued} esperando subir` : online ? "Conectado" : "Sin conexión"}
        </span>

        {online && (
          <a href="/" className={`${btn("ghost", "sm")} ml-auto`}>
            Volver
          </a>
        )}
      </div>
    </form>
  );
}
