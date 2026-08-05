import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { parseApiEnv } from '@wa/config';
import * as schema from '../db/schema';
import { seedHelpCenter } from './help-seed';
import { seedHelpCenter1a } from './help-seed-1a';
import { seedHelpCenter2a } from './help-seed-2a';

async function main(): Promise<void> {
  const env = parseApiEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
    await pool.query(`
      UPDATE contact_lists cl
      SET active_contact_count = (
        SELECT count(*) FROM contact_list_members clm WHERE clm.contact_list_id = cl.id
      );
    `);
    const db = drizzle(pool, { schema });
    await seedHelpCenter(db);
    await seedHelpCenter1a(db);
    await seedHelpCenter2a(db);
    console.log('Database migrations applied successfully.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
