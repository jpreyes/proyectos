"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { pbBrowser } from "@/lib/pb.client";
import { btn, inputClass, Field } from "@/components/ui";

export default function LoginRoute() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}

function LoginPage() {
  const router = useRouter();
  // Se llega acá con ?listo=1 después de cambiar la contraseña: sin ese aviso,
  // la pantalla de entrar se ve igual que si el cambio hubiera fallado.
  const justReset = useSearchParams().get("listo") === "1";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const identity = String(form.get("identity") || "");
    const password = String(form.get("password") || "");

    try {
      await pbBrowser().collection("users").authWithPassword(identity, password);
      router.replace("/");
      router.refresh();
    } catch {
      setError("Credenciales incorrectas.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-3xl bg-panel px-6 py-7">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">Proyectos</h1>
        <p className="mb-6 mt-1 text-[15px] text-faint">Sistema personal de gestión.</p>

        <div className="space-y-3.5">
          <Field label="Correo">
            <input
              name="identity"
              type="email"
              autoComplete="username"
              required
              autoFocus
              className={inputClass}
            />
          </Field>
          <Field label="Contraseña">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </Field>
        </div>

        {justReset && !error && (
          <p className="mt-4 text-[15px] text-accent">
            Contraseña cambiada. Entra con la nueva.
          </p>
        )}
        {error && <p className="mt-4 text-[15px] text-bad">{error}</p>}

        <button type="submit" disabled={busy} className={`${btn("primary")} mt-6 w-full`}>
          {busy ? "Entrando…" : "Entrar"}
        </button>

        <Link
          href="/recuperar"
          className="mt-4 block text-center text-[13px] text-faint transition-colors hover:text-ink"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </main>
  );
}
