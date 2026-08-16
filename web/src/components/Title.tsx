"use client";

import { useEffect } from "react";

/**
 * El título de la pestaña.
 *
 * `export const metadata` solo existe en componentes de servidor, y ya no queda
 * ninguno entre las pantallas. Esto es el reemplazo honesto: una línea por
 * página, sin fingir que hay renderizado en el servidor donde no lo hay.
 */
export function Title({ children }: { children: string }) {
  useEffect(() => {
    document.title = `${children} · Proyectos`;
  }, [children]);
  return null;
}
