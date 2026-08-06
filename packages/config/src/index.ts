import { z } from 'zod';

export const APP_NAME = 'WhatsApp Campaign Manager';

export const API_ENV_PREFIX = 'api';

const hex64 = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'APP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)');

const durationRegex = /^[1-9]\d*[smhd]$/;

const optionalSecretString = (min: number, message: string) =>
  z
    .string()
    .optional()
    .refine((value) => value === undefined || value.trim() === '' || value.length >= min, { message });

const optionalOrDefault = <T extends z.ZodTypeAny>(schema: T): z.ZodEffects<T> =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema);

const boolEnv = z.preprocess((value) => {
  if (value === undefined || value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off', ''].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

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
    ACCESS_TOKEN_TTL: z
      .string()
      .regex(durationRegex, 'ACCESS_TOKEN_TTL must be a duration like 15m, 4h or 7d (integer + s|m|h|d)')
      .default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    APP_ENCRYPTION_KEY: hex64,
    TRUST_PROXY: z
      .union([z.literal('false'), z.coerce.number().int().min(0).max(10)])
      .default(1),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LOG_PRETTY: boolEnv.default(false),
    RATE_LIMIT_DISABLED: boolEnv.default(false),
    SWAGGER_ENABLED: boolEnv.default(true),
    META_APP_ID: z.string().optional(),
    META_APP_SECRET: optionalSecretString(16, 'META_APP_SECRET must be at least 16 characters when provided'),
    META_VERIFY_TOKEN: optionalSecretString(8, 'META_VERIFY_TOKEN must be at least 8 characters when provided'),
    META_ACCESS_TOKEN: optionalSecretString(16, 'META_ACCESS_TOKEN must be at least 16 characters when provided'),
    META_WABA_ID: z.string().optional(),
    META_PHONE_NUMBER_ID: z.string().optional(),
    META_GRAPH_API_VERSION: optionalOrDefault(
      z
        .string()
        .regex(/^v\d+\.\d+$/, 'META_GRAPH_API_VERSION must look like v21.0')
        .default('v21.0'),
    ),
    EXPORTS_DIR: z.string().default('./exports'),
    IMPORT_UPLOAD_DIR: z.string().default('./data/imports'),
    INBOX_MEDIA_DIR: z.string().default('./data/inbox-media'),
    INBOX_MEDIA_SIGNING_SECRET: optionalSecretString(32, 'INBOX_MEDIA_SIGNING_SECRET must be at least 32 characters when provided'),
    APP_PUBLIC_URL: z.string().url('APP_PUBLIC_URL must be a valid URL').default('http://localhost:5173'),
    MAIL_ENABLED: boolEnv.default(false),
    MAIL_HOST: z.string().optional(),
    MAIL_PORT: optionalOrDefault(z.coerce.number().int().min(1).max(65535).optional()),
    MAIL_SECURE: boolEnv.default(true),
    MAIL_USERNAME: z.string().optional(),
    MAIL_PASSWORD: z.string().optional(),
    MAIL_FROM_EMAIL: optionalOrDefault(z.string().email('MAIL_FROM_EMAIL must be a valid email').optional()),
    MAIL_FROM_NAME: z.string().optional(),
    MAIL_REPLY_TO: optionalOrDefault(z.string().email('MAIL_REPLY_TO must be a valid email').optional()),
    SEED_ADMIN_NAME: z.string().optional(),
    SEED_ADMIN_EMAIL: optionalOrDefault(z.string().email().optional()),
    SEED_ADMIN_PASSWORD: optionalSecretString(8, 'SEED_ADMIN_PASSWORD must be at least 8 characters when provided'),
  })
  .superRefine((env, ctx) => {
    const mailFields = [env.MAIL_HOST, env.MAIL_PORT, env.MAIL_USERNAME, env.MAIL_PASSWORD, env.MAIL_FROM_EMAIL];
    const mailPresent = mailFields.filter((value) => value !== undefined && value !== '').length;
    if (env.MAIL_ENABLED && mailPresent > 0 && mailPresent < mailFields.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'When MAIL_ENABLED=true, provide the complete SMTP configuration: MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD and MAIL_FROM_EMAIL.',
        path: ['MAIL_*'],
      });
    }
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
  freeEntryPointWindowHours: 72,
  showExactCostToAgents: false,
  enableConsecutiveMessageWarning: false,
  consecutiveMessageWarningIntervalSeconds: 30,
  consecutiveMessageWarningThreshold: 3,
  consecutiveMessageWarningMinLength: 20,
  requireReapprovalOnPriceChange: true,
  allowCampaignLaunchWithUnavailablePricing: false,
  defaultCampaignBudgetCurrency: 'USD',
  dailyGlobalBudgetAmount: 0,
  monthlyGlobalBudgetAmount: 0,
  budgetWarningThresholdPercentage: 70,
  budgetCriticalThresholdPercentage: 90,
  budgetHardStopEnabled: true,
  costVarianceAlertPercentage: 20,
  reconciliationTolerancePercent: 1,
  passwordMinLength: 10,
  passwordRequireUppercase: true,
  passwordRequireLowercase: true,
  passwordRequireNumber: true,
  passwordRequireSpecial: false,
  passwordHistorySize: 5,
  passwordResetTokenExpiryMinutes: 30,
  notificationFailureRateThreshold: 20,
  notificationOptOutRateThreshold: 5,
  alertCooldownMinutes: 60,
  mailDailySummaryEnabled: false,
  mailDailySummaryTime: '08:00',
  mailSupportEmail: '',
} as const;

export type DefaultSettings = typeof DEFAULT_SETTINGS;
