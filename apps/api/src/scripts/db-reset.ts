import 'dotenv/config';
import { Pool } from 'pg';

import { parseApiEnv } from '@wa/config';

async function main(): Promise<void> {
  const env = parseApiEnv();
  const url = env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL environment variable must be set.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE;');
    await pool.query('CREATE SCHEMA public;');
    console.log('Database schema dropped. Run "pnpm db:migrate && pnpm db:seed" to recreate.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Reset failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
