# Deployment Guide

This document covers production deployment for the WhatsApp Campaign Manager.
It is a self-hosted platform: you provision the database, cache, and app
processes; nothing is tied to a third-party host.

---

## 1. Architecture

| Component | What it does | Default port |
|---|---|---|
| **api** | NestJS HTTP server (REST + Swagger + SSE for the inbox) and in-process BullMQ workers | 4000 |
| **worker** | Same binary with `PROCESS_ROLE=worker`: disables the HTTP listener and runs only the BullMQ workers | – |
| **web** | Built React SPA (static files served by Nginx) | 80 |
| **postgres** | Primary store (PostgreSQL 16) | 5432 |
| **redis** | BullMQ queues + rate limiting + SSE fan-out (Redis 7, AOF enabled) | 6379 |

BullMQ coordinates jobs through Redis, so running **multiple** `api` or
`worker` processes is safe: every job is processed exactly once regardless of
how many workers are listening. Scale out by adding processes, not by
re-architecting.

Jobs run in-process on the `api` process by default. If campaign/import loads
are heavy, add dedicated `worker` processes and keep the `api` processes
focused on request latency.

---

## 2. Prerequisites

- Node.js **>= 20** and pnpm **9.x** (bare-metal path) — or Docker + Docker Compose.
- PostgreSQL **>= 14** (16 recommended).
- Redis **>= 6.2** (7 recommended, AOF enabled).

---

## 3. Configuration

All configuration is environment variables read by the API
(`apps/api/.env` in dev, real env in prod). See `apps/api/.env.example` —
**required** variables are marked there; every optional variable tolerates a
blank value (treated as "not configured") rather than failing to boot.

Critical variables:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | `redis://host:6379` |
| `ACCESS_TOKEN_SECRET` | Generate: `openssl rand -base64 48` |
| `APP_ENCRYPTION_KEY` | AES-256-GCM key, **exactly 64 hex chars**: `openssl rand -hex 32` |
| `WEB_ORIGIN` | Comma-separated browser origins allowed via CORS |
| `TRUST_PROXY` | Set to the number of reverse-proxy hops (e.g. `1` behind Nginx) |
| `PROCESS_ROLE` | `api` (default) or `worker` |
| `PORT` | HTTP port, default `4000` |
| `MAIL_*` | Transactional email (optional): `MAIL_ENABLED`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO` |
| `APP_PUBLIC_URL` | Public origin used to build password-reset links (default `http://localhost:5173`) |
| `META_*` | Meta WhatsApp Business Cloud API credentials — **optional fallbacks only**, see below |
| `SEED_ADMIN_*` | Admin bootstrap for `pnpm db:seed` (all three together, or all blank) |

> **Meta credentials live in the dashboard, not `.env`.** The access token and
> WABA ID are always read from the database and set at **Settings → WhatsApp**
> (the dashboard). `META_APP_SECRET`, `META_VERIFY_TOKEN`, and
> `META_GRAPH_API_VERSION` in env are only fallbacks used until the same values
> are saved in the dashboard — stored values always win. `META_ACCESS_TOKEN`,
> `META_WABA_ID`, and `META_PHONE_NUMBER_ID` in env are not read by the API at
> all.

> **Secrets:** `ACCESS_TOKEN_SECRET` and `APP_ENCRYPTION_KEY` must be stable
> across restarts. Rotating them logs out every user / re-encrypts nothing —
> keep backups.

---

## 4. Option A — Docker Compose (recommended)

```bash
# 1. Create the environment file
cp deploy/env/api.env.example deploy/env/api.env
#    ... then edit deploy/env/api.env with real secrets

# 2. Build and start
docker compose build
docker compose up -d

# 3. Migrations run automatically (migrate service), then API + worker start
docker compose ps
```

The web container serves the SPA on `http://<host>:80` and proxies `/api` to
the API container, so the whole stack is reachable at one origin.

Scale dedicated workers: `docker compose up -d --scale worker=3`

Useful commands:

```bash
docker compose logs -f api
docker compose exec postgres pg_dump -U whatsapp -d whatsapp -Fc -f /tmp/backup.dump
docker compose restart worker
```

---

## 5. Option B — Bare metal with PM2

### 5.1 Build

```bash
pnpm install --frozen-lockfile
pnpm build          # builds packages/config, packages/shared, packages/ui, api, web
```

### 5.2 Database

```bash
pnpm db:migrate:deploy      # ORM migrator against DATABASE_URL
pnpm db:seed                # idempotent admin bootstrap (optional)
pnpm db:help-seed           # seed the built-in bilingual Help Center content (optional)
pnpm db:help-seed-1a        # seed email/notifications Help Center articles (optional)
pnpm db:help-seed-2a        # seed template preview / WhatsApp-style articles (optional)
```

### 5.3 Run under PM2

An `ecosystem.config.js` is provided at the repo root:

```bash
pm2 start ecosystem.config.js      # api (1) + worker (2)
pm2 scale api 2                    # more HTTP instances
pm2 scale worker 4                 # more job-processing instances
pm2 save                           # persist for pm2 resurrect
```

Process model:

- `api` — `apps/api/dist/main.js`, `PROCESS_ROLE=api`, cluster mode, HTTP on `:4000`.
- `worker` — same script, `PROCESS_ROLE=worker`, no HTTP listener.

### 5.4 Web assets

Serve the built SPA (`apps/web/dist`) with Nginx (see below).

---

## 6. Nginx

Two reference configs are provided in `deploy/nginx/`:

- `web.conf` — used **inside the Docker web image** (serves SPA, proxies `/api` to `api:4000`).
- `nginx.conf.example` — host-level config: TLS, security headers, SPA fallback,
  `/api` proxy to `127.0.0.1:4000`, SSE support.

Key details:

- `location / { try_files $uri $uri/ /index.html; }` — SPA routing fallback.
- `/api/` proxy must set `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Request-Id`
  and disable buffering (`proxy_buffering off`) so the inbox SSE channel
  (`/api/inbox/events`) streams.
- Set `TRUST_PROXY=1` in the API so it honors forwarded headers for rate
  limiting and client IPs.
- `client_max_body_size 55m` (import uploads are capped at 50 MB).

---

## 7. Database migrations

Migrations live in `apps/api/drizzle/`. Two equivalent entry points:

```bash
pnpm db:migrate          # drizzle-kit migrate
pnpm db:migrate:deploy   # apps/api/src/scripts/migrate.ts (hash-dedup, compile to dist)
```

Migrations are idempotent against the `drizzle.__drizzle_migrations` journal;
re-running them is safe.

---

## 8. Backups

`deploy/scripts/backup.sh` takes a logical backup of the PostgreSQL database,
a Redis snapshot hint, and the file-storage directories (import uploads, media,
report exports). Retention pruning via `KEEP_DAYS` (default 14).

```bash
# local tooling
./deploy/scripts/backup.sh /backups

# dockerized postgres
DATABASE_URL=postgresql://whatsapp:pass@localhost:5432/whatsapp ./deploy/scripts/backup.sh
```

Restore (`deploy/scripts/restore.sh <backup-dir>`) **drops and recreates the
database** — stop the app first:

```bash
pm2 stop api worker          # or: docker compose stop api worker
./deploy/scripts/restore.sh /backups/20260801_120000
pm2 start ecosystem.config.js
```

Schedule nightly backups with cron:

```cron
30 2 * * * cd /srv/whatsapp && ./deploy/scripts/backup.sh /backups >> /var/log/whatsapp-backup.log 2>&1
```

---

## 9. Health checks

Public endpoints (no auth):

- `GET /api/health` — liveness (process up), returns `{"status":"ok",...}`.
- `GET /api/ready` — readiness (checks PostgreSQL `select 1` and Redis `PING`;
  503 with per-dependency detail when a dependency is down).

Use them for container healthchecks, load-balancer checks, or PM2:

```bash
curl -fsS http://localhost:4000/api/health && curl -fsS http://localhost:4000/api/ready
```

---

## 10. Logging

Pino JSON logs. Set `LOG_PRETTY=false` in production and `LOG_LEVEL=info`.
All HTTP requests are logged with a request id that is echoed back in
`X-Request-Id`. PM2 writes to `~/.pm2/logs`; Docker: `docker compose logs -f`.

---

## 11. Operational notes

- **Meta webhooks** must be configured to point at `https://<host>/api/webhooks/whatsapp`
  with the `META_VERIFY_TOKEN` you configured; the API validates the
  `X-Hub-Signature-256` header against the app secret.
- **Template creation with variables** sends Meta `example` values derived from
  the sample values entered in the create dialog (body, text header, and dynamic
  URL buttons). If a template is rejected for its variable format, the API
  returns an actionable message — variables must be numbered sequentially
  `{{1}}, {{2}}, …` starting at `{{1}}` across header, body, and button URLs.
- **Scale**: multiple API/worker instances are safe (Redis-coordinated jobs).
  Watch memory (PM2 `max_memory_restart: 512M` is set) and Postgres connection
  counts (`pool` sizing in `database.module.ts`).
- **Uploads/export retention**: files accumulate under `apps/api/uploads`,
  `apps/api/data`, `apps/api/exports` — include them in backups and prune old
  exports if desired.
- **Upgrades**: `git pull && pnpm install && pnpm build`, run `pnpm db:migrate:deploy`,
  then `pm2 reload ecosystem.config.js` (or rebuild Docker images).
