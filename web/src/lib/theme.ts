/**
 * Claro, oscuro o lo que diga el sistema.
 *
 * Dos decisiones que vale la pena dejar escritas:
 *
 * **Vive en el dispositivo, no en la cuenta.** Es la única preferencia de la
 * app que no se sincroniza. El teléfono a las once de la noche y el monitor de
 * la oficina a mediodía no quieren lo mismo, y hacer que elegir claro en uno
 * apague el otro sería un sincronizado que nadie pidió. Por eso va en
 * `localStorage` y no en `settings`.
 *
 * **Se aplica antes de pintar.** Si esperara a React, la primera imagen de cada
 * carga sería la del tema equivocado — el famoso destello blanco, que en una
 * app que se abre veinte veces al día se nota veinte veces. De ahí que exista
 * `THEME_SCRIPT`: un script mínimo y bloqueante en el `<head>` que pone el
 * atributo antes del primer píxel. Cuesta menos que una fuente.
 */

export type ThemePref = "system" | "light" | "dark";

export const THEME_KEY = "theme";

/** Lo que pinta la barra de estado del navegador y del sistema en la PWA. */
const BAR_COLOR = { dark: "#040a18", light: "#eceef2" } as const;

export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "Automático" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
];

function isPref(value: unknown): value is ThemePref {
  return value === "system" || value === "light" || value === "dark";
}

export function getTheme(): ThemePref {
  if (typeof localStorage === "undefined") return "system";
  const raw = localStorage.getItem(THEME_KEY);
  return isPref(raw) ? raw : "system";
}

/** El tema que se ve de verdad, ya resueltas las preferencias del sistema. */
export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  if (typeof matchMedia === "undefined") return "dark";
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Deja el documento en el tema pedido.
 *
 * En "automático" se **quita** el atributo en vez de escribir el tema resuelto:
 * así manda la media query de la hoja de estilos y el cambio de tema del
 * sistema se ve en el acto, sin que la app tenga que escuchar nada.
 */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);

  const color = BAR_COLOR[resolveTheme(pref)];
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    // Next declara dos, una por media query. Con una elección explícita esas
    // condiciones ya no aplican y hay que sacarlas o ganaría la del sistema.
    if (pref === "system") continue;
    meta.removeAttribute("media");
    meta.content = color;
  }
}

const listeners = new Set<(pref: ThemePref) => void>();

export function setTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // modo privado antiguo: el tema vale para esta sesión y no se recuerda
  }
  applyTheme(pref);
  for (const fn of listeners) fn(pref);
}

export function subscribeTheme(fn: (pref: ThemePref) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * El script que corre antes del primer pintado. Se inyecta tal cual en el
 * `<head>`, así que es JavaScript plano, corto y a prueba de excepciones: si
 * algo falla, la app se queda en oscuro, que es el tema por defecto.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].removeAttribute("media");m[i].content=t==="light"?"${BAR_COLOR.light}":"${BAR_COLOR.dark}";}}}catch(e){}})();`;
