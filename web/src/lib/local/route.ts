"use client";

import { usePathname } from "next/navigation";

/**
 * El id de la ruta, leído de la URL y no de los parámetros del enrutador.
 *
 * Parece un rodeo y no lo es. Ahora que cada pantalla se dibuja con datos
 * locales, la cáscara HTML de `/w/abc` y la de `/w/def` son idénticas, y el
 * service worker aprovecha eso: guarda **una** cáscara por forma de ruta y la
 * sirve para cualquier id cuando no hay red. Eso permite abrir sin conexión un
 * proyecto que nunca habías visitado en este dispositivo.
 *
 * Pero `useParams()` no lee la URL: lee el árbol que vino en la respuesta del
 * servidor. Con una cáscara prestada, devolvería el id del otro proyecto.
 * `usePathname()` sí refleja la dirección real de la barra.
 *
 * Sirve para las rutas dinámicas de la app, porque en todas el id es el segundo
 * segmento: /w/:id, /w/:id/editar, /finanzas/:id, /recurrentes/:id,
 * /presupuestos/:id, /presupuestos/:id/imprimir. Una ruta nueva con el id más
 * adentro tendría que traer su propio lector.
 */
export function useRouteId(): string {
  const pathname = usePathname();
  return pathname.split("/").filter(Boolean)[1] || "";
}
