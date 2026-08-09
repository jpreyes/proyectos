# proyectos

Gestor personal de proyectos. Un solo usuario, un solo dominio: `proyectos.jpreyes.cl`.

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
de proyecto, lo por cobrar, la bandeja sin procesar y los activos sin siguiente paso. Si no
hay nada que decir, no manda correo.

Para activarlo: configura SMTP en `/_/` → **Settings → Mail settings**, y opcionalmente
define `DIGEST_TO` en el entorno (si no, usa el correo de tu usuario).

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
