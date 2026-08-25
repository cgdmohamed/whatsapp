import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { argon2id } from 'hash-wasm';
import { randomBytes } from 'node:crypto';

import * as schema from '../db/schema';
import { users } from '../db/schema';

export async function seedAdmin(
  db: NodePgDatabase<typeof schema>,
  env: { SEED_ADMIN_NAME?: string; SEED_ADMIN_EMAIL?: string; SEED_ADMIN_PASSWORD?: string },
): Promise<void> {
  if (!env.SEED_ADMIN_NAME || !env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    console.log('SEED_ADMIN_* env vars not set; skipping admin seed.');
    return;
  }

  const email = env.SEED_ADMIN_EMAIL.toLowerCase().trim();

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    console.log(`Admin user already exists (${email}); skipping creation.`);
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
}

async function main(): Promise<void> {
  const { parseApiEnv } = await import('@wa/config');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { Pool } = await import('pg');

  const env = parseApiEnv();
  if (!env.SEED_ADMIN_NAME || !env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    console.error(
      'SEED_ADMIN_NAME, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables must be set.',
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  try {
    await seedAdmin(db, env);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
