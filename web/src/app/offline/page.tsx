import { OfflineCapture } from "@/components/OfflineCapture";

// Fully static on purpose: this page is precached by the service worker and
// must render with no server, no session and no database.
export const dynamic = "force-static";

export const metadata = { title: "Sin conexión · Proyectos" };

/**
 * The last resort, and only that.
 *
 * Any screen already opened is served from the page cache when the network is
 * gone, so this is reached only for a view with no local copy at all. It used
 * to be the front door of every outage, which made a recoverable moment look
 * like the app had fallen over. The copy assumes the rest still works.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-5 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">
          De esta pantalla no hay copia
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          No hay red y esta vista no se había abierto antes en este dispositivo. Las que sí, siguen
          disponibles tal como se vieron la última vez. Y lo de siempre: lo que anotes acá se guarda
          y se sube apenas vuelva la señal.
        </p>
      </div>

      <OfflineCapture />
    </main>
  );
}
