# proyectos

Gestor personal de proyectos, un dominio: `tda.jpreyes.cl`. Admite varias cuentas, y
cada una ve solo lo suyo (ver [Cuentas y aislamiento](#cuentas-y-aislamiento)).

El trabajo real vive afuera — en carpetas, repos, planillas, Overleaf. Esta app no
intenta absorberlo: es el **índice y el punto de reentrada**. Abres un workspace y en una
pantalla recuperas qué es, dónde vive cada cosa, dónde quedaste y qué sigue. Encima de eso
corren la gestión, los pendientes y las finanzas de todos tus dominios a la vez.

## Arquitectura

```
cloudflared ──┬── /api/*, /_/*  ──> pocketbase:8090   (REST + admin UI)
              └── /*            ──> web:3000          (Next.js 15)
```

Un solo origen: sin CORS, sin subdominio extra, la cookie de sesión funciona igual en
servidor y navegador. En desarrollo no hay túnel, así que Next proxea los mismos dos
prefijos y el comportamiento es idéntico.

| Carpeta | Qué hay |
|---|---|
| `pb/pb_migrations/` | El esquema completo, como migraciones JS. Se aplican solas al arrancar. |
| `web/` | Next.js 15 · React 19 · Tailwind v4 · sin librería de componentes |
| `cloudflared/` | Configuración del túnel (el `config.yml` real está gitignoreado) |

## Desarrollo local

Necesitas el binario de PocketBase 0.39.x en `pb/` ([releases](https://github.com/pocketbase/pocketbase/releases)).

```bash
cd pb && ./pocketbase serve --dir=./pb_data --migrationsDir=./pb_migrations
```

En otra terminal:

```bash
cd web && cp .env.example .env.local && pnpm install && pnpm dev
```

Abre `http://localhost:3000/_/` — PocketBase te pide crear el superusuario en el primer
arranque. Luego, en el admin, ve a **Collections → users → New record** y crea tu usuario
de la app (correo + contraseña). Ese es el que usas en `http://localhost:3000/login`.

## Despliegue

### VPS srv1134838 — `https://tda.jpreyes.cl`

Ahí cloudflared ya corre como servicio systemd, con **un solo túnel** para todos los
sitios del box y configuración remota (dashboard de Zero Trust; no hay `config.yml` en
disco). El contenedor `cloudflared` del repo no se usa: queda bajo el perfil `tunnel` y
en su lugar un nginx hace el mismo reparto de rutas, publicando un único puerto local
que el túnel enruta.

```
cloudflared (systemd) → 127.0.0.1:8093 → nginx ─┬── /api/*, /_/* → pocketbase:8090
                                                └── /*           → web:3000
```

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
```

En el dashboard, el túnel del box lleva un public hostname `tda.jpreyes.cl` → HTTP →
`localhost:8093`. Las cuentas (superusuario del panel y usuario de la app) se crean con
`pocketbase superuser upsert` y un POST a `users`; quedan en `vps/credentials.env`,
gitignored.

### Host sin cloudflared — túnel propio

```bash
cloudflared tunnel login
cloudflared tunnel create proyectos
cloudflared tunnel route dns proyectos proyectos.jpreyes.cl
```

El paso `create` escribe `<TUNNEL_ID>.json`; ponlo en `cloudflared/`. Después:

```bash
cp cloudflared/config.example.yml cloudflared/config.yml
```

Ajusta `credentials-file` al nombre real del JSON y levanta todo:

```bash
docker compose --profile tunnel up -d --build
```

La primera visita a `https://<tu-dominio>/_/` crea el superusuario.

## Respaldo

Todo el estado vive en el volumen `pb_data` (SQLite + archivos subidos).

```bash
docker compose exec pocketbase tar czf - -C /pb pb_data > backup-$(date +%F).tar.gz
```

PocketBase también trae respaldo programado en **Settings → Backups** desde el admin UI.

> **No pongas `pb_data/` en Dropbox.** SQLite con sincronización de archivos se corrompe.
> El repo puede vivir en Dropbox; la base de datos no.

## Cuentas y aislamiento

Cada cuenta ve **solo lo suyo**, catálogo incluido. Todas las colecciones llevan `owner`
con reglas `owner = @request.auth.id`; el campo lo escribe el hook `owner.pb.js` en cada
creación, así que el cliente no lo elige y no puede falsearlo.

**Cada cuenta nueva se siembra sola** (`pb_hooks/seed_user.pb.js`): recibe su propia
copia del catálogo — taxonomía, categorías, cuentas y `settings` — más cinco tareas de
bienvenida que explican por dónde empezar. Sin eso, con el catálogo scopeado la app
abriría en blanco y el ledger no tendría dónde imputar.

El catálogo no está hardcodeado: se copia de la cuenta más antigua, que es la que quedó
con las filas de las migraciones originales. Una sola fuente de verdad — si curas tu
vocabulario, las cuentas nuevas heredan el curado y no una lista congelada en el código.
En una instalación nueva no hay de quién copiar, así que la primera cuenta **adopta** las
filas sin dueño que dejaron las migraciones.

La siembra es idempotente y por colección: corre también en cada arranque y solo llena lo
que falte, así que una siembra a medias se repara sola. Las tareas de bienvenida son la
excepción — van solo cuando la cuenta es nueva de verdad, para que no reaparezcan cada
vez que termines de borrarlas.

> Los índices únicos tienen que incluir a `owner` (`1770001500`). `taxonomy(group,value)`
> y `accounts(name)` eran únicos a nivel de tabla: con catálogo por cuenta, eso impide que
> la segunda cuenta tenga su propia "Cuenta corriente". Se manifiesta como una siembra a
> medias con "Value must be unique" en el log.

No hay registro público: las cuentas las crea un superusuario desde `/_/`
(`users.createRule` es `null`).

## Modelo

Siete colecciones. `projects` es la raíz y todo cuelga de ella.

- **`projects`** — el workspace. Jerárquico (`parent`), con `meta` libre por tipo.
- **`resources`** — el mapa de dónde vive el proyecto. El campo que importa es `purpose`:
  la línea que le explica a tu yo de dentro de tres semanas para qué era esa carpeta.
- **`log`** — bitácora append-only.
- **`tasks`** — pendientes.
- **`entries`** — ledger: ingresos y egresos, con CLP/UF/USD, IVA, retención y el ciclo
  proyectado → comprometido → facturado → pagado (de ahí sale "por cobrar").
- **`entities`** — mandantes, universidades, revistas, agencias.
- **`accounts`, `categories`** — taxonomía del ledger.
- **`inbox`** — captura universal, con triaje obligatorio a un plan concreto.
- **`routines`, `routine_log`** — rutinas y sus repeticiones.
- **`daily`** — ventana de sueño y energía por franja.

## PWA e instalación

Instalable en escritorio y en el celular. El manifest y los iconos se generan
(`app/manifest.ts` y `app/icons/[size]`), así que no hay binarios en el repo ni
dependencias de imagen. En escritorio aparece un botón **Instalar** en la barra de
captura cuando el navegador lo permite.

**Qué funciona sin conexión**, y qué no:

- **Sí:** capturar. Todo lo que escribes en la barra va primero a IndexedDB y después al
  servidor — el mismo camino con o sin red. Si navegas sin conexión, el service worker
  sirve `/offline`, que es una página estática con su propio cuadro de captura.
- **No:** el resto. La app es server-rendered; sin servidor no hay workspaces, finanzas ni
  bitácora. Hacerlo funcionaría, pero implica reescribir el frontend a local-first.

La cola se vacía sola al volver la conexión, al volver a la pestaña, y vía Background Sync
(donde el navegador lo soporte, es decir Chrome y Edge; en Safari y Firefox se vacía cuando
la pestaña está viva). Si una escritura se rechaza, queda en la cola con su error en vez de
desaparecer en silencio.

> El service worker precachea `/offline` **y sus chunks de JavaScript**. Sin eso la página
> se ve bien pero nunca hidrata: el cuadro de captura parece funcionar y no guarda nada.

## Resumen diario por correo

`pb/pb_hooks/daily_digest.pb.js` corre dentro de PocketBase (su propio cron y su propio
mailer, sin servicios extra) y envía a las 07:30 lo vencido, lo de esta semana, los plazos
de proyecto, lo por cobrar, la bandeja sin procesar y los activos sin siguiente paso. Un
correo por cuenta, cada uno con sus propios datos. Si a alguien no le pasa nada ese día,
no recibe correo.

Para activarlo basta configurar SMTP en `/_/` → **Settings → Mail settings**.

**El horario es por cuenta.** El job corre cada 15 minutos y en cada pasada decide a
quién le toca, según su hora en Configuración y si ya se le mandó hoy
(`settings.digest_last_sent`). Cambiar la hora aplica sin reiniciar, y si el contenedor
estaba caído a esa hora exacta el correo sale en cuanto vuelve, en vez de perderse el
día. El precio es la granularidad: puede llegar hasta 15 minutos tarde.

Se descartó un cron por cuenta —más exacto al minuto— porque obliga a mantener vivo el
registro de jobs ante altas, bajas y cambios de configuración, y un cron que no dispara
no se recupera.

> **Sin zona horaria por cuenta.** Todo se calcula en la hora local del proceso
> (`America/Santiago`). goja no trae `Intl`, y `toLocaleString` acepta la opción
> `timeZone` pero **la ignora en silencio**: le pidas Madrid o Tokio, devuelve la hora
> local igual. Soportar husos distintos exigiría guardar un desfase en minutos por
> cuenta y mantenerlo a mano en cada cambio de horario de verano.

> `DIGEST_TO` redirige **todos** los resúmenes a una sola dirección. Es un escape para
> depurar: con más de una cuenta, quien reciba verá los datos de las demás.

La lógica vive en `pb_hooks/lib/digest.js` y el hook es una cáscara que hace `require()`
dentro de cada handler. No es estilo: los handlers del JSVM corren en una VM aislada que
no ve el ámbito del archivo, y tocar la base al cargar los hooks tumba el archivo entero
con un panic de Go que el `try/catch` no atrapa. Los comentarios del hook lo explican.

## Por qué la interfaz es así

Varias decisiones que parecen estéticas son funcionales. Están documentadas en
[CLAUDE.md](CLAUDE.md), pero en resumen:

- **El siguiente paso son dos campos, no uno** (`cuando…` / `entonces…`). Es un plan
  si-entonces, no una tarea: automatiza el *inicio*, que es el paso que falla. El
  disparador puede ser una situación o una hora — el ensayo que comparó ambos no encontró
  diferencia; lo que importa es que sea específico y se repita.
- **Capturar no cierra el bucle, planificar sí.** Una meta pendiente sigue generando
  pensamientos intrusivos y peor rendimiento en tareas no relacionadas hasta que existe un
  plan concreto, aunque no la hayas ejecutado. Por eso la bandeja obliga a darle destino.
- **Las rutinas no tienen rachas.** Saltarse una repetición no afecta la formación del
  hábito, así que nada en la interfaz "se rompe": la grilla muestra huecos como dato.
- **El bloque "Retomar" nunca cambia de lugar.** Volver a una tarea tras días de pausa
  depende de reconstruir el contexto mirando, no de recordar.
- **Ninguna fecha aparece sola**: siempre con distancia y barra de urgencia.
- **Sin rachas, puntos ni insignias.** Suman ruido, no adherencia.
- **Sin porcentajes de avance.** Invitan a perfeccionismo y suelen ser ficción.
