"use client";

import { AppShell } from "@/components/AppShell";

/**
 * Las vistas imprimibles viven fuera de `(app)`: sin barra lateral, sin captura,
 * sin navegación. Lo que se ve en pantalla es exactamente lo que sale en el PDF,
 * que es la única forma de que imprimir no dé sorpresas.
 *
 * La sesión se exige igual, y por el mismo portero que el resto — así el
 * documento también se puede abrir e imprimir sin conexión, que es justo lo que
 * uno necesita cuando está en la obra y hay que mostrar el presupuesto.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="min-h-screen bg-neutral-200 py-6 print:bg-white print:py-0">{children}</div>
    </AppShell>
  );
}
