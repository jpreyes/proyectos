import "server-only";

/**
 * La llamada al modelo. Vive en el servidor por una sola razón: **la clave de la
 * API no puede tocar el navegador.** Next hornea toda variable `NEXT_PUBLIC_*`
 * en el bundle público y la app replica `settings` entera en cada dispositivo,
 * así que no hay ningún lugar del cliente donde una clave esté guardada y no
 * publicada.
 *
 * Lo que esta función NO hace, a propósito:
 *
 * - **No escribe nada.** Devuelve un plan; aplicarlo es cosa del cliente, por
 *   las mismas escrituras locales que usa el resto de la app. Si escribiera
 *   contra PocketBase con un token de servicio, la réplica del dispositivo
 *   quedaría atrasada hasta la próxima bajada y se perdería lo que hace que esta
 *   app funcione sin red.
 * - **No decide nada.** Todo pasa por `sanitizePlan` antes de salir de acá, y
 *   otra vez antes de aplicarse. Un modelo de lenguaje es una fuente de datos no
 *   confiable, como cualquier formulario público.
 *
 * La sesión se verifica **contra PocketBase**, no leyendo la cookie: `pb_auth`
 * no es httpOnly y `authStore.isValid` solo mira la fecha de expiración del JWT,
 * no su firma. Sin esa llamada, cualquiera que sepa la URL podría gastar el plan
 * de la cuenta escribiendo una cookie a mano.
 */

import { pbServer } from "../pb.server";
import {
  ASSISTANT_MODELS,
  DEFAULT_ASSISTANT_MODEL,
  extractJSON,
  MAX_INPUT,
  type OrganizeContext,
  type ProposeResult,
  sanitizePlan,
} from "./plan";
import { correctionPrompt, systemPrompt } from "./prompt";

/**
 * El endpoint. Go y Zen son dos productos distintos de opencode y **no
 * comparten clave**: Go es una suscripción mensual con su propio catálogo (26
 * modelos), Zen es pago por uso (62). Tener clave de Zen no abre Go ni al
 * revés, así que cambiar de uno a otro es cambiar las dos cosas — por eso la
 * URL es variable de entorno y no una constante.
 *
 *   Go   https://opencode.ai/zen/go/v1
 *   Zen  https://opencode.ai/zen/v1
 */
const BASE_URL = process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/go/v1";

/**
 * Tres minutos, y ahora se puede.
 *
 * Antes eran 85 segundos por una razón externa: Cloudflare corta la conexión con
 * el origen si no ve la primera respuesta en ~100, y rendirse antes que el túnel
 * era lo único que mantenía el error dentro de la app. Desde que la respuesta va
 * en streaming (`app/(app)/organizar/stream/route.ts`) el túnel recibe bytes
 * desde el primer segundo y ese techo dejó de aplicar, así que el límite vuelve
 * a ser el razonable: lo que uno está dispuesto a esperar.
 *
 * Medido: un volcado de ocho cosas toma 13 s con `gpt-5.6-luna` y 101 s con
 * `deepseek-v4-flash`.
 */
const TIMEOUT_MS = 180_000;

/**
 * El techo de salida, y **cuenta el pensamiento**.
 *
 * Es la medición que más caro salió creerse a medias. `deepseek-v4-flash` razona
 * antes de contestar y esos tokens salen del mismo saco: con el volcado de ocho
 * cosas gastó **13.284** en total para un plan JSON de 1.686 caracteres. Con los
 * 8.000 que tenía esto al principio la respuesta llegaba cortada
 * —`finish_reason: "length"`— y el JSON truncado no parsea, así que el modelo
 * parecía roto cuando lo que estaba mal era el techo.
 */
const MAX_OUTPUT_TOKENS = 24_000;

/**
 * Un freno de mano por cuenta, en memoria.
 *
 * No es seguridad —se va con cada reinicio del contenedor y no sobrevive a un
 * segundo proceso—; es lo que impide que un bucle accidental en el cliente, o un
 * dedo impaciente, se coman la ventana del plan. Para una app de una persona
 * alcanza, y decirlo es más honesto que fingir una cuota real.
 */
const RATE = new Map<string, { last: number; day: string; count: number }>();
const MIN_GAP_MS = 3000;
const MAX_PER_DAY = 200;

function throttle(userId: string): string {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const seen = RATE.get(userId);

  if (!seen || seen.day !== today) {
    RATE.set(userId, { last: now, day: today, count: 1 });
    return "";
  }

  if (now - seen.last < MIN_GAP_MS) return "Espera un momento entre una consulta y otra.";
  if (seen.count >= MAX_PER_DAY) {
    return "Se alcanzó el tope de consultas del día. Vuelve mañana.";
  }

  seen.last = now;
  seen.count++;
  return "";
}

export interface ProposeInput {
  /** El volcado que escribió la persona. */
  text: string;
  /** El índice de la cuenta, armado en el cliente. Ver `lib/local/organize.ts`. */
  context: OrganizeContext;
  /** Modelo elegido en Configuración. Se valida contra la lista blanca. */
  model?: string;
  /** El plan anterior, cuando esto es una corrección. */
  previous?: string;
  /** La corrección en palabras de la persona. */
  correction?: string;
}

export async function callProvider(input: ProposeInput): Promise<ProposeResult> {
  const key = process.env.OPENCODE_API_KEY;
  if (!key) {
    return {
      ok: false,
      error:
        "El asistente no está configurado en el servidor: falta la clave de la API. " +
        "Se agrega como OPENCODE_API_KEY en el entorno del contenedor web.",
    };
  }

  /* 1. ¿hay sesión de verdad? */
  let userId = "";
  try {
    const pb = await pbServer();
    if (!pb.authStore.isValid) return { ok: false, error: "Tu sesión se cerró. Vuelve a entrar." };
    const auth = await pb.collection("users").authRefresh();
    userId = auth.record?.id || "";
  } catch {
    return { ok: false, error: "Tu sesión se cerró. Vuelve a entrar." };
  }
  if (!userId) return { ok: false, error: "Tu sesión se cerró. Vuelve a entrar." };

  const braked = throttle(userId);
  if (braked) return { ok: false, error: braked };

  /* 2. la petición */
  const text = String(input.text || "").slice(0, MAX_INPUT);
  const correction = String(input.correction || "").slice(0, 2000);
  if (!text.trim() && !correction.trim()) {
    return { ok: false, error: "No hay nada que ordenar." };
  }

  const model = ASSISTANT_MODELS.some((m) => m.value === input.model)
    ? (input.model as string)
    : DEFAULT_ASSISTANT_MODEL;

  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt(input.context) },
    { role: "user", content: text },
  ];

  if (correction && input.previous) {
    const previous = String(input.previous).slice(0, 20_000);
    messages.push({ role: "assistant", content: previous });
    messages.push({ role: "user", content: correctionPrompt(previous, correction) });
  }

  /* 3. la llamada */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let raw = "";
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, error: providerError(res.status, detail) };
    }

    const body = (await res.json()) as {
      choices?: { finish_reason?: string; message?: { content?: string } }[];
    };
    const choice = body?.choices?.[0];
    raw = choice?.message?.content || "";

    // Cortado por tope de tokens: el JSON viene a medias y no parsea. Merece su
    // propio mensaje, porque el remedio es acortar el texto y no "prueba de
    // nuevo", que fallaría igual.
    if (choice?.finish_reason === "length") {
      return {
        ok: false,
        error: "El texto dio para más de lo que cabe en una respuesta. Pártelo en dos y repite.",
      };
    }
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "El modelo se demoró más de tres minutos. Prueba con un texto más corto, o cambia de modelo en Configuración."
        : "No se pudo hablar con el modelo. Puede ser la red.",
    };
  } finally {
    clearTimeout(timer);
  }

  /* 4. la aduana */
  const parsed = extractJSON(raw);
  if (!parsed) {
    return { ok: false, error: "El modelo no devolvió un plan legible. Prueba de nuevo." };
  }

  const plan = sanitizePlan(parsed, input.context);
  return { ok: true, plan, raw: JSON.stringify(parsed) };
}

/** El error del proveedor, traducido a algo que se pueda leer bajo un botón. */
function providerError(status: number, detail: string): string {
  if (status === 401 || status === 403) {
    return "La clave de la API no sirve o no tiene permiso. Revísala en el servidor.";
  }
  if (status === 402) return "La cuenta de opencode se quedó sin créditos.";
  if (status === 404) {
    return "Ese modelo no está en el catálogo de tu plan de opencode. Cámbialo en Configuración.";
  }
  // En Go el 429 casi nunca es "muy rápido": es el tope del plan, que se mide
  // por ventanas ($12 cada 5 horas, $30 semanales). Decir solo "espera un
  // momento" mandaría a reintentar durante horas.
  if (status === 429) {
    return "Demasiadas consultas seguidas, o se llegó al tope de tu plan de opencode.";
  }
  if (status >= 500) return "El proveedor está caído. No es tu app.";
  return `El proveedor rechazó la consulta (${status}). ${detail}`.trim();
}
