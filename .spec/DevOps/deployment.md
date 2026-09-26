# Deployment — Despliegue y Entorno de Desarrollo

> **Principio rector:** Cualquier desarrollador nuevo debe poder levantar el proyecto completo en **menos de 5 minutos** siguiendo este documento.

---

## 1. Requisitos del Entorno

| Herramienta | Versión mínima | Verificación |
|---|---|---|
| Node.js | ≥ 20 LTS | `node --version` |
| pnpm | ≥ 9 | `pnpm --version` |
| PostgreSQL | ≥ 16 | `psql --version` |
| Docker | ≥ 26 | `docker --version` |
| Docker Compose | ≥ 2 | `docker compose version` |
| Git | ≥ 2.40 | `git --version` |

---

## 2. Configuración Inicial (Local)

### 2.1 Clonar e instalar dependencias

```bash
git clone <repo-url> cuadra
cd cuadra
pnpm install
```

### 2.2 Variables de entorno

```bash
# Copiar el template de variables
cp .env.example .env

# Editar .env con tus valores locales
# MÍNIMO requerido para desarrollo:
#   DATABASE_URL
#   JWT_SECRET
#   JWT_REFRESH_SECRET
```

### 2.3 Base de datos con Podman

```bash
# Levantar solo PostgreSQL
podman run -d --name cuadra-postgres \
  -e POSTGRES_USER=cuadra \
  -e POSTGRES_PASSWORD=cuadra_dev \
  -e POSTGRES_DB=cuadra_dev \
  -p 5432:5432 \
  postgres:16-alpine

# Redis (opcional en dev — sin REDIS_URL el backend usa cache in-memory)
podman run -d --name cuadra-redis -p 6379:6379 redis:7-alpine

# Ejecutar schema (primer inicio)
pnpm --filter backend exec prisma db push

# Sembrar datos de prueba
pnpm --filter backend exec tsx prisma/seed.ts
```

### 2.3.1 Pruebas de carga (K6)

Requiere el binario K6 instalado (`brew install k6` / `sudo dnf install k6`). Backend debe estar corriendo.

```bash
pnpm test:load              # smoke (1 VU, 1 min)
pnpm test:load:products     # ramp 50 VUs — GET products
pnpm test:load:sync         # 30 VUs — sync pull
# POS crea ventas reales — solo staging:
BASE_URL=https://staging.../api pnpm test:load:pos
```

### 2.4 Iniciar desarrollo

```bash
# Inicia backend (puerto 4000) + frontend (puerto 3000) en paralelo
# El frontend corre directamente (hot reload), no en Docker
# PostgreSQL debe estar corriendo previamente (paso 2.3)
pnpm run dev
```

| Servicio | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000/api |
| Prisma Studio | `npx prisma studio` (http://localhost:5555) |

> **Nota:** El frontend se sirve con `next dev` (Turbopack, hot reload) durante desarrollo. No se usa Docker para el frontend en ningún entorno — desarrollo usa `next dev`, producción usa `output: 'export'` + CDN.

---

## 3. Docker Compose — Backend + Base de Datos

> **El frontend se sirve como estático (ver §3.1).** Solo backend y PostgreSQL requieren contenedores.

### `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: cuadra
      POSTGRES_PASSWORD: cuadra_dev
      POSTGRES_DB: cuadra_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "cuadra"]
      interval: 10s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgresql://cuadra:cuadra_dev@postgres:5432/cuadra_dev
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - FRONTEND_URL=${FRONTEND_URL:-http://localhost:3000}
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

> **Nota:** El servicio `frontend` fue eliminado del compose. El frontend se sirve como archivos estáticos (ver §3.1).

### 3.1 Frontend — Static Export

Cuadra es arquitectónicamente una SPA: **0 API routes en Next.js**, **0 server-side data fetching**, **100% de las páginas son `'use client'`** o wrappers vacíos. El frontend se construye como estático con `output: 'export'` y se sirve desde cualquier CDN o hosting estático. El servidor Node.js del frontend **no es necesario**.

#### Configuración

**`next.config.mjs`:**
```js
const nextConfig = {
  output: 'export',
  trailingSlash: true,
};
```

**`frontend/.env.production`:**
```
NEXT_PUBLIC_API_URL=https://api.cuadra.app/api
```

> El cliente llama directamente al backend via `NEXT_PUBLIC_API_URL`. El proxy `rewrites()` fue eliminado — era un atajo de desarrollo, no una necesidad arquitectónica.

#### Build

```bash
pnpm --filter frontend build    # → frontend/out/ (~5MB, 36 páginas estáticas)
```

#### Deploy

| Plataforma | Build command | Output dir |
|---|---|---|
| **Cloudflare Pages** | `pnpm --filter frontend build` | `frontend/out` |
| **Netlify** | `pnpm --filter frontend build` | `frontend/out` |
| **Vercel** | Override build: `pnpm --filter frontend build` | `frontend/out` |
| **S3 + CloudFront** | Build en CI, upload `out/` al bucket | `frontend/out` |
| **Nginx / Caddy** | Build en CI, copia `out/` al servidor | `frontend/out` |

#### CORS — Backend

El backend debe permitir CORS desde el dominio del frontend estático. Ya está configurado en `backend/src/main.ts`:

```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
});
```

Para producción: `FRONTEND_URL=https://cuadra.app`.

#### PWA / Service Worker

Serwist genera el service worker durante el build estático. Configuración en `sw.ts`. El archivo `manifest.ts` requiere `export const dynamic = 'force-static'` para compatibilidad con `output: 'export'`. Build verificado: 66 precache entries, ~2MB.

**`next dev` no registra el SW** (`SerwistRoot`): `sw.ts` usa CacheFirst en scripts y en Turbopack eso sirve chunks viejos tras HMR (`module factory is not available`). En desarrollo se desregistra el worker y se limpia Cache Storage. El PWA sigue activo solo con `NODE_ENV=production`.

`skipWaiting: true` y `clientsClaim: true`: al publicar un frontend nuevo, el SW **toma el control al instante** en pestañas abiertas. En caja puede mezclar HTML viejo con JS nuevo a mitad de un ticket. Política: [§7](#7-deploys-sin-interrumpir-usuarios).

---

## 4. Variables de Entorno Críticas

### Matriz rápida (producción)

| Variable | Dónde | Notas |
|---|---|---|
| `DATABASE_URL` / `POSTGRES_*` | backend / compose | Nunca en git |
| `JWT_SECRET` | backend | Access JWT 15m en código |
| `FRONTEND_URL` | backend | CORS / links; HTTPS en prod |
| `NEXT_PUBLIC_API_URL` | frontend | URL pública API |
| `REDIS_URL` | backend (opcional) | Cache; fallback in-memory |
| Pago Móvil secrets | backend settings | No loguear |
| `SENTRY_DSN` | staging/prod | Opcional |
| `ASSISTANT_PROVIDER` / `ASSISTANT_BASE_URL` / `ASSISTANT_API_KEY` / `ASSISTANT_MODEL` | backend | Opcional. Sin URL o sin key el asistente queda apagado. Ver [assistant.md](../features/assistant.md) |

Archivos: `backend/.env.example`, `.env.production.example` (raíz). **No** asumir `.env.example` en la raíz del monorepo.

### `.env.example`

```bash
# ── Base de datos ──
DATABASE_URL="postgresql://cuadra:cuadra_dev@localhost:5432/cuadra_dev"

# ── JWT ──
JWT_SECRET="cambia-esto-en-produccion-min-32-chars"
JWT_REFRESH_SECRET="cambia-esto-en-produccion-min-32-chars"
JWT_ACCESS_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"

# ── Aplicación ──
NODE_ENV="development"
PORT=3001
API_PREFIX="/api"

# ── Frontend ──
# Desarrollo (.env.local):
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
# Producción (.env.production):
# NEXT_PUBLIC_API_URL="https://api.cuadra.app/api"
NEXT_PUBLIC_APP_NAME="Cuadra"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# ── Seguridad ──
BCRYPT_SALT_ROUNDS="12"
RATE_LIMIT_TTL="60"
RATE_LIMIT_MAX="100"

# ── Email (Opcional en dev) ──
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
MAIL_FROM="noreply@cuadra.app"

# ── Storage (Opcional en dev) ──
STORAGE_PROVIDER="local"          # local | s3
STORAGE_LOCAL_PATH="./uploads"
# S3_BUCKET=""
# S3_REGION=""
# S3_ACCESS_KEY=""
# S3_SECRET_KEY=""

# ── Observabilidad ──
LOG_LEVEL="debug"                 # debug | info | warn | error
SENTRY_DSN=""                     # Solo en staging/producción

# ── Feature Flags ──
FF_ACCOUNTING_MODULE="false"      # Módulo de contabilidad (en desarrollo)
FF_TAX_REPORTS="false"            # Reportes fiscales venezolanos (en desarrollo)
```

---

## 5. Scripts del Monorepo (`package.json` raíz)

```json
{
  "scripts": {
    "dev": "pnpm run --parallel dev",
    "dev:backend": "pnpm --filter backend dev",
    "dev:frontend": "pnpm --filter frontend dev",
    "build": "pnpm run --parallel build",
    "build:frontend": "pnpm --filter frontend build",
    "lint": "pnpm run --parallel lint",
    "typecheck": "pnpm run --parallel typecheck",
    "test": "pnpm run --parallel test",
    "test:e2e": "pnpm --filter e2e test",
    "db:push": "pnpm --filter backend exec prisma db push",
    "db:seed": "pnpm --filter backend exec tsx prisma/seed.ts",
    "db:studio": "pnpm --filter backend exec prisma studio",
    "podman:up": "podman run -d --name cuadra-postgres -e POSTGRES_USER=cuadra -e POSTGRES_PASSWORD=cuadra_dev -e POSTGRES_DB=cuadra_dev -p 5432:5432 postgres:16-alpine",
    "podman:start": "podman start cuadra-postgres",
    "clean": "pnpm -r exec rm -rf dist node_modules/.cache .next out"
  }
}
```

---

## 6. Staging on VPS (IP, automated)

Target for tester demos **without a domain**: SSH + Docker VPS, served at `https://YOUR_IP:8443` (self-signed LAN TLS). HTTP remains on `http://YOUR_IP:8081` as a fallback.

Stack on the server ([`docker-compose.prod.yml`](../../docker-compose.prod.yml)):

| Service | Role |
|---|---|
| `postgres` | Database (not published publicly) |
| `redis` | Cache |
| `backend` | NestJS API on internal port 4000; volume `uploads_data` |
| `nginx` | Static `frontend/out` + reverse proxy `/api` → backend; SSE for `/api/dashboard/stream`; host ports **8081** (HTTP) and **8443** (HTTPS) |

Frontend is built as a static export with `NEXT_PUBLIC_API_URL=/api` (same origin via Nginx). No separate Node process for Next.js.

### 6.1 One-time server bootstrap

```bash
# On the VPS (Docker already installed)
sudo mkdir -p /opt/cuadra && sudo chown "$USER:$USER" /opt/cuadra
git clone <your-repo-url> /opt/cuadra
cd /opt/cuadra

cp .env.production.example .env.production
# Edit .env.production:
#   POSTGRES_PASSWORD=...
#   JWT_SECRET=...   (min 32 random chars)
#   FRONTEND_URL=https://YOUR_IP:8443

# Open the published ports (example with ufw; Alpine may use iptables instead)
sudo ufw allow 8081/tcp
sudo ufw allow 8443/tcp

# First deploy (TLS cert + frontend build + compose + migrate + seed)
bash scripts/deploy.sh
```

`scripts/deploy.sh` calls [`scripts/generate-lan-tls.sh`](../../scripts/generate-lan-tls.sh), which writes a self-signed cert with an **IP SAN** to `nginx/certs/` (gitignored). Host port **8443** is used because many VPS already run OpenResty/nginx on **443**.

Create a **deploy-only SSH key** on your laptop (or CI machine), add the public key to `~/.ssh/authorized_keys` on the VPS for the deploy user, and keep the private key for GitHub Actions only.

### 6.2 GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Required | Example |
|---|---|---|
| `DEPLOY_HOST` | yes | `203.0.113.10` |
| `DEPLOY_USER` | yes | `deploy` |
| `DEPLOY_SSH_KEY` | yes | Private key PEM (full contents) |
| `DEPLOY_PATH` | no | `/opt/cuadra` (default if empty) |

Workflows: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) (automatic) · [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) (manual)

- After **CI quality** succeeds on a **push to `dev`**, the same workflow SSHs to the VPS (`deploy` job). This does **not** use `workflow_run` (that event only registers from the default branch).
- Manual: **Actions → Deploy → Run workflow** (the `Deploy` workflow must exist on the branch you select; prefer `dev` or `main`).

### 6.3 Automated flow

```
1. Push / merge to dev
     ↓
2. CI (lint + typecheck + unit tests for backend & frontend)
     ↓
3. Same workflow `deploy` job SSHs to the VPS and runs scripts/deploy.sh:
   - Ensure nginx/certs self-signed LAN TLS (IP SAN)
   - git fetch + reset --hard origin/dev
   - Build frontend/out via ephemeral `node:22.21-bookworm` (pnpm via GitHub release / npm, not `corepack prepare`)
   - docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   - prisma migrate deploy
   - seed **only if org count is 0** (or FORCE_SEED=1; skip with SKIP_SEED=1)
   - Smoke GET https://127.0.0.1:8443/api/health (-k) — expects HTTP 200 + DB connected
     ↓
4. Testers use https://YOUR_IP:8443 (accept the certificate warning once)
```

Volumes: `postgres_data`, `redis_data`, **`uploads_data`** (proofs / images survive container rebuilds).

Nginx: `/api/dashboard/stream` has `proxy_buffering off` and 1h read timeout for SSE.

Health: `GET /api/health` returns **503** when the database is unreachable (so Docker healthchecks fail correctly).

### 6.4 Tester access

| Item | Value |
|---|---|
| App URL (preferred) | `https://YOUR_IP:8443` |
| App URL (HTTP fallback) | `http://YOUR_IP:8081` |
| Health | `https://YOUR_IP:8443/api/health` |
| Admin email | `admin@cuadra.app` |
| Admin password | `000000` (from seed — change after first login in real use) |

Notes:

- **Use HTTPS** so browsers expose `crypto.subtle` (offline PIN) and allow service workers. Self-signed certs show a one-time warning — click through / “Advanced → proceed”.
- Regenerate cert after changing IP: `TLS_FORCE=1 bash scripts/generate-lan-tls.sh YOUR_IP` then restart nginx.
- Seed skips if organizations already exist; wipe volumes only if you intentionally want a fresh DB.

### 6.5 Verify & rollback

```bash
# On the VPS
cd /opt/cuadra
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -skf https://127.0.0.1:8443/api/health

# Re-run deploy manually
bash scripts/deploy.sh

# Rollback to a previous commit, then redeploy
git fetch origin
git reset --hard <good-commit-sha>
bash scripts/deploy.sh
```

Rollback de **aplicación** no deshace migraciones ya aplicadas. Ver [release-policy.md](release-policy.md) §4 y [database.md](../system/database.md) (expand/contract).

---

## 7. Deploys sin interrumpir usuarios

> **Principio rector:** Con el stack actual (un VPS, un contenedor `backend`, `docker compose up -d --build`) un deploy **corta el API**. Cero downtime no existe hasta haber ≥2 réplicas detrás de nginx. El POS está diseñado para sobrevivir ese corte; admin / dashboard / reportes no.

Esta sección es política de producción. Staging (IP, testers) puede desplegar en cualquier momento.

### 7.1 Qué corta el script actual (`scripts/deploy.sh`)

Orden real:

```
git reset --hard
  → build frontend/out (nginx sigue sirviendo ese directorio)
  → docker compose up -d --build   # recrea el único backend
  → prisma migrate deploy          # schema después del código nuevo
  → smoke GET /api/health
```

| Superficie | Durante el hueco |
|---|---|
| **POS (caja)** | Sigue cobrando. `createSale` → Dexie + `syncQueue`. Al volver el API, SyncEngine reintenta (backoff ~15–30s, máx. 5). Un deploy corto se siente como “un rato sin internet”, que el producto ya cubre. Nav fuera de `/pos` (sidebar, tabs, org, logout) se **bloquea** hasta `HEAD /api/health` 200. |
| **Admin, catálogo, reportes, CXC/CXP online** | Requests fallan hasta que el backend nuevo responda 200 en `/api/health` (`start_period` ~40s + tiempo de build). |
| **Dashboard SSE** (`/api/dashboard/stream`) | La conexión cae. El cliente reintenta solo. |
| **Sesión** | No se cierra. Access + refresh JWT viven en `localStorage`; un restart del API no invalida tokens. |

Hechos del compose actual (`docker-compose.prod.yml`):

- Un solo servicio `backend`. No hay `replicas`, `update_config` ni rolling.
- Nest **no** llama `enableShutdownHooks()`. Docker mata el proceso; requests in-flight se pierden.
- Nginx `depends_on: backend: condition: service_healthy` — no proxya `/api` hasta health 200.
- `prisma migrate deploy` corre **después** de levantar el contenedor nuevo. Si el código exige un schema que aún no está, hay una ventana rota.
- El build escribe `frontend/out` mientras nginx lo sirve → riesgo de HTML/JS a medias.
- Service worker: `skipWaiting` + `clientsClaim` (ver §3.1).

### 7.2 Política operativa (obligatoria en producción)

1. Desplegar **fuera de horario de caja** (después del cierre). Alpha / un local: esto es suficiente; no hace falta infra extra.
2. Avisar al local: corte de sync de ~1–2 min; **la caja sigue**.
3. Si hay migración que no sea solo additive **o** cambia `POST /api/sync/push` / el payload de sale encolada: no desplegar a mediodía. Tratar como breaking — [database.md](../system/database.md) expand/contract, [api-conventions.md](../system/api-conventions.md) §5.
4. **No mezclar en el mismo release de día:** restart de API + migración peligrosa + cambio de contrato de sync.
5. Smoke `GET /api/health` debe pasar. Si falla: rollback de **aplicación** (commit/tag anterior), no de BD — [release-policy.md](release-policy.md) §4.
6. Tras el deploy, confirmar que la cola de sync se vacía. Conflictos `oversold` pendientes no son fallo de deploy: son stock ([sync.md](../features/sync.md)).

### 7.3 Checklist pre-deploy

- [ ] ¿Hay migración? Clasificar: additive / expand-contract / destructiva ([database.md](../system/database.md) §4).
- [ ] ¿Cambia `/api/sync/*` o el modelo de sale encolada? Expand/contract; no el mismo instante que el frontend.
- [ ] ¿Cambia la UI de POS de forma visible? El SW va a claimear clientes — mejor al cierre, o avisar “recarga cuando termines el ticket”.
- [ ] Ventana: fuera de horario de caja, salvo hotfix ([release-policy.md](release-policy.md) §6).
- [ ] Tag/commit anterior listo para rollback de app.

### 7.4 Qué no hace falta todavía

Réplicas, blue/green, Kubernetes. Cuando haya varios locales **y** deploys de día, entonces (en este orden):

| Mejora | Para qué |
|---|---|
| `app.enableShutdownHooks()` + `stop_grace_period: 30s` en compose | Terminar requests in-flight |
| Migración **additive** *antes* de recrear el contenedor | Evitar ventana código-nuevo / schema-viejo |
| Publicar `frontend/out` de forma atómica (`out-new` → swap) | No servir HTML a medias |
| Dos instancias backend + `upstream` nginx + rolling (un contenedor a la vez, healthcheck, luego el otro) | El API no desaparece |
| Reload diferido del SW en POS (no `clientsClaim` a mitad de ticket) | No mezclar bundles en caja |

Hasta que duela: no implementar esto. Un restart de 30s es recuperable; una migración o un contrato de sync incompatible en el mismo release **no**.

---

## 8. Salud del Servicio

### Health Check Endpoint

```
GET /api/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-07-03T12:00:00.000Z",
  "database": "connected"
}
```

When the DB is down the handler responds with **HTTP 503** and `database: "disconnected"` (Docker/`curl -f` treat this as unhealthy).

### Docker Health Checks

```yaml
healthcheck:
  test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

---

---

## 9. Dependency Policy — Gestión de Dependencias

### Licencias permitidas

| Licencia | Permitida |
|---|---|
| MIT | ✅ |
| Apache 2.0 | ✅ |
| BSD (2-Clause, 3-Clause) | ✅ |
| ISC | ✅ |
| Unlicense | ✅ (dominio público) |
| GPL (v2, v3) | ❌ — Copyleft, incompatible con SaaS propietario |
| AGPL | ❌ — Copyleft de red |
| CC BY-NC | ❌ — No comercial |
| Sin licencia | ❌ — Requiere aprobación explícita del tech lead |

### Verificación de licencias

```bash
# Auditoría de licencias (usar license-checker o similar)
pnpm license-checker --production --summary

# Bloquear en CI
pnpm license-checker --production --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;Unlicense"
```

### Cadencia de actualización

| Tipo | Frecuencia | Herramienta |
|---|---|---|
| **Security patches** | Inmediato (24h max) | Dependabot security alerts + auto-merge |
| **Patch updates** (1.2.3 → 1.2.4) | Semanal (automático) | Renovate / Dependabot |
| **Minor updates** (1.2.3 → 1.3.0) | Mensual (con review) | Renovate / Dependabot + PR manual |
| **Major updates** (1.2.3 → 2.0.0) | Planificado (por milestone) | Manual, con plan de migración |

### Auditoría de seguridad

```bash
# Semanal — corre en CI y local
pnpm audit

# Si hay vulnerabilidades:
# 1. Revisar severidad
# 2. Critical/High: fix inmediato
# 3. Moderate: planificar en el sprint actual
# 4. Low: planificar en el siguiente sprint
```

### Reglas de versionado en package.json

```json
{
  "dependencies": {
    "nestjs": "^10.4.0",        // ✅ Caret: permite patch y minor (seguro)
    "prisma": "~6.0.0",         // ✅ Tilde: solo patch (más conservador)
    "class-validator": "0.14.1"  // ✅ Exacta: pin manual (máxima estabilidad)
  }
}
```

**Regla:** Dependencias core del framework (NestJS, Next.js, Prisma) usan caret. Utilidades de validación y transformación usan exacta.

---

## 10. Monitoring — Observabilidad en Producción

### Métricas expuestas

```
GET /api/metrics
```

| Métrica | Tipo | Descripción |
|---|---|---|
| `http_requests_total` | Counter | Requests totales por endpoint, método y status |
| `http_request_duration_seconds` | Histogram | Latencia P50, P95, P99 por endpoint |
| `db_pool_connections_active` | Gauge | Conexiones activas en el pool de Prisma |
| `db_pool_connections_idle` | Gauge | Conexiones inactivas |
| `db_query_duration_seconds` | Histogram | Latencia de queries individuales |
| `auth_failures_total` | Counter | Intentos de login fallidos por IP |
| `errors_total` | Counter | Errores 5xx por endpoint |

### Logs estructurados (Pino)

```typescript
// logger.config.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label) {
      return { severity: label };
    },
  },
  redact: {
    paths: ['password', 'token', 'rif', 'email', 'phone'],
    censor: '[REDACTED]',
  },
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
```

### Formato de log esperado

```json
{
  "severity": "info",
  "time": "2026-07-03T12:00:00.000Z",
  "msg": "Invoice created",
  "userId": "uuid",
  "companyId": "uuid",
  "invoiceId": "uuid",
  "duration": 45
}
```

### Thresholds de alerta

| Condición | Severidad | Canal |
|---|---|---|
| Error rate > 5% por 5 minutos | 🔴 Critical | PagerDuty / OpsGenie |
| P95 latency > 500ms por 10 minutos | 🟠 Warning | Slack #cuadra-alerts |
| DB pool > 80% utilizado | 🟠 Warning | Slack #cuadra-alerts |
| Login failures > 20/min por IP | 🟡 Info | Slack #cuadra-alerts |
| Sin health checks por 2 minutos | 🔴 Critical | PagerDuty |
| Disco del servidor > 85% | 🟠 Warning | Slack #cuadra-alerts |
| Cuota de API externa (SENIAT, email) > 80% | 🟡 Info | Slack #cuadra-alerts |

### Uptime y Status Page

- Health check público: `https://cuadra.app/api/health`
- Status page (recomendado): BetterStack / Statuspal
- Monitoreo externo: UptimeRobot o similar, chequeo cada 60s desde 3 regiones

---

*Referencia cruzada: [release-policy.md](release-policy.md) | [database.md](../system/database.md) | [sync.md](../features/sync.md) | [pos.md](../features/pos.md)*
