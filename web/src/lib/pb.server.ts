import "server-only";
import PocketBase from "pocketbase";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const AUTH_COOKIE = "pb_auth";

/** Inside docker this is http://pocketbase:8090; in dev, localhost. */
export function pbBaseUrl(): string {
  return process.env.PB_URL_INTERNAL || "http://127.0.0.1:8090";
}

/**
 * A fresh client per request. The session arrives as the `pb_auth` cookie the
 * browser set at login; Next hands it to us already URL-decoded, so we parse it
 * ourselves instead of going through loadFromCookie().
 */
export async function pbServer(): Promise<PocketBase> {
  const pb = new PocketBase(pbBaseUrl());
  pb.autoCancellation(false);

  const raw = (await cookies()).get(AUTH_COOKIE)?.value;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { token?: string; record?: unknown; model?: unknown };
      if (parsed.token) {
        pb.authStore.save(parsed.token, (parsed.record ?? parsed.model ?? null) as never);
      }
    } catch {
      // malformed cookie -> treated as signed out
    }
  }

  return pb;
}

/** Use in every page under (app). Redirects to /login when the token is gone. */
export async function requirePB(): Promise<PocketBase> {
  const pb = await pbServer();
  if (!pb.authStore.isValid) redirect("/login");
  return pb;
}

/** Public URL of an uploaded file — same origin, so a plain path works. */
export function fileUrl(
  record: { collectionId?: string; collectionName?: string; id: string },
  filename: string
): string {
  const col = record.collectionId || record.collectionName;
  return `/api/files/${col}/${record.id}/${encodeURIComponent(filename)}`;
}
