# CLAUDE.md — proyectos

## Qué es

Gestor personal de proyectos, desplegado en `proyectos.jpreyes.cl`. **Una cuenta por
persona, y cada una ve solo lo suyo** — no hay registro público: las cuentas las crea un
superusuario. Cada cuenta nueva llega con su catálogo y con un encargo de ejemplo
sembrados (ver «Primer ingreso», más abajo).
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
| `recurring.ts` | Las series: calendario de repeticiones, id derivado, materialización. |
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
- **Leer los .ics es lo único que quedó en el servidor** (`lib/actions.server.ts`):
  es otro origen, no manda CORS, y da igual intentarlo sin red. Desde el asistente son
  dos: `lib/organize/call.ts` vive allá por otra razón —la clave de la API no puede
  tocar el navegador— y tampoco escribe nada.

## Comandos

```bash
cd web && pnpm dev          # localhost:3000 (requiere PocketBase en :8090)
cd web && pnpm typecheck    # tsc --noEmit
cd web && pnpm build        # build de producción
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build   # en el VPS
```

**En el VPS no hay node ni `node_modules`, así que los tres primeros no corren ahí.** Todo
el build vive en Docker y eso es a propósito: la máquina que sirve la app no necesita una
cadena de herramientas. Para revisar tipos sin desplegar, la etapa `deps` del Dockerfile ya
es un contenedor con las dependencias instaladas —se construye una vez y se reusa—, y el
código entra montado de solo lectura para no dejar nada escrito en el repo:

```bash
cd web
docker build --target deps -t proy-deps .          # una vez; ~20 s
docker run --rm -v "$PWD:/src:ro" proy-deps sh -c '
  cp -r /src/src /src/public /src/tsconfig.json /src/next.config.ts \
        /src/next-env.d.ts /src/package.json /app/ && cd /app &&
  ./node_modules/.bin/tsc --noEmit'                # silencio = pasa
docker build --target build -t proy-build .        # el build completo, ~100 s
```

`--target build` es el que hay que correr antes de desplegar: `tsc` no ve lo que solo falla
al compilar la app (un `"use client"` que importa algo de servidor, por ejemplo). Y ojo con
que `up -d --build` va **siempre con los dos archivos**: sin el overlay no hay puerto
publicado y el túnel no llega a nada.

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
| `entry_series` | La regla de lo que se repite: sueldos, arriendos, cuotas. **Fabrica `entries`.** |
| `entities` | Contrapartes reutilizables. |
| `accounts`, `categories` | Taxonomía del ledger. |
| `taxonomy` | Tu vocabulario editable + etiquetas de los estados fijos. |
| `settings` | Fila única con los números que antes eran constantes. |
| `inbox` | Captura universal. `status` obliga a que cada ítem termine con un plan. |
| `routines`, `routine_log` | Rutinas y sus repeticiones. Sin campo de racha, a propósito. |
| `daily` | Ventana de sueño y energía por franja. |
| `quotes`, `quote_items`, `deliverables` | Presupuestos. Cuelgan del cliente, no del proyecto. |
| `commitments` | **Horas por semana entre dos fechas.** La unidad del calendario. |
| `calendar_feeds`, `calendar_events` | Espejo de solo lectura de los calendarios iCal conectados. |
| `chat` | La conversación con el asistente. El plan propuesto cuelga del mensaje que lo propuso. |

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
- **Todo lo que se puede tocar responde al tocarlo, y lo que se toca lleva a alguna
  parte.** Corolario del punto anterior y más importante que él: sin `hover`, una fila
  sin estado `active:` no emite **ninguna** señal hasta que la pantalla siguiente termina
  de pintarse, y ese silencio hace que uno vuelva a tocar, y otra vez, convencido de que
  la app se colgó. Por eso `Row`, `Stat`, `Chip` y `btn()` llevan `active:` y
  `touch-manipulation`, y por eso `-webkit-tap-highlight-color` va en transparente: el
  destello propio de Safari llega tarde y compite con el nuestro en vez de sumarse. La
  otra mitad de la regla: **una tarjeta que parece tocable y no hace nada es peor que una
  que no lo parece**. Si un número resume una lista, lleva a esa lista; si una fila
  describe un registro, lleva a su ficha.
- **Una fila puede navegar y tener botón propio, pero no metiendo uno dentro del otro.**
  Un `<button>` dentro de un `<a>` es HTML inválido y cada navegador improvisa. `Row`
  acepta `actions`: el enlace se estira invisible sobre la fila y los controles van
  encima. Es lo que permite que un cobro lleve a su detalle sin perder el «marcar
  pagado».
- **Todo lo que se puede tocar responde al tocarlo, y lo que se toca lleva a alguna
  parte.** Corolario del punto anterior y más importante que él: sin `hover`, una fila
  sin estado `active:` no emite **ninguna** señal hasta que la pantalla siguiente termina
  de pintarse, y ese silencio hace que uno vuelva a tocar, y otra vez, convencido de que
  la app se colgó. Por eso `Row`, `Stat`, `Chip` y `btn()` llevan `active:` y
  `touch-manipulation`, y por eso `-webkit-tap-highlight-color` va en transparente: el
  destello propio de Safari llega tarde y compite con el nuestro en vez de sumarse. La
  otra mitad de la regla: **una tarjeta que parece tocable y no hace nada es peor que una
  que no lo parece**. Si un número resume una lista, lleva a esa lista; si una fila
  describe un registro, lleva a su ficha.
- **Una fila puede navegar y tener botón propio, pero no metiendo uno dentro del otro.**
  Un `<button>` dentro de un `<a>` es HTML inválido y cada navegador improvisa. `Row`
  acepta `actions`: el enlace se estira invisible sobre la fila y los controles van
  encima. Es lo que permite que un cobro lleve a su detalle sin perder el «marcar
  pagado».
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
- **Una fila con segunda línea se apila; las insignias bajan.** El plan «cuando…
  entonces…» y la barra de urgencia comparten fila con la fecha, las insignias y
  el chevrón. En un teléfono de 390 px un workspace con dos insignias dejaba esa
  columna en unos 60 px: el título se leía "En…" y el plan bajaba a una palabra
  por línea. Por eso `Row` pone la segunda línea a ancho completo y manda las
  insignias abajo. Si alguna vez vuelve a meterse todo en una línea, el síntoma
  aparece recién con dos insignias, que es lo que lo hizo pasar desapercibido.
- **El calendario tiene dos vistas y una sola unidad.** La cuadrícula de mes
  existe porque «¿qué pasa el jueves?» no se responde con barras por semana, pero
  **no** introduce bloques con hora: un compromiso se dibuja como una banda a lo
  largo de los días que cubre y su ritmo semanal sigue en la columna de la
  derecha. Lo único pegado a una hora son los eventos de los calendarios conectados, que son los
  únicos que la tienen. El día de un evento se calcula en `America/Santiago`
  (`eventDayKey`) y no en UTC como todo lo demás: una comisión a las 21:00 es un
  instante real y en UTC cae al día siguiente. Los de día completo son la
  excepción de la excepción — su fecha ya es el dato y se lee en UTC.
- **El calendario mide horas por semana, no bloques con hora.** Una agenda de días y
  horas exige mantenerla al día o queda mintiendo en una semana. Lo que llena un año
  se contrata en la otra unidad —«4 h semanales durante 30 meses», «un ramo, 10 h
  semanales el semestre»— y la única pregunta que el modelo tiene que responder es si
  algo cabe sin que ninguna semana pase del techo. Eso es una suma, no una grilla.
  Las semanas parciales del principio y del final se prorratean por días cubiertos.
- **La grilla de semanas se toca y contesta.** Una barra al 90% dice cuánto, no de qué:
  puede ser un ramo, tres inspecciones o un examen que llegó de un calendario externo.
  `buildWeekLoad` ya guardaba el desglose y nadie lo mostraba. Tocar una semana lo abre y
  ofrece comprometer horas **ahí mismo**, con las fechas ya puestas — antes había que
  mirar el hueco, bajar al formulario y volver a escribir a mano lo que uno acababa de
  ver. Lo mismo desde un día en la vista de mes.
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
- **Los calendarios entran en una sola dirección, y son genéricos.** Se conecta cualquier
  dirección iCal —Google, Microsoft 365, iCloud, Nextcloud— y sus eventos ocupan horas de
  la semana; la app nunca escribe en ninguno. Dos cosas que lo hacían parecer específico de
  Outlook y no lo son: el `webcal://` que copian Apple y Outlook se normaliza a `https` al
  guardar (el campo `url` de PocketBase lo rechaza tal cual, con un escueto «Must be a valid
  url»), y la ayuda de la pantalla explica dónde encuentra cada proveedor esa dirección.
  Si una organización tiene bloqueada la publicación de calendarios, no hay código que lo
  arregle: el enlace no existe.
  `calendar_events` es cache y se rehace en cada sincronización — no lleva borrado suave. El
  JSVM de PocketBase **no tiene `Intl`**, así que el parseo de zonas horarias vive en Next
  (`lib/ics.ts`), no en un hook.
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
- **Ningún componente escribe un color.** Todo sale de los tokens de `globals.css`
  (`bg`, `panel`, `row`, `pill`, `ink`, `muted`, `faint`, `accent`, `ok`, `warn`, `bad`,
  más `shade` y `scrim`), y por eso el tema claro es un cambio de paleta y no una
  reescritura. Las sombras y los velos van por las clases `float`, `float-strong` y
  `scrim`: un `shadow-black/40` se ve como suciedad sobre blanco, y el primero que se
  cuele es invisible para quien lo escribió en el tema que estaba usando. La única
  excepción es la hoja imprimible, fija en blanco porque el documento se manda.
- **El tema vive en el dispositivo, no en la cuenta** (`lib/theme.ts`). El teléfono de
  noche y el monitor de la oficina no quieren lo mismo; sincronizarlo apagaría uno al
  elegir en el otro. Se aplica con un script bloqueante al principio del `<body>`, antes
  del primer píxel: si esperara a React, cada carga empezaría con un destello del tema
  equivocado. En "Automático" se **quita** el atributo en vez de escribir el tema
  resuelto, así manda la media query y seguir al sistema no cuesta ningún listener.
- **Primer ingreso: datos de ejemplo + guía, y las dos se van con un toque.** Una cuenta
  vacía no enseña nada, y una app con cuatro destinos inventados tampoco se adivina. El
  servidor siembra un encargo completo marcado con `demo` (`pb_hooks/lib/demo.js`,
  `settings.demo_seeded`) y la app corre ocho pasos que iluminan elementos reales
  (`lib/tour.ts`, `components/Tour.tsx`, `settings.tour_done`). Las dos reglas que las
  mantienen honestas: **se borran/saltan de un toque y no vuelven**, y la marca de "ya
  ocurrió" es independiente de que los datos sigan ahí — si no, borrarlos los repondría
  en el próximo arranque. Los pasos apuntan a `data-tour="…"`; si el elemento no está, el
  paso se muestra centrado en vez de quedarse esperando. Los proyectos sembrados llevan
  **"Proyecto de ejemplo · " delante del nombre** (`DEMO_PREFIX`, y la migración 1770002700
  para las cuentas donde la siembra ya ocurrió): con nombres verosímiles, en una cuenta que
  ya tiene encargos reales no había cómo saber mirando la lista cuáles se pueden borrar. Va
  delante y no detrás porque las filas truncan, y un sufijo se pierde justo en el teléfono.
- **El asistente propone; nunca escribe solo** (`/organizar`, `lib/organize/*`,
  `lib/local/organize.ts`). Le cuentas lo que pasó y devuelve un plan —proyectos,
  pendientes, bitácora, movimientos, recurrentes, horas, presupuestos, cambios de estado—
  que aceptas de un toque o al que le apagas las filas que no. La tentación de que escriba
  solo hay que resistirla, y la razón está tres viñetas más arriba, en `parse.ts`: **una
  fecha inventada no se descubre revisándola, se descubre el día que no llegaste**. En una
  app que es tu índice y tu punto de reentrada, un bot que escribe a tus espaldas no ahorra
  trabajo: traslada el trabajo a auditar algo que ya está escrito, que es más caro y se hace
  peor. Lo que lo sostiene:
  - **Es una conversación, y vive en la base** (`chat`, migración 1770002900). Fue un cuadro
    de un solo tiro con una "ronda de corrección" aparte, y esa ronda especial dejó de tener
    sentido en cuanto el agente además **contesta**: corregir es el turno siguiente. Un
    cuadro que se vacía al enviar convierte cada consulta en la primera, así que «¿y en
    marzo?» no significaba nada. Y el hilo va en `chat` y no en el estado de la pantalla
    porque una conversación que se pierde al recargar deja de usarse para pensar: vuelve a
    ser un buscador. El plan se guarda **junto al mensaje que lo propuso** —una lista de tres
    tareas sin la frase que las explica no se entiende— y `applied` es lo que distingue, al
    abrirla mañana, lo que se hizo de lo que quedó sobre la mesa. Los interruptores de cada
    fila **no** se guardan: son una revisión a medio tomar, y sincronizarla entre
    dispositivos no ayuda a nadie.
  - **También lee, y por eso el contexto creció** (`buildContext`): pendientes abiertos,
    títulos recientes de bitácora, horas comprometidas, cobros y pagos sin cerrar,
    presupuestos con su estado, lo que se repite y **tres** totales del año. Sigue siendo
    títulos y totales —lo que se lee en una lista— nunca cuerpos de bitácora, notas, ni el
    ledger movimiento por movimiento. Cada campo que se agregue acá es algo más que sale de
    esta máquina: es la lista que hay que mirar con desconfianza.
  - **Lo que puede modificar cabe en una tabla** (`EDITABLE` en `organize/plan.ts`), y ahí
    está la política completa a propósito: repartida por el validador, «¿qué puede tocar?»
    no se contesta sin leer el archivo entero. La regla que la ordena: **puede cambiar el
    estado y la planificación; no puede reescribir el texto que escribiste tú.** Cerrar una
    tarea, mover un plazo o marcar un cobro pagado se arregla en dos segundos si se
    equivoca; la bitácora es append-only por diseño y un agente que la reescribe destruye
    justo aquello para lo que existe. Los presupuestos se editan **solo mientras son
    borrador**. Los pasos que borran llegan **apagados**: aceptar todo de un toque es el
    modo normal de esta app y en un plan que borra es el modo equivocado.
  - **`null` no es `""`, y confundirlos borra plazos** (`fieldValue`). Vaciar una fecha es
    una orden legítima; una fecha que no parsea no lo es. Si el «el viernes» que el modelo
    no supo convertir cayera a cadena vacía, el pendiente **perdería su plazo** en silencio
    — el error de siempre de esta app, pero al revés y peor, porque un plazo que desaparece
    no deja nada que revisar.
  - **La clave de la API vive en el entorno del contenedor** (`OPENCODE_API_KEY`), nunca en
    `settings`: esa fila se replica entera en cada navegador, así que guardarla ahí sería
    publicarla. **El modelo tampoco es un ajuste**, y esto se deshizo a conciencia: estuvo
    en Configuración con lista blanca y no debía estar. Cuál modelo hay detrás se eligió
    midiendo (`ASSISTANT_MODEL`), es una decisión de ingeniería, y ofrecerla como preferencia
    solo daba formas de empeorarla — no hay una pantalla para elegir el motor de la base de
    datos. La columna `assistant_model` quedó en la base sin que nadie la lea: una migración
    que borra una columna a cambio de nada es riesgo puro.
  - **El historial se recorta en los dos lados** (`historyFor` en el cliente, `TURNS` en
    `call.ts`). Llega del navegador, así que el tope del servidor no es prolijidad: sin él,
    un cliente modificado manda la conversación de un mes y el techo de tokens se gasta en
    recordar en vez de en contestar — con el síntoma de siempre, `finish_reason: length` y
    contenido vacío. El plan en JSON viaja **solo con el último turno del agente y solo si
    quedó sin aplicar**, que es justo el caso en que se lo está corrigiendo; lo ya escrito
    se ve en la app.
  - **La sesión se verifica contra PocketBase, no leyendo la cookie.** `pb_auth` no es
    httpOnly y `authStore.isValid` solo mira la expiración del JWT, no su firma: sin el
    `authRefresh()`, cualquiera que sepa la URL gasta los créditos con una cookie escrita a
    mano.
  - **Todo lo que devuelve el modelo pasa por una aduana** (`sanitizePlan`), y dos veces: en
    el servidor y otra vez antes de aplicar. Un id que no exista se descarta, una fecha que
    no tenga la forma exacta se descarta, un tipo fuera de tu vocabulario cae al valor por
    defecto. Descartar un **campo** no bota el paso: una tarea sin proyecto es legal y Hoy
    la muestra; una colgada de un proyecto inventado, no.
  - **No escribe en PocketBase desde el servidor.** Aplicar el plan pasa por las mismas
    escrituras locales que todo lo demás, que es lo que lo deja funcionando sin red, en
    orden en la cola y con dueño.
  - **Responde por streaming, y eso no es lucimiento**
    (`app/(app)/organizar/stream/route.ts`). Cloudflare corta la conexión con el origen si no
    ve el **primer** byte en ~100 s, y `deepseek-v4-flash` tarda unos 101 porque razona antes
    de contestar: justo encima de la raya. La ruta emite un byte al instante y late cada 10 s
    —ndjson, la última línea es el resultado— porque el límite es al primer byte y no al
    último. Dos detalles que se pierden fácil: `X-Accel-Buffering: no`, sin lo cual nginx
    bufferea la respuesta y se traga los latidos dejándonos donde empezamos; y que la ruta
    cuelga de `/organizar/` y no de `/api/`, que es de PocketBase. No es un server action
    justamente por esto: uno no puede empezar a responder antes de tener el valor de retorno.
  - **El techo de tokens incluye el pensamiento, y creerlo a medias sale caro.** Con
    `MAX_OUTPUT_TOKENS` en 8.000, `deepseek-v4-flash` devolvía `finish_reason: length` y
    contenido **vacío** — parecía un modelo roto y lo roto era el techo. Necesita ~13.300
    para un plan de 1.700 caracteres; hoy el techo está en 24.000. El prompt va escrito
    apretado por lo mismo: alargarlo "para que entienda mejor" le da más de qué razonar y
    acerca el corte.
  - **Está apagado hasta que la cuenta lo encienda** (`settings.assistant_enabled`). Es la
    única parte de la app que manda algo afuera. Encenderlo tiene que ser un acto, no un
    descubrimiento.
- **Sin barras de "% completado"**: invitan al perfeccionismo y casi siempre son ficción.
- `amount_clp` se **congela** al guardar el movimiento. Los reportes históricos no deben
  moverse cuando cambia la UF de hoy. El nombre quedó de cuando todo era en pesos: hoy
  significa **«monto en la moneda base de la cuenta»**, y renombrar la columna a cambio de
  nada no paga el riesgo.
- **Una recurrencia no reemplaza al movimiento: lo fabrica** (`lib/local/recurring.ts`,
  `/recurrentes`). `entry_series` guarda la regla —cada cuánto, desde cuándo, hasta cuándo,
  por cuánto— y la app materializa cada repetición como una fila normal de `entries`. La
  alternativa, expandir la serie al leer, habría obligado a que el flujo mensual, el margen
  por proyecto, «por cobrar», el cierre de impuestos y el buscador supieran de recurrencias,
  y habría hecho imposible lo más corriente de todo: que el arriendo de este mes haya llegado
  distinto y uno lo corrija sin tocar los otros once. Cuatro cosas la sostienen y ninguna es
  cosmética:
  - **El id de cada cuota se deriva de (serie, fecha)**, no al azar. Es lo que hace que el
    teléfono y el computador, generando el mismo mes, escriban **una** fila y no dos; el
    segundo choca contra el id que ya existe y el sincronizador lo trata como el reintento
    de algo que ya funcionó (`failed()` en `sync.ts` reconoce ese 400). De paso, borrar una
    cuota se queda borrado: el id sigue ocupado en la réplica y el generador salta lo que
    ya existe.
  - **Se materializa hasta un horizonte corto** (`HORIZON_DAYS`, tres meses), no hasta el
    fin de la serie: un sueldo sin término es infinito y el ledger no puede serlo. Lo
    pasado sí se materializa entero —de eso se trata anotar desde enero— con un tope duro
    por serie para el caso torpe (una serie semanal que arranca en 2015).
  - **Editar la serie reescribe el futuro y nunca el pasado.** Un aumento de sueldo se ve
    el mes que viene; lo ya cobrado no se toca. Solo se reescriben las cuotas que siguen en
    el estado con que nacieron: una facturada o pagada ya vive su propia vida. Las que se
    caen del calendario nuevo se sueltan marcadas con `series_dropped`, que es lo único que
    permite reponerlas si el cambio se revierte **sin** reponer las que alguien borró a
    propósito.
  - **En las cadencias por mes el día se conserva y se recorta, no se arrastra**: un cobro
    del 31 cae el 28 de febrero y vuelve al 31 en marzo. Calcular cada fecha desde la
    anterior dejaría el cobro en el día 28 para siempre después de un solo febrero.

  La generación corre en el dispositivo (`RecurringKeeper` en `AppShell`), atada a la
  colección y no a un temporizador: así ocurre al abrir la app, al crear una serie y también
  cuando la serie llegó del otro dispositivo. En el servidor habría necesitado cron, y el
  cron del JSVM ya costó meses de silencio.
- **El impuesto no se llama IVA en el código y no es chileno.** El mismo mecanismo es IVA en
  Chile o España, VAT en el Reino Unido, GST en Australia, IGV en Perú. Por eso el nombre, la
  tasa, cada cuánto se declara, con qué fecha entra un movimiento al período y si el impuesto
  de los gastos da crédito son **ajustes de la cuenta** (`tax_label`, `tax_rate`,
  `tax_period`, `tax_basis`, `tax_on_expenses`), no constantes. Lo que hace que esto funcione
  de verdad es una decisión anterior: **cada movimiento guarda el impuesto como monto, no como
  tasa**, así que conviven un documento al 19%, otro al 21% y uno exento sin conflicto; la
  tasa de `settings` es solo el valor por defecto del formulario. El «sales tax»
  estadounidense es el caso que obliga a `tax_on_expenses`: allí la compra no da crédito y el
  cierre solo suma lo cobrado.
- **El cierre de impuestos dice lo que NO ve** (`components/TaxClose.tsx`). Suma solo lo
  anotado, y como un movimiento sin impuesto escrito puede ser un exento o un olvido, muestra
  cuántos son y cuánto valen. Nunca dice «esto es lo que debes pagar» —las exenciones y
  remanentes los decide una ley que la app no conoce— y nunca mezcla monedas: cada una se
  suma aparte y el total en moneda base usa el cambio **congelado** de cada movimiento.
- **La moneda la pone la cuenta; el formato, quien lee.** `lib/money.ts` guarda la moneda base
  en una variable de módulo que fija `AppShell` (los formateadores los llaman treinta
  componentes sin acceso a la configuración), y el idioma sale de `navigator.language`. Ese
  idioma **hay que validarlo construyendo un `Intl.NumberFormat`**, no preguntando por
  `supportedLocalesOf`: un sistema con `LANG=en_US.POSIX` entrega `"en-US@posix"`, que pasa el
  chequeo fácil y revienta al construir — y como esto ocurre al cargar el módulo, la
  excepción no rompe una cifra, deja la app en blanco. Se le quita el sufijo y se prueba.
- Las fechas se formatean en **UTC** (`lib/dates.ts`). Los campos de solo-fecha caen en
  medianoche UTC; renderizarlos en `America/Santiago` los correría un día hacia atrás.
- **El panel de la base no sale a internet y el registro está cerrado.** `vps/nginx.conf`
  devuelve 404 a `/_/` y a `/api/collections/_superusers/` —bloquear solo el panel no sirve,
  porque el panel es un cliente de esa API— y `users.createRule` vuelve a ser `null` por
  migración (1770002300) y no por un clic, que es como se abrió sin que nadie se enterara.
  Para administrar: `ssh -L 8095:127.0.0.1:8095 root@srv1134838.hstgr.cloud` y abrir
  `http://127.0.0.1:8095/_/`. Cuentas nuevas, desde ahí.
- **Respaldo: diario adentro, catorce afuera, y probado.** PocketBase respalda solo a las
  03:00 y guarda siete en `pb_data`; `/root/vps-admin/backup-proyectos.sh` (cron 07:30 UTC)
  saca la copia del volumen a `/root/vps-admin/backups/proyectos`. Lo que todavía falta es
  salir del servidor: mismo disco, misma máquina. La restauración se probó de verdad —zip
  extraído, contenedor limpio, sesión y datos completos— porque un respaldo que nunca se
  restauró no es un respaldo.
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
