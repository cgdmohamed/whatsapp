# syntax=docker/dockerfile:1

# ---------- Builder: install + build every workspace package ----------
FROM node:22-alpine AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Install dependencies first to leverage Docker layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# Build all workspace packages in topological order (config -> shared -> ui -> api -> web).
RUN pnpm -r --sort run build

# ---------- Runtime: API + workers ----------
FROM node:22-alpine AS api
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=builder /app /app
# Remove devDependencies across the workspace; production deps and the
# compiled dist/ output (including dist/scripts/*.js) are retained.
RUN pnpm prune --prod

EXPOSE 4000

# PROCESS_ROLE=api starts the HTTP server AND the BullMQ workers.
# Override with PROCESS_ROLE=worker for dedicated worker processes.
CMD ["node", "apps/api/dist/main.js"]

# ---------- One-shot migration image (run, migrate, exit) ----------
FROM api AS migrate
CMD ["node", "apps/api/dist/scripts/migrate.js"]

# ---------- Web: static assets served by nginx ----------
FROM nginx:1.27-alpine AS web
COPY deploy/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
