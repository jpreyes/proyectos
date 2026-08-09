"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { pbBrowser } from "@/lib/pb.client";
import { btn, inputClass, Field } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
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
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xs rounded-lg border border-line bg-panel px-5 py-6"
      >
        <h1 className="text-lg font-semibold tracking-tight">Proyectos</h1>
        <p className="mt-0.5 mb-5 text-[13px] text-muted">Sistema personal de gestión.</p>

        <div className="space-y-3">
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

        {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}

        <button type="submit" disabled={busy} className={`${btn("primary")} mt-5 w-full`}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
