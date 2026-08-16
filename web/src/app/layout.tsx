import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Proyectos",
  description: "Gestor personal de proyectos",
  appleWebApp: {
    capable: true,
    title: "Proyectos",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Una por tema: sin elección explícita manda el sistema, y la barra del
  // navegador deja de ser un rectángulo oscuro sobre una app clara.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceef2" },
    { media: "(prefers-color-scheme: dark)", color: "#040a18" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // El script de abajo escribe `data-theme` antes de hidratar: es justamente
    // la diferencia que React no debe intentar corregir.
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-ink antialiased">
        {/* Primero de todo y bloqueante, para que la primera imagen ya venga en
            el tema correcto. Va en el body y no en el head porque necesita que
            las etiquetas de `theme-color` ya existan. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
