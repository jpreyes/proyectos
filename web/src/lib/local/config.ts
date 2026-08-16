"use client";

import { useMemo } from "react";
import { buildConfig, type Config, type Settings, type TaxRow } from "../config";
import { useCollection } from "./store";

/**
 * El mismo `Config` que antes armaba el servidor, ahora desde la réplica.
 *
 * Vale la pena notar lo que esto arregla de paso: al ser reactivo, renombrar un
 * tipo de proyecto en Configuración se ve en toda la app en el mismo instante,
 * sin recargar y sin revalidar rutas.
 */
export function useConfig(): Config {
  const rows = useCollection<TaxRow & { id: string }>("taxonomy");
  const settings = useCollection<Settings & { id: string }>("settings");

  return useMemo(() => buildConfig(rows as TaxRow[], settings[0] || null), [rows, settings]);
}
