"use client";

import PocketBase from "pocketbase";

let client: PocketBase | null = null;

/**
 * Browser client. Base URL is the current origin — cloudflared (prod) and the
 * Next rewrite (dev) both send /api to PocketBase, so there is never a
 * cross-origin request and the session cookie rides along automatically.
 */
export function pbBrowser(): PocketBase {
  if (client) return client;

  const base = process.env.NEXT_PUBLIC_PB_URL || window.location.origin;
  const pb = new PocketBase(base);
  pb.authStore.loadFromCookie(document.cookie);

  pb.authStore.onChange(() => {
    document.cookie = pb.authStore.exportToCookie({
      httpOnly: false,
      secure: window.location.protocol === "https:",
      sameSite: "Lax",
      path: "/",
    });
  });

  client = pb;
  return pb;
}
