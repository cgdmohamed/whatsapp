/**
 * PM2 process definitions for production deployments.
 *
 * `api`     - Serves the HTTP API and also runs background BullMQ workers in
 *             the same process. Safe to scale to N instances: BullMQ
 *             coordinates jobs through Redis, so each job is processed once
 *             regardless of how many worker processes are running.
 * `worker`  - Dedicated worker process: starts the same Nest application with
 *             PROCESS_ROLE=worker, which disables the HTTP listener and runs
 *             only the BullMQ workers. Use this when you want to isolate heavy
 *             job processing from request latency.
 *
 * Requirements:
 *   - `pnpm build` must have been run (expects apps/api/dist/main.js).
 *   - .env is loaded automatically from each app directory by @nestjs/config.
 *
 * Start everything:   pm2 start ecosystem.config.js
 * Scale API only:     pm2 scale api 2
 * Scale workers only: pm2 scale worker 3
 */
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'apps/api/dist/main.js',
      cwd: __dirname,
      instances: process.env.WEB_CONCURRENCY ? parseInt(process.env.WEB_CONCURRENCY, 10) : 1,
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PROCESS_ROLE: 'api',
      },
      time: true,
    },
    {
      name: 'worker',
      script: 'apps/api/dist/main.js',
      cwd: __dirname,
      instances: process.env.WORKER_CONCURRENCY ? parseInt(process.env.WORKER_CONCURRENCY, 10) : 2,
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PROCESS_ROLE: 'worker',
      },
      time: true,
    },
  ],
};
