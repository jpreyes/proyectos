"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { flush, syncToken } from "@/lib/offline";

/**
 * Registers the worker and keeps the queue moving: on load, whenever the
 * connection returns, and whenever the tab is brought back to the foreground.
 */
export function ServiceWorkerRegistrar() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      await syncToken();

      if ("serviceWorker" in navigator) {
        if (process.env.NODE_ENV === "production") {
          try {
            await navigator.serviceWorker.register("/sw.js", { scope: "/" });
          } catch {
            // registration blocked (private mode, insecure origin) — the app
            // still works, it just loses the offline path
          }
        } else {
          // Dev builds do not content-hash their chunk names, so a cache-first
          // worker happily serves yesterday's JavaScript against today's HTML
          // and the app dies on hydration. Tear it down instead.
          // To exercise the offline path, run `pnpm build && pnpm start`.
          for (const reg of await navigator.serviceWorker.getRegistrations()) {
            await reg.unregister();
          }
          for (const key of await caches.keys()) await caches.delete(key);
        }
      }
      if (!cancelled) await flush();
    }

    boot();

    function onMessage(event: MessageEvent) {
      if (event.data?.type === "outbox-flushed" && event.data.sent > 0) {
        window.dispatchEvent(new CustomEvent("outbox-changed"));
        router.refresh();
      }
    }

    function onOnline() {
      flush();
    }

    function onVisible() {
      if (document.visibilityState === "visible") flush();
    }

    navigator.serviceWorker?.addEventListener("message", onMessage);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
