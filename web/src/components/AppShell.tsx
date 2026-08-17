"use client";

/**
 * El portero y el arranque.
 *
 * Dos cosas que antes hacía el servidor y ahora tienen que ocurrir en el
 * dispositivo:
 *
 *   1. **La sesión.** `requirePB()` mandaba a /login cuando no había cookie.
 *      Eso no puede seguir viviendo en el servidor: sin red no hay servidor, y
 *      una app local-first que exige preguntar antes de mostrarte tus propios
 *      datos no es local-first. El token está guardado acá; se valida acá.
 *
 *   2. **La réplica.** Cargarla desde IndexedDB toma milisegundos, pero no cero,
 *      y pintar la app con las colecciones vacías durante ese instante se ve
 *      como si hubieras perdido todo. Por eso hay una pantalla de arranque, y
 *      por eso es lo más sobria posible: aparece y desaparece.
 *
 * La única espera de verdad es la primera vez en un dispositivo nuevo, cuando
 * todavía no hay nada que replicar. Ahí sí hace falta la red, y se dice.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pbBrowser } from "@/lib/pb.client";
import { runSeries } from "@/lib/local/recurring";
import { boot, getSyncState, subscribeSync } from "@/lib/local/sync";
import { useCollection, useReady } from "@/lib/local/store";
import * as store from "@/lib/local/store";
import { setHomeCurrency } from "@/lib/money";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ready = useReady();
  const [authed, setAuthed] = useState<boolean | null>(null);

  // La moneda base se fija acá, una vez, para toda la app: los formateadores de
  // `lib/money.ts` los llaman treinta componentes que no tienen acceso a la
  // configuración, y pasársela por parámetro a cada uno sería ruido en cada
  // llamada para un dato que cambia una vez al año.
  const settings = useCollection<{ default_currency?: string }>("settings");
  setHomeCurrency(settings[0]?.default_currency);
  const [synced, setSynced] = useState(() => getSyncState().lastSync !== null);

  useEffect(() => {
    const pb = pbBrowser();

    if (!pb.authStore.isValid) {
      setAuthed(false);
      router.replace("/login");
      return;
    }

    setAuthed(true);
    void boot();

    // Si el token caduca mientras la app está abierta, el sincronizador empieza
    // a recibir 401 y no hay forma de arreglarlo desde adentro.
    const off = pb.authStore.onChange(() => {
      if (!pb.authStore.isValid) router.replace("/login");
    });

    const offSync = subscribeSync(() => setSynced(getSyncState().lastSync !== null));
    return () => {
      off();
      offSync();
    };
  }, [router]);

  if (authed === false) return <Splash text="Entrando…" />;
  if (!ready) return <Splash text="Abriendo…" />;

  // Dispositivo nuevo: no hay nada que mostrar todavía. Es el único momento en
  // que esta app necesita la red, y por eso es lo único que se dice.
  const empty = !store.all("settings").length && !store.all("projects").length;
  if (empty && !synced) return <Splash text="Preparando la app…" wait />;

  return (
    <>
      <RecurringKeeper />
      {children}
    </>
  );
}

/**
 * Las recurrencias, al día.
 *
 * Una serie no guarda movimientos: los fabrica, y alguien tiene que pasar a
 * fabricarlos. Se hace acá y no en un hook del servidor por lo mismo que todo
 * lo demás de esta app — el dispositivo es el que tiene los datos y el que se
 * abre— y con un efecto atado a la colección, no con un temporizador: así corre
 * al abrir, al crear una serie y también cuando la serie la creaste en el otro
 * dispositivo y acaba de llegar por la bajada.
 *
 * Materializar es idempotente y barato: lo que ya existe se salta por id.
 */
function RecurringKeeper() {
  const series = useCollection("entry_series");

  useEffect(() => {
    void runSeries();
  }, [series]);

  return null;
}

function Splash({ text, wait }: { text: string; wait?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <p className="text-[15px] text-muted">{text}</p>
        {wait && <p className="mt-2 text-[13px] text-faint">Solo la primera vez.</p>}
      </div>
    </div>
  );
}
