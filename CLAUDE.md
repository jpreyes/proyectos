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
cloudflared ──┬── /api/*, /_/*  ──> pocketbase:8090   (REST + admin UI + SSE)
              └── /*            ──> web:3000          (Next.js: solo la cáscara)
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
  componentes. **Local-first**: ver abajo.

### Local-first

La app **no consulta al servidor para pintar una pantalla**. Mantiene una réplica
completa de los datos de la cuenta en el dispositivo y lee de ahí; PocketBase es el
lugar donde las réplicas se encuentran, no el origen de cada vista. Por eso abre,
navega y **escribe** sin conexión, en el teléfono y en la PWA igual que en el
escritorio, y por eso responde sin latencia de red.

```
pantallas ──> réplica en memoria ──> IndexedDB          (lo que sobrevive al cierre)
                     ▲   │
       tiempo real   │   └── outbox ──> PocketBase      (subida, en orden)
       (SSE) ────────┘        ▲
                              └── service worker        (subida con la app cerrada)
```

Todo vive en `web/src/lib/local/`:

| Archivo | Rol |
|---|---|
| `db.ts` | IndexedDB: réplica (`records`), cola (`outbox`), marcas (`meta`). |
| `store.ts` | La réplica en memoria y sus hooks (`useCollection`, `useRecord`). |
| `sync.ts` | Bajada, subida, tiempo real y el estado de la cola. |
| `mutate.ts` | `create` / `update` / `remove`: aplican local y encolan. |
| `query.ts` | `sortBy`, `index`, `groupBy` — lo que reemplazó a los filtros de PB. |
| `actions.ts` | Las 55 escrituras de la app, con la misma firma `(FormData)` de antes. |
| `config.ts`, `schedule.ts`, `lists.ts`, `route.ts` | Catálogo, calce de horas, selectores, id de la ruta. |

Decisiones de esta capa que **no hay que deshacer**:

- **La bajada compara índices de ids, no un cursor por `updated`.** Media app se borra
  en duro (`routine_log`, `quote_items`, `deliverables`, todo el catálogo) y un cursor
  solo ve lo que existe: jamás se enteraría de una fila que desapareció, y la réplica
  mostraría para siempre algo que ya no está. Pedir `fields=id,updated` de cada colección
  es la única lápida que PocketBase regala. Son veinte peticiones diminutas para los datos
  de una persona; si esto creciera a decenas de miles de filas habría que volver al cursor
  **y** agregar una colección de lápidas.
- **El id se genera en el dispositivo.** PocketBase acepta un id propio de 15 caracteres
  al crear, así que un proyecto creado sin señal ya tiene su id definitivo y sus tareas,
  bitácora y movimientos pueden apuntarle enseguida. Sin esto habría que inventar ids
  temporales y reescribir cada referencia al subir — que es donde estas arquitecturas se
  rompen.
- **La bajada nunca pisa una escritura que no ha subido.** Si hay algo pendiente para ese
  registro, el parche local se reaplica sobre lo que llegó del servidor. Sin eso, escribir
  sin red y sincronizar produce un parpadeo en el que tu cambio se revierte solo.
- **Conflictos: gana el último que escribe, por registro.** Con una persona y dos
  dispositivos es lo correcto y lo predecible. No hay CRDT ni lo va a haber.
- **Un rechazo del servidor se suelta, no se reintenta para siempre.** Tras cinco intentos
  la escritura sale de la cola y se cuenta en la píldora. Una cola atascada en un registro
  inválido bloquea todo lo que viene detrás, y eso sí rompe la promesa de que lo escrito
  sube.
- **Al cerrar sesión la réplica se borra.** Es una copia completa de tus datos en el disco
  del dispositivo; dejarla ahí se la entregaría a la siguiente cuenta que entre.
- **El latido va cada minuto pero hace dos cosas.** Bajada completa cada cinco; subida
  siempre que quede algo en la cola. La señal vuelve muchas veces sin que el navegador
  emita `online`, y cinco minutos con algo escrito sin subir es justo el rato en que uno
  cierra la app.
- **Leer el .ics de Outlook es lo único que quedó en el servidor** (`lib/actions.server.ts`):
  es otro origen, no manda CORS, y da igual intentarlo sin red.

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

- **Cuatro destinos en la barra: Hoy, Bandeja, Trabajo, Yo.** La app se abre en el
  teléfono, y un índice de diez secciones con tipografía de 11–13 px se lee como panel de
  control: todo pesa lo mismo y nada invita a entrar. Fueron diez, después seis, y seis
  seguía siendo un mapa que había que memorizar. El criterio que quedó: **en la barra va
  lo que se abre un día cualquiera sin saber de antemano qué contiene**. Calendario y
  Presupuestos no cumplen eso — nunca se abren "por sí mismos", se abren *por un encargo*—
  así que lo de cada proyecto se ve dentro del proyecto (`/w/[id]` muestra sus horas
  comprometidas y sus presupuestos, y deja comprometer horas ahí mismo) y las dos vistas
  completas quedan a un toque desde **Yo**. Con cuatro, además, los rótulos completos
  caben en un teléfono de 375 px: mientras hicieron falta abreviaturas ("Agenda",
  "Presup.") la barra estaba pidiendo a gritos que sobraba algo. Lo que aparezca nuevo
  entra como fila de Yo o dentro del proyecto, nunca en la barra.
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
- **La bandeja obliga a triar, pero triar cuesta un toque.** Capturar no libera la carga;
  el plan sí. Un ítem no sale de `inbox` hasta convertirse en algo — o en un descarte
  explícito, que también es una decisión. Lo que **no** puede hacer es exigir nada para
  lograrlo: el formulario pedía destino, workspace (obligatorio), disparador, siguiente
  paso, prioridad y fecha, así que algo tan corriente como "responder correos" —que no
  pertenece a ningún proyecto— no tenía salida y se quedaba ahí para siempre. Ahora son
  botones: Tarea, Para hoy, Descartar. El proyecto es opcional (la base siempre lo
  permitió; era el formulario el que no) y desbloquea los destinos que sí lo necesitan,
  bitácora y plan, porque una bitácora sin proyecto no se lee en ninguna parte.
- **Nada puede quedar sin un lugar donde se vea.** Corolario de lo anterior: si se pueden
  crear tareas sin fecha y sin proyecto, Hoy tiene que mostrarlas ("Pendientes sin
  fecha"), porque el horizonte solo lista lo que tiene plazo y la ficha de un workspace
  solo lo suyo. Permitir crear algo invisible es peor que no dejar crearlo.
- **La fecha se lee de lo que escribiste** (`lib/local/parse.ts`). "Llamar al mandante el
  viernes" ofrece «Tarea · vie 21». Es deliberadamente corto y conservador: reconoce un
  puñado de formas inequívocas y ante la duda no devuelve nada, porque una fecha inventada
  se descubre el día que no llegaste. Siempre se muestra en el botón lo que entendió — no
  hay fechas puestas a espaldas de nadie — y el texto no se recorta: la tarea conserva la
  frase completa.
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
  Deshacerlo anula la reserva y el ingreso, pero **no** borra el proyecto. Desde que la
  app es local-first esto corre entero en el dispositivo, así que también funciona sin
  señal —el sí del cliente casi nunca ocurre frente al computador— y las cuatro
  escrituras entran a la cola en orden: el id del proyecto ya existe cuando el compromiso
  y el ingreso lo referencian.
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
- **`num()` vs `money()` en `lib/local/actions.ts`.** En Chile el punto es separador de miles,
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
- **Toda escritura pasa por la réplica local, siempre.** No hay rama por conectividad.
  Empezó siendo cierto solo de la captura —un cuadro de captura que a veces falla deja de
  ser confiable, y entonces vuelves a sostener las cosas en la cabeza— y resultó que el
  mismo argumento valía para marcar una tarea, anotar la bitácora o aprobar un
  presupuesto. `lib/local/db.ts` (app) y `public/sw.js` (worker) duplican el acceso a
  IndexedDB a propósito: un service worker no puede importar módulos de la app sin un paso
  de bundling. **Cualquier cambio de esquema va en los dos lados.**
- **Quedarse sin red no cambia de pantalla, y ya casi no cambia nada.** Como el HTML es
  una cáscara vacía y los datos salen del dispositivo, el worker guarda **una cáscara por
  forma de ruta** (`/w/:id`, no `/w/abc`) y con eso abre sin conexión hasta un proyecto que
  este teléfono nunca visitó. Precalienta los seis destinos de la barra (`warm-pages`, la
  lista sale de `lib/nav.ts`). `/offline` quedó como último recurso: solo aparece en una
  **sección** que nunca se abrió en ese dispositivo. Lo único que anuncia la desconexión es
  la píldora de `components/OfflineBadge.tsx`, abajo a la izquierda, con la cola pendiente
  — un aviso a pantalla completa convierte un momento recuperable en una caída.
- **Las cáscaras se prestan entre ids, así que el id se lee de la URL.** `useParams()` no
  lee la barra de direcciones: lee el árbol que vino en la respuesta del servidor, o sea
  el del *otro* proyecto cuando la cáscara es prestada. Por eso las cinco rutas dinámicas
  usan `useRouteId()` (`lib/local/route.ts`). Si alguna vuelve a `useParams()`, abrir sin
  red una ficha no visitada mostrará el registro equivocado — y se verá bien, que es lo
  peor.
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

- **Escrituras**: `web/src/lib/local/actions.ts`, con la firma de siempre `(fd: FormData)`.
  Los formularios siguen siendo formularios —`<Form action={laAccion}>` de
  `components/form.tsx`, con sus campos ocultos— en vez de veinte estados controlados.
  Una acción que devuelve un `string` está pidiendo navegar ahí (era `redirect()`).
  Los formularios con más de un botón usan `data-action` + `alt` en vez de `formAction`.
  **Lo que se perdió:** ya no funcionan sin JavaScript. Un formulario que escribe en
  IndexedDB lo necesita por definición, y en un teléfono quedarse sin red pasa mucho más
  seguido que tener JavaScript apagado.
- **Lecturas**: `useCollection` / `useRecord` de `lib/local/store.ts`. Nada de consultar
  a PocketBase para pintar. El portero de sesión es `components/AppShell.tsx`, en el
  cliente, porque sin red no hay servidor a quien preguntarle.
- Los formularios no controlados que editan un registro llevan `key={record.updated}`:
  es lo que los mantiene al día cuando el registro cambia desde otro dispositivo.
- Los que agregan llevan `reset` — antes los vaciaba el re-render del servidor.
- El título de la pestaña va con `<Title>` (`components/Title.tsx`): `export const
  metadata` solo existe en componentes de servidor y ya no queda ninguno.
- Etiquetas en español: **todas** en `web/src/lib/labels.ts`. No hardcodear strings de
  enum en componentes.
- Componentes en `web/src/components/`. Hoy casi todo es cliente; los pocos que no
  dependen del navegador (`ui.tsx`, `Due`, `Bars`, `WeekGrid`) igual terminan en el
  bundle, así que la distinción dejó de ser una regla y pasó a ser una descripción.
