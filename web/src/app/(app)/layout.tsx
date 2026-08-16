"use client";

import { useMemo } from "react";
import { useCollection } from "@/lib/local/store";
import type { InboxItem } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { Rail, TabBar } from "@/components/Tabs";
import { CaptureBar } from "@/components/CaptureBar";
import { OfflineBadge } from "@/components/OfflineBadge";

/**
 * La cáscara. Es lo único que el servidor manda para cualquier pantalla de la
 * app: el resto lo dibuja el navegador con la réplica local. Eso es lo que
 * permite que abrir una vista sin red se vea igual que abrirla con red.
 *
 * El contador de la bandeja sale del mismo sitio que todo lo demás, así que
 * capturar algo lo mueve en el acto y sin recargar.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const inbox = useCollection<InboxItem>("inbox");
  const open = useMemo(() => inbox.filter((i) => i.status === "open").length, [inbox]);

  return (
    <AppShell>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 px-3 py-4 md:block">
          <Rail open={open} />
        </aside>

        {/* Una sola columna en ambos anchos. El layout viejo llegaba a 72rem,
            que en un notebook producía grillas de cuatro columnas que nadie
            lee de lado a lado; el punto de esta app es una lista corta y
            escaneable, y eso tiene un ancho natural. */}
        <main className="pb-tabbar mx-auto w-full min-w-0 max-w-3xl px-4 pt-5 md:px-8 md:pt-8">
          <CaptureBar open={open} />
          {children}
        </main>

        <TabBar open={open} />
        <OfflineBadge />
      </div>
    </AppShell>
  );
}
