"use client";

import { useRouter } from "next/navigation";
import { pbBrowser } from "@/lib/pb.client";
import { wipe } from "@/lib/local/sync";
import { Row } from "./ui";

/** Salir tiene que verse como cualquier otra fila de "Yo", o se lee como una alarma. */
export function LogoutRow() {
  const router = useRouter();

  async function logout() {
    // La réplica se va con la sesión. Es una copia completa de tus datos en el
    // disco del dispositivo: dejarla ahí después de salir se la entregaría a
    // la siguiente cuenta que entre en este mismo navegador.
    await wipe();

    const pb = pbBrowser();
    pb.authStore.clear();
    document.cookie = "pb_auth=; Path=/; Max-Age=0";
    router.replace("/login");
  }

  return (
    <button type="button" onClick={logout} className="block w-full text-left">
      <Row icon="⏻" iconTone="bad" label="Salir" chevron={false} />
    </button>
  );
}
