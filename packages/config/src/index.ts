import { z } from 'zod';

export const APP_NAME = 'WhatsApp Campaign Manager';

export const API_ENV_PREFIX = 'api';

const hex64 = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'APP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)');

export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_ORIGIN: z
      .string()
      .min(1)
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    ACCESS_TOKEN_SECRET: z.string().min(32, 'ACCESS_TOKEN_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z.string().min(2).default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    APP_ENCRYPTION_KEY: hex64,
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LOG_PRETTY: z.coerce.boolean().default(false),
    RATE_LIMIT_DISABLED: z.coerce.boolean().default(false),
    SWAGGER_ENABLED: z.coerce.boolean().default(true),
    META_APP_ID: z.string().optional(),
    META_APP_SECRET: z.string().optional(),
    META_VERIFY_TOKEN: z.string().optional(),
    META_ACCESS_TOKEN: z.string().optional(),
    META_WABA_ID: z.string().optional(),
    META_PHONE_NUMBER_ID: z.string().optional(),
    META_GRAPH_API_VERSION: z.string().default('v21.0'),
    EXPORTS_DIR: z.string().default('./exports'),
    SEED_ADMIN_NAME: z.string().optional(),
    SEED_ADMIN_EMAIL: z.string().email().optional(),
    SEED_ADMIN_PASSWORD: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const seedValues = [env.SEED_ADMIN_NAME, env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD];
    const present = seedValues.filter((value) => value !== undefined && value.length > 0).length;
    if (present > 0 && present < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'SEED_ADMIN_NAME, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be provided together to run the seed command',
        path: ['SEED_ADMIN_*'],
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function parseApiEnv(input: Record<string, unknown> = process.env): ApiEnv {
  const result = apiEnvSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid API environment configuration:\n- ${issues.join('\n- ')}`);
  }
  return result.data;
}

const webEnvSchema = z.object({
  VITE_API_URL: z.string().min(1).default('/api'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function parseWebEnv(input: Record<string, unknown>): WebEnv {
  const result = webEnvSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid Web environment configuration:\n- ${issues.join('\n- ')}`);
  }
  return result.data;
}

export const DEFAULT_SETTINGS = {
  companyName: APP_NAME,
  defaultTimezone: 'Africa/Cairo',
  defaultCountry: 'EG',
  defaultLanguage: 'ar',
  maxImportFileSizeMb: 20,
  sessionDurationMinutes: 120,
  campaignSendingConcurrency: 5,
  campaignMessagesPerMinute: 60,
  agentsCanViewUnassignedConversations: false,
  serviceWindowHours: 24,
  maxInboxMediaSizeMb: 16,
} as const;

export type DefaultSettings = typeof DEFAULT_SETTINGS;
