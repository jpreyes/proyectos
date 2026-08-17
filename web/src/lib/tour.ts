/**
 * La guía de primer ingreso.
 *
 * Existe porque la app es opinada: cuatro destinos que no se llaman como en
 * ninguna otra herramienta, una bandeja que obliga a decidir, un calendario que
 * mide horas por semana y no bloques con hora. Nada de eso se adivina mirando
 * la pantalla, y explicarlo con texto en cada vista sería agregar ruido
 * permanente para resolver un problema que dura cinco minutos.
 *
 * Reglas que la mantienen honesta:
 *
 * - **Se salta con un toque y no vuelve.** Una guía que insiste es un anuncio.
 * - **Señala cosas reales.** Cada paso ilumina un elemento que existe en la
 *   pantalla (`data-tour="…"`), no una captura de pantalla dibujada aparte que
 *   se desactualiza al primer cambio de diseño.
 * - **Si el elemento no está, el paso igual se muestra**, centrado y sin foco.
 *   Vale para una pantalla vacía o un ancho distinto; lo que no puede pasar es
 *   que la guía se quede colgada esperando algo que no va a aparecer.
 */

export type TourStep = {
  /** Ruta donde vive el paso. La guía navega sola antes de mostrarlo. */
  route: string;
  /** Valor de `data-tour` del elemento a iluminar. Sin esto, tarjeta al centro. */
  anchor?: string;
  title: string;
  body: string;
};

export const TOUR: readonly TourStep[] = [
  {
    route: "/",
    title: "Esto no es donde trabajas",
    body:
      "El trabajo sigue viviendo en tus carpetas, repos y planillas. Esta app es el índice: " +
      "el lugar donde recuperas el contexto de cualquier encargo en treinta segundos. " +
      "Para que se entienda, ya viene con un encargo de ejemplo cargado — y se borra entero " +
      "cuando quieras.",
  },
  {
    route: "/",
    anchor: "nav",
    title: "Cinco destinos, no diez",
    body:
      "Hoy es qué hacer ahora. Bandeja es lo que anotaste y no has decidido. Asistente ordena " +
      "lo que le cuentes y contesta sobre lo que tienes anotado. Trabajo son tus encargos. Yo " +
      "es todo lo demás: calendario, presupuestos, finanzas y ajustes. No hay más mapa que " +
      "memorizar.",
  },
  {
    route: "/",
    anchor: "today-stats",
    title: "Hoy junta todo lo que tiene plazo",
    body:
      "Tareas, plazos de encargos y plata por cobrar se funden en una sola lista con fecha y " +
      "distancia. Lo vencido no se esconde, y lo que no tiene fecha aparece igual más abajo: " +
      "nada de lo que anotes queda invisible.",
  },
  {
    route: "/",
    anchor: "capture",
    title: "Anota primero, decide después",
    body:
      "Una sola línea, sin elegir dónde va. Se guarda en el dispositivo aunque no haya señal " +
      "y sube sola cuando vuelve. En el teléfono es el botón + junto a la barra.",
  },
  {
    route: "/inbox",
    anchor: "inbox-open",
    title: "La bandeja se vacía de a un toque",
    body:
      "Cada cosa anotada sale de acá convertida en algo: tarea, algo para hoy, o un descarte " +
      "explícito, que también es una decisión. El proyecto es opcional. Si escribiste una " +
      "fecha en la frase, la app te la propone.",
  },
  {
    route: "/w",
    anchor: "work-list",
    title: "Cada encargo guarda su reentrada",
    body:
      "Adentro está el mapa de dónde vive cada cosa, la bitácora de lo que pasó, sus " +
      "pendientes, sus horas comprometidas y sus presupuestos. Arriba del todo, siempre, " +
      "el plan para retomarlo: «cuando pase X, entonces Y».",
  },
  {
    route: "/yo",
    anchor: "yo-menu",
    title: "Lo que no se abre todos los días",
    body:
      "Calendario mide horas por semana entre dos fechas, no bloques con hora: la pregunta " +
      "que responde es si algo cabe. Presupuestos emite el documento y, al aprobarlo, crea " +
      "el encargo, reserva las horas y deja el ingreso proyectado.",
  },
  {
    route: "/configuracion",
    anchor: "settings-start",
    title: "Dos cosas antes de empezar",
    body:
      "Acá eliges el tema —claro, oscuro o el del sistema—, escribes tus datos para el " +
      "encabezado de los presupuestos, y borras los datos de ejemplo cuando ya no te sirvan. " +
      "Puedes volver a ver esta guía desde el mismo lugar.",
  },
] as const;

/** Evento con el que Configuración vuelve a lanzar la guía. */
export const TOUR_START_EVENT = "tour:start";

export function startTour(): void {
  window.dispatchEvent(new CustomEvent(TOUR_START_EVENT));
}
