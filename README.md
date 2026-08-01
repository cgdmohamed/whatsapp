# WhatsApp Campaign Manager

Self-hosted WhatsApp campaign management and team inbox platform built on the
**Meta WhatsApp Business Cloud API**.

Manage contacts, import/segment audiences, schedule and send message-template
campaigns, and run a shared team inbox with assignment, opt-out handling, and
real-time updates — all behind your own API and database.

## Features

- **Campaigns** — draft, schedule, and send WhatsApp template campaigns to
  segments; per-recipient delivery status, retries with exponential backoff,
  and duplicate-send protection across worker restarts.
- **Contacts & segmentation** — contact import (CSV/XLSX) with validation and
  duplicate handling, tags, and contact lists as audience segments.
- **Team inbox** — incoming conversations, assignments, internal notes, quick
  replies, media, and opt-out (stop) processing.
- **Templates** — sync WhatsApp message templates from Meta, draft with
  variable components, submit for approval.
- **Reports** — dashboard KPIs, campaign performance, failure analysis, and
  CSV report exports (queued, processed by a BullMQ worker).
- **Help Center** — built-in bilingual (Arabic/English) user guide with
  contextual help on every page, full-text search with Arabic normalization,
  article feedback, version history, and an ADMIN management area.
- **Admin** — role-based access (ADMIN / MANAGER / AGENT), audit log,
  integration logs, settings, and operations (queue/cache maintenance).
- **Ops-ready** — health/readiness probes, JSON logging, rate limiting, audit
  trail, DB migrations with an idempotent journal, and backup/restore scripts.
- **Transactional email & notifications** — secure password recovery
  (single-use hashed reset tokens), configurable password policy, admin
  reset-link/temp-password modes, bilingual transactional emails via a BullMQ
  queue, in-app notification bell with SSE real-time updates, notification
  preferences, campaign/import/Meta alert events, and an optional daily
  management summary.

## Architecture

```
┌────────────┐    /api     ┌──────────────────────────────────────────┐
│  web (SPA) │───────────► │  api (NestJS)                             │
│   (Nginx)  │◄─────────── │  └─ HTTP server (REST + SSE)              │
└────────────┘  SSE (inbox)│  └─ BullMQ workers (campaign, inbox,      │
                           │     imports, exports, webhooks, sync)     │
                           └───────────────┬──────────────┬────────────┘
                                           │              │
                                     ┌─────▼─────┐   ┌────▼─────┐
                                     │ PostgreSQL│   │  Redis   │
                                     └───────────┘   └──────────┘
```

- **API**: NestJS 10, Drizzle ORM, BullMQ, Pino logging, Swagger.
- **Web**: React 18 + Vite + Tailwind, TanStack Query, React Router.
- **Storage**: PostgreSQL (primary), Redis (queues, rate limiting, realtime fan-out).

## Getting started (development)

Requirements: Node.js ≥ 20, pnpm 9, PostgreSQL, Redis.

```bash
# 1. Install and build workspace packages
pnpm install
pnpm build

# 2. Configure the API (copy .env.example, adjust DATABASE_URL / REDIS_URL)
cp apps/api/.env.example apps/api/.env

# 3. Create the database, run migrations, seed the admin user
pnpm db:migrate:deploy
pnpm db:seed

# 4. Run the API (http://localhost:4000/api) and web (http://localhost:5173)
pnpm dev:api
pnpm dev:web
```

Default seeded admin (dev only): `admin@whatsapp.local` /
`ChangeMeNow_2026!` — change it on first login.

Swagger docs: http://localhost:4000/api/docs (set `SWAGGER_ENABLED=true`).

## Project layout

```
apps/
  api/        NestJS API (modules, workers, drizzle migrations, test/)
  web/        React SPA
packages/
  shared/     Shared DTOs, Zod schemas, constants
  config/     Shared runtime config helpers
  ui/         React UI components
deploy/       Nginx configs, env templates, backup/restore scripts
docker-compose.yml, Dockerfile, ecosystem.config.js
```

## Testing

```bash
pnpm typecheck      # all packages
pnpm lint
pnpm test           # API unit + integration (176 tests, no external deps)
pnpm --filter @wa/api test:e2e   # webhook E2E (needs local Postgres + Redis)
```

## Production

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for Docker Compose and bare-metal/PM2
deployment, Nginx setup, backups, health checks, and operational notes.

## Security

- HTTP-only auth cookies, signed JWT access tokens, refresh-token rotation.
- AES-256-GCM encryption of Meta API credentials at rest.
- Role-based route guards (ADMIN / MANAGER / AGENT) with service-level
  ownership checks; full audit log.
- Helmet security headers, rate limiting, CORS allow-list, raw-body webhook
  signature verification.
