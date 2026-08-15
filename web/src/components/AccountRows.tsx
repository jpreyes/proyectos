"use client";

import { useRouter } from "next/navigation";
import { pbBrowser } from "@/lib/pb.client";
import { Row } from "./ui";

/** Sign-out has to look like every other row on "Yo", or it reads as a warning. */
export function LogoutRow() {
  const router = useRouter();

  function logout() {
    const pb = pbBrowser();
    pb.authStore.clear();
    document.cookie = "pb_auth=; Path=/; Max-Age=0";
    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} className="block w-full text-left">
      <Row icon="⏻" iconTone="bad" label="Salir" chevron={false} />
    </button>
  );
}
