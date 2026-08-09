"use client";

import { useEffect, useRef, useState } from "react";
import { flush, pending, queue } from "@/lib/offline";
import { btn, cx, inputClass } from "./ui";

/** The one thing that has to keep working with no network. */
export function OfflineCapture() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [queued, setQueued] = useState(0);
  const [saved, setSaved] = useState(false);
  const [online, setOnline] = useState(false);

  async function refresh() {
    setQueued((await pending()).length);
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    const on = () => {
      setOnline(true);
      flush().then(refresh);
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
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

    await queue("inbox", { text: value, status: "open" });
    await refresh();
    if (navigator.onLine) {
      await flush();
      await refresh();
    }
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

      <div className="mt-3 flex items-center gap-3">
        <button type="submit" className={btn("primary")}>
          {saved ? "Guardado" : "Capturar"}
        </button>

        <span className="text-[12px] text-faint">
          {queued > 0
            ? `${queued} esperando subir`
            : online
              ? "Conectado"
              : "Sin conexión"}
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
