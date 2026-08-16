"use client";

/**
 * Cuándo, leído de lo que escribiste.
 *
 * "Llamar a Juan el viernes" trae una fecha adentro; obligarte a repetirla en
 * un selector es justo el paso de más que hace que anotar deje de ser natural.
 *
 * Es deliberadamente corto y conservador. No intenta entender la frase: busca
 * un puñado de formas inequívocas de decir un día y, ante la duda, no devuelve
 * nada — una fecha inventada es peor que ninguna, porque la descubres el día
 * que no llegaste. Lo que encuentra se muestra siempre en un botón que dice qué
 * entendió, así que nunca hay una fecha puesta a tus espaldas.
 *
 * El texto no se toca: la tarea conserva la frase completa. Recortarle "el
 * viernes" al título ahorraría dos palabras y a cambio te dejaría dudando de si
 * la app entendió bien.
 */

const DAY_MS = 86_400_000;

/** Lunes = 1 … domingo = 0, como getUTCDay(). */
const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export interface When {
  /** "YYYY-MM-DD" */
  date: string;
  /** Cómo se le muestra al usuario: "hoy", "mañana", "vie 21", "20 mar". */
  label: string;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function todayUTC(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function short(ms: number): string {
  return new Date(ms)
    .toLocaleDateString("es-CL", {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
    })
    .replace(".", "");
}

/** Quita acentos y baja a minúscula, para comparar sin pelear con la tilde. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
}

/**
 * La fecha que menciona el texto, o null si no menciona ninguna con claridad.
 */
export function parseWhen(text: string): When | null {
  const t = fold(` ${text} `);
  const today = todayUTC();

  if (/\bhoy\b/.test(t)) return { date: iso(today), label: "hoy" };
  if (/\bpasado manana\b/.test(t)) return { date: iso(today + 2 * DAY_MS), label: "pasado mañana" };
  // "mañana" también significa "por la mañana": solo cuenta cuando no viene
  // precedida de un artículo o preposición que la vuelva la parte del día.
  if (/\bmanana\b/.test(t) && !/\b(la|de|por|en|esta|toda) manana\b/.test(t)) {
    return { date: iso(today + DAY_MS), label: "mañana" };
  }

  // "en 3 días", "en 2 semanas"
  const relative = /\ben (\d{1,3}) (dias?|semanas?)\b/.exec(t);
  if (relative) {
    const n = Number(relative[1]);
    const ms = today + n * (relative[2].startsWith("semana") ? 7 : 1) * DAY_MS;
    return { date: iso(ms), label: short(ms) };
  }

  // "el viernes", "este viernes", "próximo viernes"
  const weekday = /\b(?:el |este |proximo |prox )?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/.exec(
    t
  );
  if (weekday) {
    const target = WEEKDAYS[weekday[1]];
    const current = new Date(today).getUTCDay();
    // Hoy mismo cuenta: quien dice "el viernes" un viernes se refiere a hoy.
    const ahead = (target - current + 7) % 7;
    const ms = today + ahead * DAY_MS;
    return { date: iso(ms), label: ahead === 0 ? "hoy" : short(ms) };
  }

  // "el 20 de marzo", "20 de marzo"
  const dayMonth = /\b(?:el )?(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.exec(
    t
  );
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = MONTHS[dayMonth[2]];
    if (day >= 1 && day <= 31) return onOrAfter(today, month, day);
  }

  // "20/3", "20-03", "20/03/2026"
  const numeric = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(t);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      if (numeric[3]) {
        const raw = Number(numeric[3]);
        const year = raw < 100 ? 2000 + raw : raw;
        const ms = Date.UTC(year, month - 1, day);
        return { date: iso(ms), label: short(ms) };
      }
      return onOrAfter(today, month, day);
    }
  }

  return null;
}

/**
 * El mismo día y mes, en el año que todavía no pasó. Sin esto, escribir "el 20
 * de marzo" en abril agenda algo para el pasado, que no ayuda a nadie.
 */
function onOrAfter(today: number, month: number, day: number): When {
  const year = new Date(today).getUTCFullYear();
  let ms = Date.UTC(year, month - 1, day);
  if (ms < today) ms = Date.UTC(year + 1, month - 1, day);
  return { date: iso(ms), label: short(ms) };
}
