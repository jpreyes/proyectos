"use client";

import { useEffect, useMemo, useState } from "react";
import type { Entry, Quote } from "@/lib/types";
import { pbBrowser } from "@/lib/pb.client";
import { useCollection } from "@/lib/local/store";
import { clpOf, formatCLPShort } from "@/lib/money";
import { YO_GROUPS } from "@/lib/nav";
import { Chip, Group, Row } from "@/components/ui";
import { LogoutRow } from "@/components/AccountRows";
import { Title } from "@/components/Title";

/**
 * Todo lo que no es el bucle diario. Seis destinos se volvieron una pestaña, y
 * la agrupación es la única señal de qué va con qué — no hay títulos de sección,
 * porque una pila de rótulos es justo el muro de opciones que esta pantalla
 * existe para reemplazar.
 */
export default function YoPage() {
  const entries = useCollection<Entry>("entries");
  const quotes = useCollection<Quote>("quotes");
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(null);

  // La cuenta sale del token, no de la réplica: es lo único que no es un dato
  // tuyo sino la sesión con la que los pediste.
  useEffect(() => {
    setUser(pbBrowser().authStore.record as { email?: string; name?: string } | null);
  }, []);

  const { receivableTotal, pending } = useMemo(
    () => ({
      receivableTotal: entries
        .filter(
          (e) => e.direction === "income" && (e.status === "invoiced" || e.status === "committed")
        )
        .reduce((s, e) => s + clpOf(e), 0),
      pending: quotes.filter((q) => q.status === "pending").length,
    }),
    [entries, quotes]
  );

  return (
    <>
      <Title>Yo</Title>
      <header className="mb-6 px-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">{user?.name || "Yo"}</h1>
        <p className="mt-1 truncate text-[15px] text-faint">{user?.email}</p>
      </header>

      {/* Dos números que vale la pena mirar de reojo, y cada uno es una entrada. */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Chip
          href="/finanzas"
          icon="▲"
          tone={receivableTotal > 0 ? "warn" : "neutral"}
          value={formatCLPShort(receivableTotal)}
          label="por cobrar"
        />
        <Chip
          href="/presupuestos"
          icon="▧"
          tone={pending > 0 ? "accent" : "neutral"}
          value={pending}
          label={pending === 1 ? "presupuesto enviado" : "presupuestos enviados"}
        />
      </div>

      <div data-tour="yo-menu">
        {YO_GROUPS.map((group) => (
          <Group key={group[0].href}>
            {group.map((item) => (
              <Row key={item.href} href={item.href} icon={item.icon} label={item.label} />
            ))}
          </Group>
        ))}
      </div>

      {/* Acá vivía un acceso directo al panel de administración de la base. Era
          una puerta de servicio útil mientras esto tenía un solo usuario, y deja
          de serlo en cuanto tiene varios: ofrece a cualquiera una pantalla que
          no es de la app, con el vocabulario de la base y sin sus reglas de
          presentación. El panel sigue donde siempre para quien lo administra. */}
      <Group>
        <LogoutRow />
      </Group>
    </>
  );
}
