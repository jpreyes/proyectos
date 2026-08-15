import { OfflineCapture } from "@/components/OfflineCapture";

// Fully static on purpose: this page is precached by the service worker and
// must render with no server, no session and no database.
export const dynamic = "force-static";

export const metadata = { title: "Sin conexión · Proyectos" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-5 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">Sin conexión</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          El resto de la app necesita servidor, pero lo importante no: lo que anotes acá se guarda
          en el dispositivo y se sube apenas vuelva la señal.
        </p>
      </div>

      <OfflineCapture />
    </main>
  );
}
