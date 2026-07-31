import { z } from 'zod';

export const ROLES = ['ADMIN', 'MANAGER', 'AGENT'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const LANGUAGES = ['ar', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'ar';
export const DEFAULT_COUNTRY = 'EG';
export const DEFAULT_TIMEZONE = 'Africa/Cairo';

export const ID_SCHEMA = z.string().uuid('Invalid id');

export const passwordSchema = z
  .string()
  .min(8, 'PASSWORD_TOO_SHORT')
  .max(128, 'PASSWORD_TOO_LONG')
  .regex(/[A-Za-z]/, 'PASSWORD_REQUIRES_LETTER')
  .regex(/[0-9]/, 'PASSWORD_REQUIRES_NUMBER');

export type PasswordInput = z.infer<typeof passwordSchema>;

export const emailSchema = z.string().trim().toLowerCase().email('INVALID_EMAIL').max(255, 'EMAIL_TOO_LONG');

export const nameSchema = z.string().trim().min(1, 'NAME_REQUIRED').max(100, 'NAME_TOO_LONG');

export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
  preferredLanguage: z.enum(LANGUAGES),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type UserDto = z.infer<typeof userSchema>;

// ---------- Auth ----------

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'PASSWORD_REQUIRED').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'PASSWORD_REQUIRED').max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const authResponseSchema = z.object({
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

// ---------- Pagination ----------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

export function paginatedResponseSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  });
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------- Users ----------

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: z.enum(ROLES),
  password: passwordSchema,
  preferredLanguage: z.enum(LANGUAGES).default(DEFAULT_LANGUAGE),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    role: z.enum(ROLES).optional(),
    preferredLanguage: z.enum(LANGUAGES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'AT_LEAST_ONE_FIELD_REQUIRED' });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  sortBy: z.enum(['name', 'email', 'role', 'status', 'createdAt', 'lastLoginAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type UserQuery = z.infer<typeof userQuerySchema>;

export const paginatedUsersSchema = paginatedResponseSchema(userSchema);
export type PaginatedUsers = z.infer<typeof paginatedUsersSchema>;

// ---------- Settings ----------

export const settingsSchema = z.object({
  companyName: z.string().trim().min(1, 'NAME_REQUIRED').max(200),
  defaultTimezone: z.string().min(1).max(64),
  defaultCountry: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'INVALID_COUNTRY_CODE'),
  defaultLanguage: z.enum(LANGUAGES),
  maxImportFileSizeMb: z.coerce.number().int().min(1).max(1024),
  sessionDurationMinutes: z.coerce.number().int().min(5).max(1440),
  campaignSendingConcurrency: z.coerce.number().int().min(1).max(100),
  campaignMessagesPerMinute: z.coerce.number().int().min(1).max(60000),
});
export type SettingsDto = z.infer<typeof settingsSchema>;

export const publicSettingsSchema = settingsSchema.pick({
  companyName: true,
  defaultTimezone: true,
  defaultCountry: true,
  defaultLanguage: true,
});
export type PublicSettingsDto = z.infer<typeof publicSettingsSchema>;

// ---------- Health ----------

export const healthSchema = z.object({
  status: z.enum(['ok']),
  uptime: z.number(),
  timestamp: z.string(),
});
export type HealthDto = z.infer<typeof healthSchema>;

export const readinessSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.record(z.enum(['up', 'down'])),
});
export type ReadinessDto = z.infer<typeof readinessSchema>;

// ---------- Audit actions ----------

export const AUDIT_ACTIONS = {
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGIN_BLOCKED: 'auth.login_blocked',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_REFRESH: 'auth.refresh',
  AUTH_REFRESH_REUSE: 'auth.refresh_reuse_detected',
  AUTH_CHANGE_PASSWORD: 'auth.change_password',
  AUTH_REVOKE_SESSIONS: 'auth.revoke_sessions',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_SUSPEND: 'user.suspend',
  USER_ACTIVATE: 'user.activate',
  USER_ARCHIVE: 'user.archive',
  USER_RESET_PASSWORD: 'user.reset_password',
  USER_REVOKE_SESSIONS: 'user.revoke_sessions',
  SETTINGS_UPDATE: 'settings.update',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
