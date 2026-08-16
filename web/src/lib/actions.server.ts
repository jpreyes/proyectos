"use server";

/**
 * Lo único que quedó en el servidor.
 *
 * Todo lo demás se escribe en el dispositivo, pero leer un .ics no se puede
 * hacer desde el navegador: es otro origen y casi ningún proveedor manda
 * cabeceras CORS. Además da igual intentarlo sin red — el calendario vive
 * afuera, sea de Google, de Microsoft o de un servidor cualquiera.
 *
 * Escribe `calendar_events`, que es cache de solo lectura; la réplica local se
 * entera por la suscripción en tiempo real o en la próxima bajada, sin que este
 * módulo tenga que saber nada del sincronizador.
 */

import type { CalendarFeed } from "./types";
import { requirePB } from "./pb.server";
import { syncFeed, syncStaleFeeds } from "./ics";

/** Relee todos los calendarios activos. Es el botón "Leer calendarios". */
export async function syncCalendarFeeds(): Promise<void> {
  const pb = await requirePB();
  const feeds = await pb.collection("calendar_feeds").getFullList<CalendarFeed>({ sort: "label" });
  for (const feed of feeds) {
    if (feed.active) await syncFeed(pb, feed);
  }
}

/**
 * Refresco perezoso: si el .ics lleva más de seis horas sin mirarse, se vuelve
 * a leer al abrir el calendario. No hay proceso aparte que mantener vivo.
 */
export async function refreshStaleFeeds(): Promise<void> {
  const pb = await requirePB();
  await syncStaleFeeds(pb, 6);
}
