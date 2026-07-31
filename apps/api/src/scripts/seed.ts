import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { argon2id } from 'hash-wasm';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

import { parseApiEnv } from '@wa/config';
import { users } from '../db/schema';

async function main(): Promise<void> {
  const env = parseApiEnv();
  if (!env.SEED_ADMIN_NAME || !env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    console.error(
      'SEED_ADMIN_NAME, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables must be set.',
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool, { schema: { users } });

  const email = env.SEED_ADMIN_EMAIL.toLowerCase().trim();

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    console.log(`Admin user already exists (${email}); skipping creation.`);
    await pool.end();
    return;
  }

  const salt = randomBytes(16).toString('hex');
  const passwordHash = await argon2id({
    password: env.SEED_ADMIN_PASSWORD,
    salt,
    parallelism: 1,
    iterations: 2,
    memorySize: 19456,
    hashLength: 32,
    outputType: 'encoded',
  });

  await db.insert(users).values({
    name: env.SEED_ADMIN_NAME,
    email,
    role: 'ADMIN',
    status: 'ACTIVE',
    preferredLanguage: 'ar',
    passwordHash,
  });

  console.log(`Admin user created (${email}).`);
  await pool.end();
}

main().catch((error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
