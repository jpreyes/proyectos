import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

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
  themeColor: "#040a18",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-bg text-ink antialiased">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
