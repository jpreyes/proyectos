"use client";

/**
 * Recuperar la contraseña, entera dentro de la app.
 *
 * El correo que manda PocketBase apuntaba por defecto a `/_/#/auth/...`, o sea
 * al panel de administración de la base. Eso funcionaba mientras el panel
 * estaba publicado en internet; ahora que no lo está, ese enlace lleva a un 404
 * — y aunque llevara a alguna parte, sería mandar a alguien a una pantalla que
 * no es la suya, en inglés y con el vocabulario de la base.
 *
 * Son dos momentos en una sola ruta, distinguidos por si viene un token:
 *
 *   /recuperar          → "escribe tu correo y te mandamos el enlace"
 *   /recuperar?token=…  → "escribe tu contraseña nueva"
 *
 * Vive fuera de `(app)` a propósito: quien llega acá no tiene sesión, así que
 * no puede pasar por el portero que exige una.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { pbBrowser } from "@/lib/pb.client";
import { btn, Field, inputClass } from "@/components/ui";

export default function RecoverRoute() {
  return (
    <Suspense fallback={null}>
      <RecoverPage />
    </Suspense>
  );
}

function RecoverPage() {
  const token = useSearchParams().get("token") || "";
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-panel px-6 py-7">
        {token ? <NewPassword token={token} /> : <AskForLink />}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------- el envío --- */

function AskForLink() {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy");
    const email = String(new FormData(e.currentTarget).get("email") || "");

    try {
      await pbBrowser().collection("users").requestPasswordReset(email);
    } catch {
      // Da igual si falló: la respuesta es la misma.
    }
    // Nunca se dice si esa dirección tiene cuenta o no. Decirlo convierte este
    // formulario en una forma de averiguar quién está registrado.
    setState("sent");
  }

  if (state === "sent") {
    return (
      <>
        <h1 className="text-[24px] font-bold leading-tight tracking-tight">Revisa tu correo</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Si esa dirección tiene una cuenta, le acaba de llegar un enlace para elegir una
          contraseña nueva. Vence en un par de horas.
        </p>
        <Link href="/login" className={`${btn("subtle")} mt-6 w-full`}>
          Volver a entrar
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <h1 className="text-[24px] font-bold leading-tight tracking-tight">
        ¿Olvidaste tu contraseña?
      </h1>
      <p className="mb-6 mt-1 text-[15px] text-faint">
        Escribe tu correo y te mandamos un enlace para cambiarla.
      </p>

      <Field label="Correo">
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className={inputClass}
        />
      </Field>

      <button type="submit" disabled={state === "busy"} className={`${btn("primary")} mt-6 w-full`}>
        {state === "busy" ? "Enviando…" : "Enviar el enlace"}
      </button>
      <Link href="/login" className={`${btn("ghost")} mt-2 w-full`}>
        Volver
      </Link>
    </form>
  );
}

/* -------------------------------------------------------- la contraseña --- */

function NewPassword({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");

    if (password !== confirm) {
      setError("Las dos contraseñas no son iguales.");
      return;
    }
    if (password.length < 8) {
      setError("Al menos ocho caracteres.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await pbBrowser().collection("users").confirmPasswordReset(token, password, confirm);
      router.replace("/login?listo=1");
    } catch {
      // El único fallo probable es un enlace vencido o ya usado, y decirlo así
      // ahorra el rato de probar contraseñas creyendo que el problema es otro.
      setError("Ese enlace ya no sirve. Pide uno nuevo y vuelve a intentarlo.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h1 className="text-[24px] font-bold leading-tight tracking-tight">Elige una contraseña</h1>
      <p className="mb-6 mt-1 text-[15px] text-faint">Con ocho caracteres basta, pero que no sea la de siempre.</p>

      <div className="space-y-3.5">
        <Field label="Contraseña nueva">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            className={inputClass}
          />
        </Field>
        <Field label="Otra vez">
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            className={inputClass}
          />
        </Field>
      </div>

      {error && <p className="mt-4 text-[15px] text-bad">{error}</p>}

      <button type="submit" disabled={busy} className={`${btn("primary")} mt-6 w-full`}>
        {busy ? "Guardando…" : "Guardar y entrar"}
      </button>
      <Link href="/recuperar" className={`${btn("ghost")} mt-2 w-full`}>
        Pedir otro enlace
      </Link>
    </form>
  );
}
