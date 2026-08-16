"use client";

import { useEffect } from "react";
import { syncToken } from "@/lib/local/db";
import { handOffToWorker, push, syncNow } from "@/lib/local/sync";
import { TABS } from "@/lib/nav";

/**
 * Registra el worker y le deja la cola cuando la pestaña se va.
 *
 * El reparto de trabajo con `lib/local/sync.ts` es: mientras la app está
 * abierta, ella sube y baja. El worker existe para lo otro — subir lo que
 * quedó pendiente cuando ya cerraste la app y la señal volvió después, que es
 * exactamente el caso de capturar algo en el ascensor y bloquear el teléfono.
 *
 * También le pide que precaliente las cáscaras de los cuatro destinos de la
 * barra. Ahora que cada pantalla se dibuja con datos locales, esas cáscaras son
 * casi idénticas entre sí y no envejecen: lo que se ve adentro lo pone la
 * réplica, no el HTML guardado.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    let cancelled = false;

    async function start() {
      await syncToken();

      if ("serviceWorker" in navigator) {
        if (process.env.NODE_ENV === "production") {
          try {
            await navigator.serviceWorker.register("/sw.js", { scope: "/" });
          } catch {
            // registro bloqueado (modo privado, origen inseguro): la app sigue
            // funcionando, solo pierde la subida en segundo plano
          }
        } else {
          // En dev los chunks no llevan hash, así que un worker cache-first
          // sirve el JavaScript de ayer contra el HTML de hoy y la app muere al
          // hidratar. Se desmonta. Para probar el modo sin red: pnpm build && pnpm start.
          for (const reg of await navigator.serviceWorker.getRegistrations()) {
            await reg.unregister();
          }
          for (const key of await caches.keys()) await caches.delete(key);
        }
      }

      if (cancelled) return;
      await handOffToWorker();
      if (navigator.onLine) warm();
    }

    function warm() {
      navigator.serviceWorker?.getRegistration().then((reg) => {
        reg?.active?.postMessage({ type: "warm-pages", urls: TABS.map((t) => t.href) });
      });
    }

    start();

    function onMessage(event: MessageEvent) {
      // El worker subió algo mientras la app no miraba: hay que traer de vuelta
      // la versión autoritativa, con `owner` y las marcas de tiempo del servidor.
      if (event.data?.type === "outbox-flushed" && event.data.sent > 0) void syncNow();
    }

    function onOnline() {
      void push();
      warm();
    }

    function onHide() {
      // La pestaña se va: lo que quede en la cola queda en manos del worker.
      if (document.visibilityState === "hidden") void handOffToWorker();
    }

    navigator.serviceWorker?.addEventListener("message", onMessage);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return null;
}
