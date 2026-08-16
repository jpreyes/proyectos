import { OfflineCapture } from "@/components/OfflineCapture";

// Fully static on purpose: this page is precached by the service worker and
// must render with no server, no session and no database.
export const dynamic = "force-static";

export const metadata = { title: "Sin conexión · Proyectos" };

/**
 * El último recurso, y solo eso.
 *
 * El worker guarda una cáscara por forma de ruta, así que cualquier pantalla
 * cuya forma ya se visitó abre sin red y con tus datos, que están en el
 * dispositivo. Acá se llega únicamente cuando falta hasta la cáscara — una
 * sección que este navegador nunca abrió. Antes esta página era la puerta de
 * entrada de cualquier corte, lo que hacía ver un momento recuperable como si
 * la app se hubiera caído.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-5 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">
          De esta sección no hay copia
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          No hay red y esta sección nunca se abrió en este dispositivo. Las demás siguen
          funcionando completas —tus datos viven acá, no en el servidor— y lo que anotes en este
          cuadro se guarda igual y sube apenas vuelva la señal.
        </p>
      </div>

      <OfflineCapture />
    </main>
  );
}
