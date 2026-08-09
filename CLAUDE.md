# CLAUDE.md — proyectos

## Qué es

Gestor personal de proyectos de **un solo usuario**, desplegado en `proyectos.jpreyes.cl`.
No es una plataforma para *hacer* el trabajo: el trabajo vive afuera (carpetas, repos,
Overleaf, planillas). Esta app es el **índice y el punto de reentrada** — el lugar donde
recuperas el contexto de cualquier proyecto en 30 segundos, y donde viven la gestión,
las finanzas y los pendientes de todos los dominios a la vez: estructural, inspección,
investigación, docencia, empresa, software, personal.

**Idioma:** identificadores (archivos, carpetas, funciones, campos, valores enum) en
**inglés**; la UI en **español**; comentarios de código en **inglés**. Igual que
`portico-core`.

## Arquitectura

Un solo origen. `cloudflared` enruta por path; no hay CORS ni segundo subdominio.

```
cloudflared ──┬── /api/*, /_/*  ──> pocketbase:8090   (REST + admin UI)
              └── /*            ──> web:3000          (Next.js)
```

En dev no hay túnel, así que `next.config.ts` proxea los mismos dos prefijos a
`127.0.0.1:8090`. Dev y prod se comportan igual y la cookie de sesión no cambia.

- **`pb/`** — PocketBase 0.39.x. El esquema vive **solo** en `pb/pb_migrations/*.js`,
  nunca se edita a mano en el admin UI. Se aplican solas al arrancar.
- **`web/`** — Next.js 15 (App Router), React 19, Tailwind v4, sin librería de
  componentes. Escrituras vía **server actions**; lecturas en server components.

## Comandos

```bash
cd web && pnpm dev          # localhost:3000 (requiere PocketBase en :8090)
cd web && pnpm typecheck    # tsc --noEmit
cd web && pnpm build        # build de producción
docker compose up -d --build
```

## Modelo de datos

7 colecciones. `projects` es la raíz; todo lo demás cuelga de ella.

| Colección | Rol |
|---|---|
| `projects` | El workspace. Jerárquico vía `parent`. `meta` (json) guarda campos libres por tipo. |
| `resources` | **El mapa**: dónde vive el proyecto. El campo que importa es `purpose`. |
| `log` | Bitácora append-only: qué pasó y cuándo. |
| `tasks` | Pendientes. |
| `entries` | Ledger: un movimiento de plata, proyectado o real. |
| `entities` | Contrapartes reutilizables. |
| `accounts`, `categories` | Taxonomía del ledger. |
| `taxonomy` | Tu vocabulario editable + etiquetas de los estados fijos. |
| `settings` | Fila única con los números que antes eran constantes. |
| `inbox` | Captura universal. `status` obliga a que cada ítem termine con un plan. |
| `routines`, `routine_log` | Rutinas y sus repeticiones. Sin campo de racha, a propósito. |
| `daily` | Ventana de sueño y energía por franja. |

### Decisiones que no hay que deshacer

- **`next_cue` + `next_step` son dos campos, no uno.** Codifican un plan
  *si-entonces* ("cuando X, entonces Y"), no una tarea. Los planes contingentes
  superan ampliamente a las intenciones genéricas porque automatizan el **inicio**
  de la acción. Si esto se colapsa a un campo de texto libre, se pierde el mecanismo.
  El disparador puede ser una situación **o una hora**: el ECA que comparó ambos no
  encontró diferencia, así que la UI no debe insistir en uno de los dos.
- **La bandeja obliga a triar.** Capturar no libera la carga; el plan sí. Un ítem no
  sale de `inbox` hasta convertirse en plan, tarea o bitácora — o en un descarte
  explícito, que también es una decisión.
- **`routines` no tiene campo de racha y no debe tenerlo.** Saltarse una repetición no
  afecta la formación del hábito; la grilla muestra huecos sin penalizarlos.
- **`num()` vs `money()` en `actions.ts`.** En Chile el punto es separador de miles,
  pero "3.5 horas" también se escribe con punto. `money()` solo trata los puntos como
  miles cuando cada grupo tiene exactamente tres dígitos; `num()` nunca los toca. No
  unificarlos.
- **El bloque "Retomar" va siempre primero y no se mueve.** Reanudar una tarea tras una
  interrupción larga depende de reconstruir el contexto escaneando visualmente el
  entorno — un layout estable es parte del mecanismo, no estética.
- **Ninguna fecha se muestra sola.** Siempre fecha + distancia + barra de urgencia
  (`components/Due.tsx`). Un plazo lejano no genera señal por sí solo.
- **Sin gamificación**: nada de rachas, puntos, insignias ni badges rojos. Aumentan la
  carga extrínseca y el agobio.
- **Sin barras de "% completado"**: invitan al perfeccionismo y casi siempre son ficción.
- `amount_clp` se **congela** al guardar el movimiento. Los reportes históricos no deben
  moverse cuando cambia la UF de hoy.
- Las fechas se formatean en **UTC** (`lib/dates.ts`). Los campos de solo-fecha caen en
  medianoche UTC; renderizarlos en `America/Santiago` los correría un día hacia atrás.
- `pb_data/` **nunca** entra al repo ni a Dropbox. SQLite + sincronización de archivos
  corrompe la base.
- **La captura escribe primero en IndexedDB, siempre.** No hay rama por conectividad: un
  cuadro de captura que a veces falla deja de ser confiable, y entonces vuelves a
  sostener las cosas en la cabeza. `lib/offline.ts` (página) y `public/sw.js` (worker)
  duplican el acceso a IndexedDB a propósito — un service worker no puede importar
  módulos de la app sin un paso de bundling.
- **El service worker precachea `/offline` y sus chunks.** Cachear solo el HTML hace que
  la página renderice sin hidratar: se ve bien y no guarda nada. Es el peor fallo posible
  justo en la pantalla que tiene que funcionar.
- `.next/` y `node_modules/` están marcados con `com.dropbox.ignored`. Si Dropbox los
  sincroniza, el build falla con `EBUSY` al borrar carpetas. Next recrea `.next`, así que
  el atributo se pierde: si vuelve a fallar, borra `.next` y recompila.

## Convenciones de código

- Escrituras: server actions en `web/src/lib/actions.ts`. Formularios HTML nativos con
  `action={serverAction}` — funcionan sin JavaScript.
- Lecturas: `requirePB()` en cada page bajo `(app)/`; redirige a `/login` si no hay sesión.
- Etiquetas en español: **todas** en `web/src/lib/labels.ts`. No hardcodear strings de
  enum en componentes.
- Componentes en `web/src/components/`; solo llevan `"use client"` los que de verdad
  necesitan estado del navegador (`CopyButton`, `Nav`, `login`).
