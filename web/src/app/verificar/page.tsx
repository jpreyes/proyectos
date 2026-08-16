"use client";

/**
 * Confirmar la dirección de correo.
 *
 * Misma razón que `/recuperar`: el enlace del correo llevaba al panel de la
 * base, que ya no está en internet. Acá no hay nada que escribir —el token lo
 * dice todo— así que la página hace el trabajo sola y solo informa cómo salió.
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { pbBrowser } from "@/lib/pb.client";
import { btn } from "@/components/ui";

export default function VerifyRoute() {
  return (
    <Suspense fallback={null}>
      <VerifyPage />
    </Suspense>
  );
}

function VerifyPage() {
  const [state, setState] = useState<"busy" | "ok" | "error">("busy");

  useEffect(() => {
    // El token se lee de la barra de direcciones y no con `useSearchParams`
    // porque esta pantalla puede abrirse desde una cáscara guardada por el
    // service worker, que trae el árbol de otra visita. (Ver lib/local/route.ts.)
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) {
      setState("error");
      return;
    }
    pbBrowser()
      .collection("users")
      .confirmVerification(token)
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-panel px-6 py-7 text-center">
        {state === "busy" && <p className="text-[15px] text-muted">Confirmando…</p>}

        {state === "ok" && (
          <>
            <h1 className="text-[24px] font-bold leading-tight tracking-tight">Correo confirmado</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Listo. Tu dirección quedó verificada.
            </p>
            <Link href="/" className={`${btn("primary")} mt-6 w-full`}>
              Ir a la app
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="text-[24px] font-bold leading-tight tracking-tight">
              Ese enlace ya no sirve
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Los enlaces de confirmación vencen. Entra a la app y pide uno nuevo desde tu cuenta.
            </p>
            <Link href="/login" className={`${btn("subtle")} mt-6 w-full`}>
              Entrar
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
