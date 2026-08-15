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
  **Una migración ya aplicada no vuelve a correr**: editarla no cambia nada en esta base
  y solo surtiría efecto en una instalación nueva — la peor clase de diferencia entre
  entornos. Todo cambio posterior va en un archivo nuevo. Ojo con que PocketBase se
  reinicia solo al tocar `pb_hooks/`, así que las migraciones pueden quedar aplicadas
  antes de lo que uno cree.
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

`projects` es la raíz de casi todo. Las dos excepciones son `quotes` —que cuelga del
cliente, porque existe antes que el proyecto— y `commitments`, que mide tiempo, no trabajo.

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
| `quotes`, `quote_items`, `deliverables` | Presupuestos. Cuelgan del cliente, no del proyecto. |
| `commitments` | **Horas por semana entre dos fechas.** La unidad del calendario. |
| `calendar_feeds`, `calendar_events` | Espejo de solo lectura del .ics de Outlook. |

### Decisiones que no hay que deshacer

- **Seis destinos en la barra, no diez.** La app se abre en el teléfono, y un
  índice de diez secciones con tipografía de 11–13 px se lee como panel de
  control: todo pesa lo mismo y nada invita a entrar. Abajo queda lo que se abre
  un día cualquiera —Hoy, Bandeja, Trabajo, Calendario, Presupuestos— y el resto
  vive un toque más adentro, en **Yo**. Seis es lo que cabe: con los rótulos
  completos la barra se sale de un teléfono de 375 px y todos terminan en
  puntos suspensivos, así que Calendario y Presupuestos van abreviados en la
  barra (`short` en `lib/nav.ts`) y completos en el riel de escritorio. Un
  séptimo obligaría a quitar los rótulos; lo que aparezca nuevo entra como fila
  de Yo.
- **Las superficies se separan por elevación, no por bordes.** Una fila se
  levanta sobre la página y las filas de un grupo se parten con una hendidura de
  1 px del color del fondo. Esa ranura es lo que hace que un grupo se lea como un
  solo objeto; un borde más claro lo vuelve una tabla otra vez.
- **Nada se esconde detrás de `hover`.** En el teléfono no existe: los botones de
  fijar, borrar y quitar estaban en `opacity-0` hasta pasar el mouse, o sea que
  en móvil no se podían tocar. Van atenuados pero presentes.
- **Los formularios largos van plegados.** Configuración, el alta de contacto, el
  de presupuesto, el de rutina y los ocho campos secundarios de la bitácora
  arrancan cerrados. Lo obligatorio queda a la vista; lo demás es un `<details>`.
- **`next_cue` + `next_step` son dos campos, no uno.** Codifican un plan
  *si-entonces* ("cuando X, entonces Y"), no una tarea. Los planes contingentes
  superan ampliamente a las intenciones genéricas porque automatizan el **inicio**
  de la acción. Si esto se colapsa a un campo de texto libre, se pierde el mecanismo.
  El disparador puede ser una situación **o una hora**: el ECA que comparó ambos no
  encontró diferencia, así que la UI no debe insistir en uno de los dos.
- **La bandeja obliga a triar.** Capturar no libera la carga; el plan sí. Un ítem no
  sale de `inbox` hasta convertirse en plan, tarea o bitácora — o en un descarte
  explícito, que también es una decisión.
- **El calendario mide horas por semana, no bloques con hora.** Una agenda de días y
  horas exige mantenerla al día o queda mintiendo en una semana. Lo que llena un año
  se contrata en la otra unidad —«4 h semanales durante 30 meses», «un ramo, 10 h
  semanales el semestre»— y la única pregunta que el modelo tiene que responder es si
  algo cabe sin que ninguna semana pase del techo. Eso es una suma, no una grilla.
  Las semanas parciales del principio y del final se prorratean por días cubiertos.
- **El buscador de huecos propone un ritmo plano, no llena hasta el tope.** Un ritmo
  plano se puede escribir en un contrato y se puede sostener; el llenado codicioso
  produce semanas al 100% seguidas de semanas vacías. Prefiere empezar antes por sobre
  terminar antes: es lo que se responde cuando preguntan «¿cuándo puedes partir?».
- **Aprobar un presupuesto escribe en cuatro colecciones a la vez** —proyecto, reserva
  de tiempo, ingreso proyectado y bitácora— y así tiene que quedar. El momento en que
  el cliente dice que sí es el único en que está toda la información junta y hay ganas
  de anotarla; lo que se deja para después termina anotándose el día en que ya no cabía.
  Deshacerlo anula la reserva y el ingreso, pero **no** borra el proyecto.
- **Los totales del presupuesto se congelan al escribir**, igual que `amount_clp`. Un
  presupuesto enviado es una promesa hecha en una fecha: el papel que el cliente tiene
  en la mano no puede cambiar porque hoy ajustaste un porcentaje por defecto. Gastos
  generales y utilidades van **ambos sobre el costo directo**, no en cascada.
- **Outlook entra en una sola dirección.** Se lee el .ics publicado para que los
  exámenes de grado ocupen horas de la semana; la app nunca escribe en el calendario de
  la UACh. `calendar_events` es cache y se rehace en cada sincronización — no lleva
  borrado suave. El JSVM de PocketBase **no tiene `Intl`**, así que el parseo de zonas
  horarias vive en Next (`lib/ics.ts`), no en un hook.
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
- **Quedarse sin red no cambia de pantalla.** El worker guarda la última copia
  renderizada de cada vista visitada (cache `pages-*`) y la sirve cuando la red no está,
  así que la app sigue mostrando lo que mostraba. Además precalienta los seis destinos de
  la barra (`warm-pages`, la lista sale de `lib/nav.ts`) para que el primer toque sin red
  caiga en una pantalla real. `/offline` quedó como último recurso: solo aparece en una
  vista que nunca se abrió en ese dispositivo. Lo único que anuncia la desconexión es la
  píldora de `components/OfflineBadge.tsx`, abajo a la izquierda, con la cola pendiente —
  una copia vieja sin aviso miente, y un aviso a pantalla completa convierte un momento
  recuperable en una caída. **Ojo:** lo que sigue sin funcionar sin red son las
  escrituras que no sean captura (las server actions no tienen outbox).
- **El service worker precachea `/offline` y sus chunks.** Cachear solo el HTML hace que
  la página renderice sin hidratar: se ve bien y no guarda nada. Es el peor fallo posible
  justo en la pantalla que tiene que funcionar.
- **Un `fetch` fallido no es estar sin conexión.** El teléfono cambia de wifi a datos y
  iCloud Private Relay rota su nodo de salida cada pocos minutos; ambas cosas cortan la
  conexión en vuelo con la señal completa. Si la primera navegación que falla manda a
  `/offline`, la app parece caída estando arriba. Va un segundo intento sobre una conexión
  nueva antes de rendirse.
- **Al cachear una respuesta ya decodificada hay que borrarle `content-encoding`.**
  `res.text()` devuelve el cuerpo descomprimido, pero los headers siguen describiendo el
  comprimido, y Cloudflare comprime con brotli. Guardar `new Response(html, {headers:
  res.headers})` deja en cache un HTML rotulado `br`: el navegador intenta descomprimir
  texto plano y la página no carga. Safari lo tolera, así que el fallo solo aparece en
  Chrome — mira `decodedHeaders()` en `sw.js`.
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
