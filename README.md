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

## Despliegue en el VPS

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
docker compose up -d --build
```

La primera visita a `https://proyectos.jpreyes.cl/_/` crea el superusuario.

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
