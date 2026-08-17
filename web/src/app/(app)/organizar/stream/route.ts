/**
 * El asistente responde por streaming, y no por lucimiento.
 *
 * Cloudflare corta la conexión con el origen si no ve la **primera** respuesta
 * en unos 100 segundos, y devuelve su propio 524 — una página de error ajena en
 * vez del mensaje de esta app. Medido: un volcado de ocho cosas tarda 13
 * segundos con `gpt-5.6-luna` y **101 con `deepseek-v4-flash`**, que razona antes
 * de contestar. O sea, justo encima de la raya.
 *
 * El primer intento fue rendirse antes que el túnel (85 s de tope) y declarar
 * que el modelo lento "no servía". Estaba mal: el modelo termina, y su plan es
 * mejor. Lo que había que arreglar era el transporte.
 *
 * Así que esto empieza a escribir de inmediato y sigue latiendo cada diez
 * segundos hasta que el plan está listo. El límite de Cloudflare es al primer
 * byte, no al último, así que con bytes en vuelo la petición puede durar lo que
 * tenga que durar. La última línea es el resultado; las anteriores son saltos de
 * línea sin contenido.
 *
 * Dos detalles que hacen que esto funcione de verdad y son fáciles de perder:
 *
 * - **`X-Accel-Buffering: no`.** nginx bufferea las respuestas del upstream por
 *   omisión, y un buffer se traga los latidos: el túnel no vería nada hasta el
 *   final y estaríamos exactamente donde empezamos. Esta cabecera es la forma
 *   estándar de apagarlo por respuesta, sin tocar `vps/nginx.conf` ni afectar al
 *   resto del sitio.
 * - **No vive bajo `/api/`.** Ese prefijo es de PocketBase, tanto en el nginx
 *   del VPS como en el rewrite de `next.config.ts`: una ruta ahí no llegaría
 *   nunca a Next. Por eso cuelga de `/organizar/`.
 *
 * (Y por eso no es un server action: uno no puede empezar a responder antes de
 * tener el valor de retorno.)
 */

import { callProvider, type ProposeInput } from "@/lib/organize/call";
import type { ProposeResult } from "@/lib/organize/plan";

export const dynamic = "force-dynamic";

/** Cada cuánto se manda un byte para que nadie crea que esto se murió. */
const HEARTBEAT_MS = 10_000;

export async function POST(request: Request): Promise<Response> {
  let input: ProposeInput;
  try {
    input = (await request.json()) as ProposeInput;
  } catch {
    return json({ ok: false, error: "La petición no venía bien formada." });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Un byte enseguida: es lo que impide el 524.
      controller.enqueue(encoder.encode("\n"));

      const beat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("\n"));
        } catch {
          // la conexión ya se cerró; el clearInterval de abajo se encarga
        }
      }, HEARTBEAT_MS);

      let result: ProposeResult;
      try {
        result = await callProvider(input);
      } catch {
        // Nunca se cierra el stream sin una última línea: un cuerpo que termina
        // en puros latidos deja al cliente sin nada que parsear y sin saber por
        // qué.
        result = { ok: false, error: "Algo falló en el servidor al armar el plan." };
      } finally {
        clearInterval(beat);
      }

      controller.enqueue(encoder.encode(`${JSON.stringify(result)}\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

function json(result: ProposeResult): Response {
  return new Response(`${JSON.stringify(result)}\n`, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
