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
  agentsCanViewUnassignedConversations: z.coerce.boolean().default(false),
  serviceWindowHours: z.coerce.number().int().min(1).max(168),
  maxInboxMediaSizeMb: z.coerce.number().int().min(1).max(64),
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

// ---------- WhatsApp ----------

export const WHATSAPP_ACCOUNT_STATUSES = ['CONNECTED', 'DISCONNECTED', 'ERROR'] as const;
export type WhatsAppAccountStatus = (typeof WHATSAPP_ACCOUNT_STATUSES)[number];

export const WHATSAPP_QUALITY_RATINGS = ['UNKNOWN', 'GREEN', 'YELLOW', 'RED'] as const;
export type WhatsAppQualityRating = (typeof WHATSAPP_QUALITY_RATINGS)[number];

export const WHATSAPP_PHONE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type WhatsAppPhoneStatus = (typeof WHATSAPP_PHONE_STATUSES)[number];

export const WEBHOOK_PROCESSING_STATUSES = ['RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED'] as const;
export type WebhookProcessingStatus = (typeof WEBHOOK_PROCESSING_STATUSES)[number];

export const MESSAGE_STATUSES = ['sent', 'delivered', 'read', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const INBOUND_MESSAGE_TYPES = [
  'TEXT',
  'IMAGE',
  'DOCUMENT',
  'INTERACTIVE_BUTTON',
  'INTERACTIVE_LIST',
  'UNKNOWN',
] as const;
export type InboundMessageType = (typeof INBOUND_MESSAGE_TYPES)[number];

export const GRAPH_API_VERSION_PATTERN = /^v\d+\.\d+$/;

export const whatsappAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  metaBusinessAccountId: z.string().nullable(),
  wabaId: z.string(),
  appId: z.string().nullable(),
  accessTokenLastFour: z.string(),
  tokenUpdatedAt: z.string().nullable(),
  status: z.enum(WHATSAPP_ACCOUNT_STATUSES),
  lastConnectionTestAt: z.string().nullable(),
  lastConnectionError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WhatsAppAccountDto = z.infer<typeof whatsappAccountSchema>;

export const whatsappPhoneNumberSchema = z.object({
  id: z.string().uuid(),
  whatsappAccountId: z.string().uuid(),
  phoneNumberId: z.string(),
  displayPhoneNumber: z.string().nullable(),
  verifiedName: z.string().nullable(),
  qualityRating: z.enum(WHATSAPP_QUALITY_RATINGS).nullable(),
  messagingLimitTier: z.string().nullable(),
  status: z.string().nullable(),
  isDefault: z.boolean(),
  lastSyncedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WhatsAppPhoneNumberDto = z.infer<typeof whatsappPhoneNumberSchema>;

export const whatsappCredentialsSchema = z
  .object({
    name: z.string().trim().max(100).optional(),
    appId: z.string().trim().max(100).optional(),
    wabaId: z.string().trim().max(100).optional(),
    accessToken: z.string().trim().min(1, 'ACCESS_TOKEN_REQUIRED').optional(),
    appSecret: z.string().trim().min(1, 'APP_SECRET_REQUIRED').optional(),
    verifyToken: z.string().trim().min(1, 'VERIFY_TOKEN_REQUIRED').optional(),
    graphApiVersion: z.string().trim().regex(GRAPH_API_VERSION_PATTERN, 'INVALID_GRAPH_VERSION').optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'AT_LEAST_ONE_FIELD_REQUIRED' });
export type WhatsAppCredentialsInput = z.infer<typeof whatsappCredentialsSchema>;

export const replaceTokenSchema = z.object({
  accessToken: z.string().trim().min(1, 'ACCESS_TOKEN_REQUIRED'),
});
export type ReplaceTokenInput = z.infer<typeof replaceTokenSchema>;

export const whatsappSettingsSchema = z.object({
  graphApiVersion: z.string().trim().regex(GRAPH_API_VERSION_PATTERN, 'INVALID_GRAPH_VERSION'),
  hasAppSecret: z.boolean(),
  hasVerifyToken: z.boolean(),
});
export type WhatsAppSettingsDto = z.infer<typeof whatsappSettingsSchema>;

export const whatsappStatusSchema = z.object({
  account: whatsappAccountSchema.nullable(),
  phoneNumbers: z.array(whatsappPhoneNumberSchema),
  settings: whatsappSettingsSchema,
});
export type WhatsAppStatusDto = z.infer<typeof whatsappStatusSchema>;

export const webhookEventSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  eventType: z.string(),
  deduplicationKey: z.string(),
  signatureValid: z.boolean(),
  processingStatus: z.enum(WEBHOOK_PROCESSING_STATUSES),
  processingAttempts: z.number().int().nonnegative(),
  processedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  failureReason: z.string().nullable(),
  correlationId: z.string().nullable(),
  receivedAt: z.string(),
  payloadPreview: z.string(),
});
export type WebhookEventDto = z.infer<typeof webhookEventSchema>;

export const webhookEventDetailSchema = webhookEventSchema.extend({
  sanitizedPayload: z.record(z.string(), z.unknown()),
});
export type WebhookEventDetailDto = z.infer<typeof webhookEventDetailSchema>;

export const webhookEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  eventType: z.string().trim().max(120).optional(),
  status: z.enum(WEBHOOK_PROCESSING_STATUSES).optional(),
});
export type WebhookEventsQuery = z.infer<typeof webhookEventsQuerySchema>;

export const paginatedWebhookEventsSchema = paginatedResponseSchema(webhookEventSchema);
export type PaginatedWebhookEvents = z.infer<typeof paginatedWebhookEventsSchema>;

// ---------- Message templates ----------

export const TEMPLATE_STATUSES = ['APPROVED', 'PENDING', 'REJECTED', 'IN_APPEAL', 'PAUSED', 'DISABLED', 'DELETED'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_COMPONENT_TYPES = ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'] as const;
export type TemplateComponentType = (typeof TEMPLATE_COMPONENT_TYPES)[number];

export const TEMPLATE_BUTTON_TYPES = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'] as const;
export type TemplateButtonType = (typeof TEMPLATE_BUTTON_TYPES)[number];

export const TEMPLATE_PARAMETER_FORMATS = ['TEXT', 'CURRENCY', 'DATE_TIME', 'IMAGE', 'DOCUMENT', 'VIDEO', 'LOCATION'] as const;
export type TemplateParameterFormat = (typeof TEMPLATE_PARAMETER_FORMATS)[number];

export const TEMPLATE_HEADER_FORMATS = ['TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO', 'LOCATION'] as const;
export type TemplateHeaderFormat = (typeof TEMPLATE_HEADER_FORMATS)[number];

// Statuses that make a previously approved template unsafe to send.
export const TEMPLATE_BLOCKING_STATUSES = ['PAUSED', 'DISABLED', 'DELETED'] as const;
export type TemplateBlockingStatus = (typeof TEMPLATE_BLOCKING_STATUSES)[number];

export const TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/;
export const TEMPLATE_URL_PATTERN = /^https?:\/\/[^\s]+$/;

export const templateButtonSchema = z.object({
  type: z.enum(TEMPLATE_BUTTON_TYPES),
  text: z.string(),
  url: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
});
export type TemplateButton = z.infer<typeof templateButtonSchema>;

export const templateVariableSchema = z.object({
  name: z.string(),
  format: z.enum(TEMPLATE_PARAMETER_FORMATS),
  required: z.boolean(),
  example: z.string().nullable(),
});
export type TemplateVariable = z.infer<typeof templateVariableSchema>;

export const templateComponentSchema = z.object({
  type: z.enum(TEMPLATE_COMPONENT_TYPES),
  position: z.number().int().nonnegative(),
  text: z.string().nullable(),
  example: z.array(z.string()).nullable(),
  buttons: z.array(templateButtonSchema).nullable(),
  variables: z.array(templateVariableSchema),
});
export type TemplateComponent = z.infer<typeof templateComponentSchema>;

export const messageTemplateSchema = z.object({
  id: z.string().uuid(),
  metaTemplateId: z.string(),
  name: z.string(),
  language: z.string(),
  category: z.enum(TEMPLATE_CATEGORIES),
  status: z.enum(TEMPLATE_STATUSES),
  qualityScore: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  components: z.array(templateComponentSchema),
  blockedAt: z.string().nullable(),
  metaUpdatedAt: z.string().nullable(),
  lastSyncedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MessageTemplateDto = z.infer<typeof messageTemplateSchema>;

export const messageTemplateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  status: z.enum(TEMPLATE_STATUSES).optional(),
  language: z.string().trim().max(10).optional(),
  sortBy: z.enum(['name', 'status', 'category', 'updatedAt', 'lastSyncedAt']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type MessageTemplateQuery = z.infer<typeof messageTemplateQuerySchema>;

export const paginatedMessageTemplatesSchema = paginatedResponseSchema(messageTemplateSchema);
export type PaginatedMessageTemplates = z.infer<typeof paginatedMessageTemplatesSchema>;

export const templateSyncResultSchema = z.object({
  syncedAt: z.string(),
  totalFetched: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  blockedTemplates: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      status: z.enum(TEMPLATE_STATUSES),
      previousStatus: z.enum(TEMPLATE_STATUSES),
    }),
  ),
  errors: z.array(z.string()),
});
export type TemplateSyncResultDto = z.infer<typeof templateSyncResultSchema>;

export const templateSyncStatusSchema = z.object({
  lastSyncedAt: z.string().nullable(),
  total: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  blockedTemplates: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      status: z.enum(TEMPLATE_STATUSES),
    }),
  ),
});
export type TemplateSyncStatusDto = z.infer<typeof templateSyncStatusSchema>;

export const createMessageTemplateButtonSchema = z
  .object({
    type: z.enum(TEMPLATE_BUTTON_TYPES),
    text: z.string().trim().min(1, 'TEMPLATE_BUTTON_TEXT_REQUIRED').max(25, 'TEMPLATE_BUTTON_TEXT_TOO_LONG'),
    url: z.string().trim().regex(TEMPLATE_URL_PATTERN, 'INVALID_URL').max(2048).optional(),
    phoneNumber: z.string().trim().min(1, 'PHONE_REQUIRED').max(20).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'URL' && !value.url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'TEMPLATE_URL_REQUIRED', path: ['url'] });
    }
    if (value.type === 'PHONE_NUMBER' && !value.phoneNumber) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'TEMPLATE_PHONE_REQUIRED', path: ['phoneNumber'] });
    }
  });
export type CreateMessageTemplateButtonInput = z.infer<typeof createMessageTemplateButtonSchema>;

export const createMessageTemplateComponentSchema = z.object({
  type: z.enum(TEMPLATE_COMPONENT_TYPES),
  text: z.string().trim().min(1, 'TEMPLATE_TEXT_REQUIRED').max(1024).optional(),
  headerFormat: z.enum(TEMPLATE_HEADER_FORMATS).optional(),
  buttons: z.array(createMessageTemplateButtonSchema).max(10).optional(),
});
export type CreateMessageTemplateComponentInput = z.infer<typeof createMessageTemplateComponentSchema>;

export const createMessageTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'TEMPLATE_NAME_REQUIRED')
    .max(512, 'TEMPLATE_NAME_TOO_LONG')
    .regex(TEMPLATE_NAME_PATTERN, 'TEMPLATE_NAME_INVALID'),
  language: z.string().trim().min(2, 'TEMPLATE_LANGUAGE_REQUIRED').max(10, 'TEMPLATE_LANGUAGE_TOO_LONG'),
  category: z.enum(TEMPLATE_CATEGORIES),
  components: z
    .array(createMessageTemplateComponentSchema)
    .min(1, 'TEMPLATE_COMPONENT_REQUIRED')
    .max(3, 'TEMPLATE_COMPONENT_TOO_MANY'),
});
export type CreateMessageTemplateInput = z.infer<typeof createMessageTemplateSchema>;

export const templateCreateResultSchema = z.object({
  metaTemplateId: z.string(),
  name: z.string(),
  status: z.string(),
  category: z.enum(TEMPLATE_CATEGORIES),
  syncedAt: z.string(),
});
export type TemplateCreateResultDto = z.infer<typeof templateCreateResultSchema>;

export const templatePreviewInputSchema = z.object({
  components: z.array(templateComponentSchema).min(1),
  samples: z.array(z.string().max(500)).max(10).default([]),
});
export type TemplatePreviewInput = z.infer<typeof templatePreviewInputSchema>;

export const templatePreviewSchema = z.object({
  headerText: z.string().nullable(),
  bodyText: z.string().nullable(),
  footerText: z.string().nullable(),
  buttons: z.array(templateButtonSchema),
  variables: z.array(templateVariableSchema),
  sampleValues: z.record(z.string(), z.string()),
  unresolved: z.array(z.string()),
});
export type TemplatePreviewDto = z.infer<typeof templatePreviewSchema>;

// ---------- Contacts & lists ----------

export const CONTACT_STATUSES = ['ACTIVE', 'INVALID', 'UNSUBSCRIBED', 'BLOCKED', 'ARCHIVED'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_SOURCES = ['MANUAL', 'IMPORT', 'WHATSAPP'] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export const OPT_IN_STATUSES = ['OPTED_IN', 'OPTED_OUT', 'UNKNOWN'] as const;
export type OptInStatus = (typeof OPT_IN_STATUSES)[number];

export const SUPPRESSION_REASONS = ['OPTED_OUT', 'COMPLAINT', 'BLOCKED', 'BOUNCED', 'INVALID', 'OTHER'] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const LIST_TYPES = ['STATIC', 'FILTERED'] as const;
export type ContactListType = (typeof LIST_TYPES)[number];

export const IMPORT_FILE_TYPES = ['csv', 'xlsx'] as const;
export type ImportFileType = (typeof IMPORT_FILE_TYPES)[number];

export const IMPORT_JOB_STATUSES = ['UPLOADED', 'CONFIGURED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const IMPORT_ROW_STATUSES = [
  'PENDING',
  'VALID',
  'INVALID',
  'DUPLICATE',
  'CREATED',
  'UPDATED',
  'SKIPPED',
  'ERROR',
] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export const IMPORT_UPDATE_MODES = ['none', 'merge-empty', 'replace'] as const;
export type ImportUpdateMode = (typeof IMPORT_UPDATE_MODES)[number];

export const IMPORTABLE_FIELDS = [
  'phone',
  'first_name',
  'last_name',
  'display_name',
  'email',
  'company',
  'language',
  'source',
  'tags',
  'list',
  'opt_in_status',
  'opt_in_source',
  'opt_in_date',
] as const;
export type ImportableField = (typeof IMPORTABLE_FIELDS)[number];

export const tagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  contactCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type TagDto = z.infer<typeof tagSchema>;

export const tagSummarySchema = tagSchema.pick({ id: true, name: true, slug: true });
export type TagSummaryDto = z.infer<typeof tagSummarySchema>;

export const contactSchema = z.object({
  id: z.string().uuid(),
  phoneE164: z.string(),
  phoneCountry: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  company: z.string().nullable(),
  language: z.enum(LANGUAGES).nullable(),
  status: z.enum(CONTACT_STATUSES),
  source: z.string().nullable(),
  customFields: z.record(z.string(), z.string()).nullable(),
  lastInboundMessageAt: z.string().nullable(),
  lastOutboundMessageAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  tags: z.array(tagSummarySchema),
  optInStatus: z.enum(OPT_IN_STATUSES),
  suppressed: z.boolean(),
});
export type ContactDto = z.infer<typeof contactSchema>;

export const contactListSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(LIST_TYPES),
});
export type ContactListSummaryDto = z.infer<typeof contactListSummarySchema>;

export const optInRecordSchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid(),
  status: z.enum(OPT_IN_STATUSES),
  source: z.string().nullable(),
  consentText: z.string().nullable(),
  allowedCategories: z.array(z.string()).nullable(),
  proofReference: z.string().nullable(),
  obtainedAt: z.string(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type OptInRecordDto = z.infer<typeof optInRecordSchema>;

export const suppressionEntrySchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  phoneE164: z.string().nullable(),
  reason: z.enum(SUPPRESSION_REASONS),
  source: z.string().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
  removedAt: z.string().nullable(),
  removedByUserId: z.string().uuid().nullable(),
});
export type SuppressionEntryDto = z.infer<typeof suppressionEntrySchema>;

export const contactDetailSchema = contactSchema.extend({
  lists: z.array(contactListSummarySchema),
  consentHistory: z.array(optInRecordSchema),
  suppressionEntries: z.array(suppressionEntrySchema),
  importHistory: z.array(
    z.object({
      importJobId: z.string().uuid(),
      fileName: z.string(),
      status: z.enum(IMPORT_ROW_STATUSES),
      importedAt: z.string(),
    }),
  ),
  auditEvents: z.array(
    z.object({
      id: z.string().uuid(),
      action: z.string(),
      actorName: z.string().nullable(),
      metadata: z.record(z.string(), z.unknown()).nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type ContactDetailDto = z.infer<typeof contactDetailSchema>;

export const createContactSchema = z.object({
  phone: z.string().trim().min(3, 'PHONE_REQUIRED').max(30, 'PHONE_TOO_LONG'),
  phoneCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'INVALID_COUNTRY_CODE').optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  displayName: z.string().trim().max(160).optional(),
  email: z.string().trim().toLowerCase().email('INVALID_EMAIL').max(255).optional().or(z.literal('')),
  company: z.string().trim().max(160).optional(),
  language: z.enum(LANGUAGES).optional(),
  source: z.string().trim().max(100).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
  tagIds: z.array(ID_SCHEMA).max(50).optional(),
  listIds: z.array(ID_SCHEMA).max(50).optional(),
  optInStatus: z.enum(OPT_IN_STATUSES).optional(),
  optInSource: z.string().trim().max(100).optional(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = z
  .object({
    phone: z.string().trim().min(3).max(30).optional(),
    phoneCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'INVALID_COUNTRY_CODE').optional(),
    firstName: z.string().trim().max(100).nullable().optional(),
    lastName: z.string().trim().max(100).nullable().optional(),
    displayName: z.string().trim().max(160).nullable().optional(),
    email: z.string().trim().toLowerCase().email('INVALID_EMAIL').max(255).nullable().optional(),
    company: z.string().trim().max(160).nullable().optional(),
    language: z.enum(LANGUAGES).nullable().optional(),
    source: z.string().trim().max(100).nullable().optional(),
    customFields: z.record(z.string(), z.string()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'AT_LEAST_ONE_FIELD_REQUIRED' });
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const contactQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  language: z.enum(LANGUAGES).optional(),
  source: z.string().trim().max(100).optional(),
  tagId: ID_SCHEMA.optional(),
  listId: ID_SCHEMA.optional(),
  optInStatus: z.enum(OPT_IN_STATUSES).optional(),
  suppressed: z.enum(['yes', 'no']).optional(),
  createdFrom: z.string().trim().optional(),
  createdTo: z.string().trim().optional(),
  messageFrom: z.string().trim().optional(),
  messageTo: z.string().trim().optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'displayName', 'phoneE164', 'lastInboundMessageAt', 'lastOutboundMessageAt'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ContactQuery = z.infer<typeof contactQuerySchema>;

export const paginatedContactsSchema = paginatedResponseSchema(contactSchema);
export type PaginatedContacts = z.infer<typeof paginatedContactsSchema>;

export const idListSchema = z.object({
  ids: z.array(ID_SCHEMA).min(1, 'AT_LEAST_ONE_ID_REQUIRED').max(500),
});
export type IdListInput = z.infer<typeof idListSchema>;

export const consentMutationSchema = z.object({
  status: z.enum(OPT_IN_STATUSES),
  source: z.string().trim().max(100).optional(),
  consentText: z.string().trim().max(2000).optional(),
  allowedCategories: z.array(z.string().trim().max(100)).max(50).optional(),
  proofReference: z.string().trim().max(255).optional(),
  obtainedAt: z.string().trim().optional(),
  expiresAt: z.string().trim().optional(),
  override: z.boolean().optional(),
  auditReason: z.string().trim().min(1).max(500).optional(),
});
export type ConsentMutationInput = z.infer<typeof consentMutationSchema>;

export const suppressionMutationSchema = z.object({
  reason: z.enum(SUPPRESSION_REASONS),
  source: z.string().trim().max(100).optional(),
  auditReason: z.string().trim().max(500).optional(),
});
export type SuppressionMutationInput = z.infer<typeof suppressionMutationSchema>;

export const bulkContactActionSchema = z.object({
  action: z.enum(['add-tags', 'remove-tags', 'add-list', 'remove-list', 'archive', 'export', 'add-suppression']),
  contactIds: z.array(ID_SCHEMA).min(1).max(500),
  tagIds: z.array(ID_SCHEMA).max(50).optional(),
  listId: ID_SCHEMA.optional(),
  reason: z.enum(SUPPRESSION_REASONS).optional(),
});
export type BulkContactActionInput = z.infer<typeof bulkContactActionSchema>;

export const createTagSchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(500).optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z
  .object({
    name: nameSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'AT_LEAST_ONE_FIELD_REQUIRED' });
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export const tagQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(255).optional(),
});
export type TagQuery = z.infer<typeof tagQuerySchema>;

export const paginatedTagsSchema = paginatedResponseSchema(tagSchema);
export type PaginatedTags = z.infer<typeof paginatedTagsSchema>;

export const contactListSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(LIST_TYPES),
  activeContactCount: z.number().int().nonnegative(),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type ContactListDto = z.infer<typeof contactListSchema>;

export const createContactListSchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(500).optional(),
  type: z.enum(LIST_TYPES).default('STATIC'),
});
export type CreateContactListInput = z.infer<typeof createContactListSchema>;

export const updateContactListSchema = z
  .object({
    name: nameSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    type: z.enum(LIST_TYPES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'AT_LEAST_ONE_FIELD_REQUIRED' });
export type UpdateContactListInput = z.infer<typeof updateContactListSchema>;

export const contactListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(255).optional(),
  type: z.enum(LIST_TYPES).optional(),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

export const paginatedContactListsSchema = paginatedResponseSchema(contactListSchema);
export type PaginatedContactLists = z.infer<typeof paginatedContactListsSchema>;

export const importOptionsSchema = z.object({
  defaultCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'INVALID_COUNTRY_CODE').default('EG'),
  hasHeader: z.boolean().default(true),
  updateMode: z.enum(IMPORT_UPDATE_MODES).default('none'),
  updateFields: z.array(z.string().trim().max(120)).max(50).optional(),
  skipDuplicates: z.boolean().default(false),
  listId: ID_SCHEMA.optional(),
  tagIds: z.array(ID_SCHEMA).max(50).default([]),
  treatMissingConsentAsUnknown: z.boolean().default(true),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

export const configureImportSchema = z.object({
  sheetName: z.string().trim().optional(),
  hasHeader: z.boolean().default(true),
  columnMapping: z.record(z.string(), z.string().trim().max(120)),
  options: importOptionsSchema,
});
export type ConfigureImportInput = z.infer<typeof configureImportSchema>;

export const importJobSchema = z.object({
  id: z.string().uuid(),
  originalFilename: z.string(),
  fileType: z.enum(IMPORT_FILE_TYPES),
  status: z.enum(IMPORT_JOB_STATUSES),
  totalRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  invalidRows: z.number().int().nonnegative(),
  createdRows: z.number().int().nonnegative(),
  updatedRows: z.number().int().nonnegative(),
  skippedRows: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(),
  errorRows: z.number().int().nonnegative(),
  createdByUserId: z.string().uuid(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  hasRejectedRows: z.boolean(),
});
export type ImportJobDto = z.infer<typeof importJobSchema>;

export const importRowSchema = z.object({
  id: z.string().uuid(),
  importJobId: z.string().uuid(),
  rowNumber: z.number().int().nonnegative(),
  rawData: z.record(z.string(), z.unknown()),
  normalizedPhone: z.string().nullable(),
  status: z.enum(IMPORT_ROW_STATUSES),
  contactId: z.string().uuid().nullable(),
  errorMessages: z.array(z.string()),
  createdAt: z.string(),
});
export type ImportRowDto = z.infer<typeof importRowSchema>;

export const importUploadSchema = z.object({
  jobId: z.string().uuid(),
  originalFilename: z.string(),
  fileType: z.enum(IMPORT_FILE_TYPES),
  sheets: z.array(z.string()),
  headers: z.array(z.string()),
  previewRows: z.array(z.array(z.unknown())),
  totalRows: z.number().int().nonnegative(),
});
export type ImportUploadDto = z.infer<typeof importUploadSchema>;

export const importValidationSummarySchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(IMPORT_JOB_STATUSES),
  totalRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  invalidRows: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(),
  issues: z.array(
    z.object({
      rowNumber: z.number().int().nonnegative(),
      reason: z.string(),
    }),
  ),
});
export type ImportValidationSummaryDto = z.infer<typeof importValidationSummarySchema>;

export const importJobDetailSchema = importJobSchema.extend({
  rows: z.array(importRowSchema),
});
export type ImportJobDetailDto = z.infer<typeof importJobDetailSchema>;

export const paginatedImportJobsSchema = paginatedResponseSchema(importJobSchema);
export type PaginatedImportJobs = z.infer<typeof paginatedImportJobsSchema>;

export const importJobQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(IMPORT_JOB_STATUSES).optional(),
});
export type ImportJobQuery = z.infer<typeof importJobQuerySchema>;

// Normalized inbound event types produced by the webhook parser.

export interface NormalizedInboundMessageBase {
  waMessageId: string;
  waPhoneNumberId: string;
  from: string;
  timestamp: string;
}

export interface NormalizedTextMessage extends NormalizedInboundMessageBase {
  type: 'TEXT';
  body: string;
}

export interface NormalizedImageMessage extends NormalizedInboundMessageBase {
  type: 'IMAGE';
  mediaId: string | null;
  mimeType: string | null;
  sha256: string | null;
  caption: string | null;
}

export interface NormalizedDocumentMessage extends NormalizedInboundMessageBase {
  type: 'DOCUMENT';
  mediaId: string | null;
  mimeType: string | null;
  sha256: string | null;
  filename: string | null;
  caption: string | null;
}

export interface NormalizedButtonReplyMessage extends NormalizedInboundMessageBase {
  type: 'INTERACTIVE_BUTTON';
  buttonText: string | null;
  buttonId: string | null;
}

export interface NormalizedListReplyMessage extends NormalizedInboundMessageBase {
  type: 'INTERACTIVE_LIST';
  listItemId: string | null;
  listTitle: string | null;
  listDescription: string | null;
}

export interface NormalizedUnknownMessage extends NormalizedInboundMessageBase {
  type: 'UNKNOWN';
}

export type NormalizedInboundMessage =
  | NormalizedTextMessage
  | NormalizedImageMessage
  | NormalizedDocumentMessage
  | NormalizedButtonReplyMessage
  | NormalizedListReplyMessage
  | NormalizedUnknownMessage;

export interface NormalizedStatusUpdate {
  waMessageId: string;
  waPhoneNumberId: string;
  status: MessageStatus;
  timestamp: string;
  error: {
    code: number | null;
    title: string | null;
    message: string | null;
  } | null;
}

export interface NormalizedWebhookMessageEvent {
  kind: 'message';
  message: NormalizedInboundMessage;
}

export interface NormalizedWebhookStatusEvent {
  kind: 'status';
  status: NormalizedStatusUpdate;
}

export interface NormalizedIgnoredEvent {
  reason: string;
}

export interface NormalizedWebhookResult {
  events: Array<NormalizedWebhookMessageEvent | NormalizedWebhookStatusEvent>;
  ignored: NormalizedIgnoredEvent[];
}

// ---------- Campaigns ----------

export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'VALIDATING',
  'READY',
  'SCHEDULED',
  'QUEUING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_RECIPIENT_STATUSES = [
  'PENDING',
  'INELIGIBLE',
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'REPLIED',
  'FAILED',
  'CANCELLED',
  'OPTED_OUT',
] as const;
export type CampaignRecipientStatus = (typeof CAMPAIGN_RECIPIENT_STATUSES)[number];

export const MESSAGE_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_ROW_STATUSES = [
  'PENDING',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'REPLIED',
  'FAILED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type MessageRowStatus = (typeof MESSAGE_ROW_STATUSES)[number];

export const AUDIENCE_TYPES = ['LISTS', 'TAGS', 'CONTACTS', 'FILTER'] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export const VARIABLE_SOURCES = [
  'FIRST_NAME',
  'LAST_NAME',
  'DISPLAY_NAME',
  'COMPANY',
  'PHONE',
  'EMAIL',
  'CUSTOM_FIELD',
  'STATIC',
] as const;
export type VariableSource = (typeof VARIABLE_SOURCES)[number];

export const ELIGIBILITY_REASONS = [
  'ELIGIBLE',
  'INVALID_PHONE',
  'UNKNOWN_CONSENT',
  'OPTED_OUT',
  'SUPPRESSED',
  'MISSING_VARIABLE',
  'DUPLICATE',
  'ARCHIVED',
  'OTHER',
] as const;
export type EligibilityReason = (typeof ELIGIBILITY_REASONS)[number];

export const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'إلغاء', 'توقف', 'إيقاف الرسائل', 'OPT_OUT'] as const;
export const OPT_OUT_QUICK_REPLY_PAYLOAD = 'OPT_OUT';

export const CONVERSATION_STATUSES = ['NEW', 'OPEN', 'WAITING_FOR_CUSTOMER', 'FOLLOW_UP', 'CLOSED'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type ConversationPriority = (typeof CONVERSATION_PRIORITIES)[number];

export const QUICK_REPLY_VISIBILITIES = ['PERSONAL', 'TEAM'] as const;
export type QuickReplyVisibility = (typeof QUICK_REPLY_VISIBILITIES)[number];

export const MEDIA_FILE_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
export type MediaFileDirection = (typeof MEDIA_FILE_DIRECTIONS)[number];

export const MEDIA_FILE_SOURCES = ['INBOUND_META', 'OUTBOUND_UPLOAD'] as const;
export type MediaFileSource = (typeof MEDIA_FILE_SOURCES)[number];

export const MEDIA_FILE_STATUSES = ['PENDING', 'STORED', 'FAILED', 'SENT'] as const;
export type MediaFileStatus = (typeof MEDIA_FILE_STATUSES)[number];

export const INBOX_EVENT_TYPES = ['message', 'status', 'conversation', 'note', 'read'] as const;
export type InboxEventType = (typeof INBOX_EVENT_TYPES)[number];

export interface InboxRealtimeEvent {
  type: InboxEventType;
  conversationId: string;
  payload: unknown;
  at: string;
}

export const conversationSummarySchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid(),
  whatsappPhoneNumberId: z.string().nullable(),
  status: z.enum(CONVERSATION_STATUSES),
  priority: z.enum(CONVERSATION_PRIORITIES),
  assignedUserId: z.string().uuid().nullable(),
  assignedUserName: z.string().nullable(),
  lastMessageId: z.string().uuid().nullable(),
  lastMessageAt: z.string().nullable(),
  lastInboundMessageAt: z.string().nullable(),
  lastOutboundMessageAt: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
  serviceWindowExpiresAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contact: z.object({
    id: z.string().uuid(),
    phoneE164: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    displayName: z.string().nullable(),
    language: z.enum(LANGUAGES).nullable(),
    status: z.enum(CONTACT_STATUSES),
    suppressed: z.boolean().default(false),
    optInStatus: z.enum(OPT_IN_STATUSES).default('UNKNOWN'),
  }),
  lastMessagePreview: z.string().nullable(),
});
export type ConversationSummaryDto = z.infer<typeof conversationSummarySchema>;

export const conversationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(255).optional(),
  status: z.enum(CONVERSATION_STATUSES).optional(),
  assignedUserId: ID_SCHEMA.optional(),
  unassigned: z.enum(['yes', 'no']).optional(),
  unread: z.enum(['yes', 'no']).optional(),
  priority: z.enum(CONVERSATION_PRIORITIES).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sortBy: z.enum(['lastMessageAt', 'createdAt', 'updatedAt', 'unreadCount']).default('lastMessageAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ConversationQuery = z.infer<typeof conversationQuerySchema>;

export const paginatedConversationsSchema = paginatedResponseSchema(conversationSummarySchema);
export type PaginatedConversations = z.infer<typeof paginatedConversationsSchema>;

export const assignmentHistorySchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  fromUserId: z.string().uuid().nullable(),
  toUserId: z.string().uuid(),
  assignedByUserId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  fromUserName: z.string().nullable(),
  toUserName: z.string().nullable(),
  assignedByName: z.string().nullable(),
});
export type AssignmentHistoryDto = z.infer<typeof assignmentHistorySchema>;

export const conversationRecentCampaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(CAMPAIGN_STATUSES),
  sentAt: z.string().nullable(),
});
export type ConversationRecentCampaignDto = z.infer<typeof conversationRecentCampaignSchema>;

export const internalNoteSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type InternalNoteDto = z.infer<typeof internalNoteSchema>;

export const conversationDetailSchema = conversationSummarySchema.extend({
  assignedUser: z.object({ id: z.string().uuid(), name: z.string(), email: z.string(), role: z.enum(ROLES) }).nullable(),
  tags: z.array(tagSummarySchema),
  lists: z.array(contactListSummarySchema),
  consent: z
    .object({
      status: z.enum(OPT_IN_STATUSES),
      source: z.string().nullable(),
      obtainedAt: z.string(),
      expiresAt: z.string().nullable(),
    })
    .nullable(),
  suppression: z.array(suppressionEntrySchema),
  recentCampaigns: z.array(conversationRecentCampaignSchema),
  assignmentHistory: z.array(assignmentHistorySchema),
  internalNotes: z.array(internalNoteSchema),
});
export type ConversationDetailDto = z.infer<typeof conversationDetailSchema>;

export const conversationMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().trim().optional(),
});
export type ConversationMessagesQuery = z.infer<typeof conversationMessagesQuerySchema>;

export const paginatedConversationMessagesSchema = paginatedResponseSchema(z.lazy(() => messageSchema));
export type PaginatedConversationMessages = z.infer<typeof paginatedConversationMessagesSchema>;

export const replyInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('TEXT'),
    textContent: z.string().trim().min(1, 'INBOX_TEXT_REQUIRED').max(4096, 'INBOX_TEXT_TOO_LONG'),
  }),
  z.object({
    type: z.literal('IMAGE'),
    mediaFileId: ID_SCHEMA,
    caption: z.string().trim().max(1024).optional(),
  }),
  z.object({
    type: z.literal('DOCUMENT'),
    mediaFileId: ID_SCHEMA,
    caption: z.string().trim().max(1024).optional(),
  }),
  z.object({
    type: z.literal('TEMPLATE'),
    templateId: ID_SCHEMA,
    language: z.string().trim().min(2).max(10).optional(),
    parameters: z.array(z.string().max(500)).max(30).optional(),
  }),
]);
export type ReplyInput = z.infer<typeof replyInputSchema>;

export const assignConversationSchema = z.object({
  userId: ID_SCHEMA,
  reason: z.string().trim().max(500).optional(),
});
export type AssignConversationInput = z.infer<typeof assignConversationSchema>;

export const claimConversationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type ClaimConversationInput = z.infer<typeof claimConversationSchema>;

export const conversationStatusInputSchema = z.object({
  status: z.enum(CONVERSATION_STATUSES),
});
export type ConversationStatusInput = z.infer<typeof conversationStatusInputSchema>;

export const conversationPriorityInputSchema = z.object({
  priority: z.enum(CONVERSATION_PRIORITIES),
});
export type ConversationPriorityInput = z.infer<typeof conversationPriorityInputSchema>;

export const conversationTagsInputSchema = z.object({
  tagIds: z.array(ID_SCHEMA).min(1, 'AT_LEAST_ONE_ID_REQUIRED').max(50),
});
export type ConversationTagsInput = z.infer<typeof conversationTagsInputSchema>;

export const createInternalNoteSchema = z.object({
  content: z.string().trim().min(1, 'INBOX_NOTE_REQUIRED').max(4000, 'INBOX_NOTE_TOO_LONG'),
});
export type CreateInternalNoteInput = z.infer<typeof createInternalNoteSchema>;

export const updateInternalNoteSchema = z.object({
  content: z.string().trim().min(1, 'INBOX_NOTE_REQUIRED').max(4000, 'INBOX_NOTE_TOO_LONG'),
});
export type UpdateInternalNoteInput = z.infer<typeof updateInternalNoteSchema>;

export const mediaFileSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid().nullable(),
  conversationId: z.string().uuid().nullable(),
  direction: z.enum(MEDIA_FILE_DIRECTIONS),
  source: z.enum(MEDIA_FILE_SOURCES),
  metaMediaId: z.string().nullable(),
  originalFilename: z.string().nullable(),
  storedFilename: z.string().nullable(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  sha256: z.string().nullable(),
  status: z.enum(MEDIA_FILE_STATUSES),
  errorMessage: z.string().nullable(),
  uploadedByUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type MediaFileDto = z.infer<typeof mediaFileSchema>;

export const quickReplySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  language: z.enum(LANGUAGES),
  category: z.string().nullable(),
  visibility: z.enum(QUICK_REPLY_VISIBILITIES),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type QuickReplyDto = z.infer<typeof quickReplySchema>;

export const quickReplyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(255).optional(),
  language: z.enum(LANGUAGES).optional(),
  category: z.string().trim().max(60).optional(),
  visibility: z.enum(QUICK_REPLY_VISIBILITIES).optional(),
  includeArchived: z.enum(['yes', 'no']).optional(),
});
export type QuickReplyQuery = z.infer<typeof quickReplyQuerySchema>;

export const paginatedQuickRepliesSchema = paginatedResponseSchema(quickReplySchema);
export type PaginatedQuickReplies = z.infer<typeof paginatedQuickRepliesSchema>;

export const createQuickReplySchema = z.object({
  title: z.string().trim().min(1, 'NAME_REQUIRED').max(120, 'INBOX_QUICK_REPLY_TITLE_TOO_LONG'),
  content: z.string().trim().min(1, 'INBOX_QUICK_REPLY_CONTENT_REQUIRED').max(4000, 'INBOX_QUICK_REPLY_CONTENT_TOO_LONG'),
  language: z.enum(LANGUAGES).default(DEFAULT_LANGUAGE),
  category: z.string().trim().max(60).optional(),
  visibility: z.enum(QUICK_REPLY_VISIBILITIES).default('PERSONAL'),
});
export type CreateQuickReplyInput = z.infer<typeof createQuickReplySchema>;

export const updateQuickReplySchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    content: z.string().trim().min(1).max(4000).optional(),
    language: z.enum(LANGUAGES).optional(),
    category: z.string().trim().max(60).nullable().optional(),
    visibility: z.enum(QUICK_REPLY_VISIBILITIES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'AT_LEAST_ONE_FIELD_REQUIRED' });
export type UpdateQuickReplyInput = z.infer<typeof updateQuickReplySchema>;

export const audienceFilterSchema = z.object({
  status: z.enum(CONTACT_STATUSES).optional(),
  language: z.enum(LANGUAGES).optional(),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  optInStatus: z.enum(OPT_IN_STATUSES).optional(),
  suppressed: z.enum(['yes', 'no']).optional(),
});
export type AudienceFilter = z.infer<typeof audienceFilterSchema>;

export const audienceSelectionSchema = z.object({
  type: z.enum(AUDIENCE_TYPES),
  listIds: z.array(ID_SCHEMA).max(50).optional(),
  tagIds: z.array(ID_SCHEMA).max(50).optional(),
  contactIds: z.array(ID_SCHEMA).max(2000).optional(),
  filters: audienceFilterSchema.optional(),
});
export type AudienceSelection = z.infer<typeof audienceSelectionSchema>;

export const variableMappingSchema = z.object({
  variableName: z.string().trim().min(1).max(20),
  source: z.enum(VARIABLE_SOURCES),
  customFieldKey: z.string().trim().max(100).optional(),
  staticText: z.string().trim().max(2000).optional(),
  fallback: z.string().trim().max(2000).optional(),
});
export type VariableMapping = z.infer<typeof variableMappingSchema>;

export const audienceSnapshotContactSchema = z.object({
  id: z.string().uuid(),
  phoneE164: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  displayName: z.string().nullable(),
  company: z.string().nullable(),
  email: z.string().nullable(),
  language: z.string().nullable(),
  status: z.string().nullable(),
  customFields: z.record(z.string(), z.string()).nullable(),
});
export type AudienceSnapshotContact = z.infer<typeof audienceSnapshotContactSchema>;

export const templateSnapshotSchema = z.object({
  metaTemplateId: z.string(),
  name: z.string(),
  language: z.string(),
  components: z.array(templateComponentSchema),
  blockedAt: z.string().nullable(),
});
export type TemplateSnapshot = z.infer<typeof templateSnapshotSchema>;

export const preflightBreakdownSchema = z.object({
  totalSelected: z.number().int().nonnegative(),
  eligible: z.number().int().nonnegative(),
  invalidPhone: z.number().int().nonnegative(),
  unknownConsent: z.number().int().nonnegative(),
  optedOut: z.number().int().nonnegative(),
  suppressed: z.number().int().nonnegative(),
  missingVariable: z.number().int().nonnegative(),
  duplicate: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
});
export type PreflightBreakdown = z.infer<typeof preflightBreakdownSchema>;

export const preflightReportSchema = z.object({
  campaignId: z.string().uuid().nullable(),
  valid: z.boolean(),
  checks: z.object({
    accountConnected: z.boolean(),
    phoneNumberActive: z.boolean(),
    templateApproved: z.boolean(),
    templateStatusUnchanged: z.boolean(),
    templateLanguageMatches: z.boolean(),
    sendingLimitsConfigured: z.boolean(),
  }),
  breakdown: preflightBreakdownSchema,
  blockedReasons: z.array(z.object({ reason: z.enum(ELIGIBILITY_REASONS), count: z.number().int().nonnegative() })),
  errors: z.array(z.string()),
  generatedAt: z.string(),
});
export type PreflightReport = z.infer<typeof preflightReportSchema>;

export const createCampaignSchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(2000).optional(),
  whatsappPhoneNumberId: ID_SCHEMA,
  messageTemplateId: ID_SCHEMA,
  language: z.string().trim().min(2).max(10),
  audience: audienceSelectionSchema,
  variableMapping: z.array(variableMappingSchema),
  scheduledAt: z.string().trim().optional(),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z
  .object({
    name: nameSchema.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    whatsappPhoneNumberId: ID_SCHEMA.optional(),
    messageTemplateId: ID_SCHEMA.optional(),
    language: z.string().trim().min(2).max(10).optional(),
    audience: audienceSelectionSchema.optional(),
    variableMapping: z.array(variableMappingSchema).optional(),
    scheduledAt: z.string().trim().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'AT_LEAST_ONE_FIELD_REQUIRED' });
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const campaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  whatsappPhoneNumberId: z.string().uuid().nullable(),
  messageTemplateId: z.string().uuid().nullable(),
  templateSnapshot: templateSnapshotSchema.nullable(),
  language: z.string(),
  status: z.enum(CAMPAIGN_STATUSES),
  audienceType: z.enum(AUDIENCE_TYPES),
  audienceSnapshot: z.array(audienceSnapshotContactSchema),
  variableMapping: z.array(variableMappingSchema),
  scheduledAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  pausedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  approvedByUserId: z.string().uuid().nullable(),
  totalRecipients: z.number().int().nonnegative(),
  eligibleRecipients: z.number().int().nonnegative(),
  skippedRecipients: z.number().int().nonnegative(),
  queuedRecipients: z.number().int().nonnegative(),
  sentRecipients: z.number().int().nonnegative(),
  deliveredRecipients: z.number().int().nonnegative(),
  readRecipients: z.number().int().nonnegative(),
  repliedRecipients: z.number().int().nonnegative(),
  failedRecipients: z.number().int().nonnegative(),
  optedOutRecipients: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type CampaignDto = z.infer<typeof campaignSchema>;

export const campaignRecipientSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  phoneE164: z.string(),
  contactSnapshot: z.record(z.string(), z.unknown()),
  resolvedTemplateParameters: z.array(z.string()),
  status: z.enum(CAMPAIGN_RECIPIENT_STATUSES),
  eligibilityReason: z.enum(ELIGIBILITY_REASONS).nullable(),
  idempotencyKey: z.string(),
  queueJobId: z.string().nullable(),
  metaMessageId: z.string().nullable(),
  queuedAt: z.string().nullable(),
  sendAttemptedAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  readAt: z.string().nullable(),
  repliedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  optedOutAt: z.string().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CampaignRecipientDto = z.infer<typeof campaignRecipientSchema>;

export const campaignQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  templateId: ID_SCHEMA.optional(),
  createdByUserId: ID_SCHEMA.optional(),
  createdFrom: z.string().trim().optional(),
  createdTo: z.string().trim().optional(),
  sortBy: z.enum(['name', 'status', 'createdAt', 'updatedAt', 'scheduledAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type CampaignQuery = z.infer<typeof campaignQuerySchema>;

export const paginatedCampaignsSchema = paginatedResponseSchema(campaignSchema);
export type PaginatedCampaigns = z.infer<typeof paginatedCampaignsSchema>;

export const campaignRecipientQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(CAMPAIGN_RECIPIENT_STATUSES).optional(),
  failureCode: z.string().trim().max(100).optional(),
  search: z.string().trim().max(255).optional(),
  sortBy: z.enum(['phoneE164', 'status', 'createdAt', 'sentAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export type CampaignRecipientQuery = z.infer<typeof campaignRecipientQuerySchema>;

export const paginatedCampaignRecipientsSchema = paginatedResponseSchema(campaignRecipientSchema);
export type PaginatedCampaignRecipients = z.infer<typeof paginatedCampaignRecipientsSchema>;

export const messageSchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  conversationId: z.string().uuid().nullable(),
  campaignId: z.string().uuid().nullable(),
  campaignRecipientId: z.string().uuid().nullable(),
  whatsappPhoneNumberId: z.string().nullable(),
  direction: z.enum(MESSAGE_DIRECTIONS),
  type: z.string(),
  status: z.enum(MESSAGE_ROW_STATUSES),
  metaMessageId: z.string().nullable(),
  replyToMetaMessageId: z.string().nullable(),
  textContent: z.string().nullable(),
  templateName: z.string().nullable(),
  templateLanguage: z.string().nullable(),
  templateParameters: z.array(z.string()).nullable(),
  mediaId: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  sentByUserId: z.string().uuid().nullable(),
  isTest: z.boolean().default(false),
  mediaFile: z.lazy(() => mediaFileSchema.nullable().optional()),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  readAt: z.string().nullable(),
  failedAt: z.string().nullable(),
});
export type MessageDto = z.infer<typeof messageSchema>;

export const testSendSchema = z.object({
  testNumbers: z.array(z.string().trim().min(3).max(30)).min(1).max(5),
  sampleParameters: z.array(z.string().trim().max(500).max(100)).max(10).optional(),
});
export type TestSendInput = z.infer<typeof testSendSchema>;

export const testSendResultSchema = z.object({
  number: z.string(),
  success: z.boolean(),
  metaMessageId: z.string().nullable(),
  error: z.string().nullable(),
});
export type TestSendResult = z.infer<typeof testSendResultSchema>;

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
  WHATSAPP_CREDENTIALS_UPDATE: 'whatsapp.credentials_update',
  WHATSAPP_TOKEN_REPLACE: 'whatsapp.token_replace',
  WHATSAPP_TEST_CONNECTION: 'whatsapp.test_connection',
  WHATSAPP_ACCOUNT_SYNC: 'whatsapp.account_sync',
  WHATSAPP_PHONE_NUMBERS_SYNC: 'whatsapp.phone_numbers_sync',
  WHATSAPP_DISCONNECT: 'whatsapp.disconnect',
  CONTACT_CREATE: 'contact.create',
  CONTACT_UPDATE: 'contact.update',
  CONTACT_ARCHIVE: 'contact.archive',
  CONTACT_RESTORE: 'contact.restore',
  CONTACT_TAGS_ADD: 'contact.tags_add',
  CONTACT_TAGS_REMOVE: 'contact.tags_remove',
  CONTACT_LISTS_ADD: 'contact.lists_add',
  CONTACT_LISTS_REMOVE: 'contact.lists_remove',
  CONTACT_CONSENT_UPDATE: 'contact.consent_update',
  CONTACT_SUPPRESS: 'contact.suppress',
  CONTACT_UNSUPPRESS: 'contact.unsuppress',
  CONTACT_BULK: 'contact.bulk',
  TAG_CREATE: 'tag.create',
  TAG_UPDATE: 'tag.update',
  TAG_ARCHIVE: 'tag.archive',
  LIST_CREATE: 'list.create',
  LIST_UPDATE: 'list.update',
  LIST_ARCHIVE: 'list.archive',
  LIST_MEMBERS_ADD: 'list.members_add',
  LIST_MEMBERS_REMOVE: 'list.members_remove',
  IMPORT_UPLOAD: 'import.upload',
  IMPORT_CONFIGURE: 'import.configure',
  IMPORT_START: 'import.start',
  IMPORT_COMPLETED: 'import.completed',
  TEMPLATE_SYNC: 'whatsapp.template_sync',
  TEMPLATE_CREATE: 'whatsapp.template_create',
  TEMPLATE_STATUS_BLOCKED: 'whatsapp.template_status_blocked',
  CAMPAIGN_CREATE: 'campaign.create',
  CAMPAIGN_UPDATE: 'campaign.update',
  CAMPAIGN_VALIDATE: 'campaign.validate',
  CAMPAIGN_SCHEDULE: 'campaign.schedule',
  CAMPAIGN_START: 'campaign.start',
  CAMPAIGN_PAUSE: 'campaign.pause',
  CAMPAIGN_RESUME: 'campaign.resume',
  CAMPAIGN_CANCEL: 'campaign.cancel',
  CAMPAIGN_DUPLICATE: 'campaign.duplicate',
  CAMPAIGN_ARCHIVE: 'campaign.archive',
  CAMPAIGN_TEST_SEND: 'campaign.test_send',
  CAMPAIGN_RECIPIENT_OPT_OUT: 'campaign.recipient_opt_out',
  INBOX_MESSAGE_SEND: 'inbox.message_send',
  INBOX_MESSAGE_RETRY: 'inbox.message_retry',
  INBOX_CONVERSATION_ASSIGN: 'inbox.conversation_assign',
  INBOX_CONVERSATION_CLAIM: 'inbox.conversation_claim',
  INBOX_CONVERSATION_STATUS_CHANGE: 'inbox.conversation_status_change',
  INBOX_CONVERSATION_PRIORITY_CHANGE: 'inbox.conversation_priority_change',
  INBOX_CONVERSATION_MARK_READ: 'inbox.conversation_mark_read',
  INBOX_CONVERSATION_MARK_UNREAD: 'inbox.conversation_mark_unread',
  INBOX_CONVERSATION_CLOSE: 'inbox.conversation_close',
  INBOX_CONVERSATION_REOPEN: 'inbox.conversation_reopen',
  INBOX_CONVERSATION_TAGS_ADD: 'inbox.conversation_tags_add',
  INBOX_NOTE_CREATE: 'inbox.note_create',
  INBOX_NOTE_UPDATE: 'inbox.note_update',
  INBOX_NOTE_DELETE: 'inbox.note_delete',
  INBOX_QUICK_REPLY_CREATE: 'inbox.quick_reply_create',
  INBOX_QUICK_REPLY_UPDATE: 'inbox.quick_reply_update',
  INBOX_QUICK_REPLY_ARCHIVE: 'inbox.quick_reply_archive',
  INBOX_MEDIA_UPLOAD: 'inbox.media_upload',
  INBOX_OPT_OUT: 'inbox.opt_out',
  EXPORT_CREATE: 'export.create',
  EXPORT_FAILED: 'export.failed',
  OPERATIONS_RETRY: 'operations.retry_failed',
  OPERATIONS_DRAIN: 'operations.drain_failed',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// ---------- Reports ----------

export const TREND_GRANULARITIES = ['day', 'week', 'month'] as const;
export type TrendGranularity = (typeof TREND_GRANULARITIES)[number];

export const dateRangeQuerySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

export const dashboardQuerySchema = dateRangeQuerySchema.extend({
  granularity: z.enum(TREND_GRANULARITIES).default('day'),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const dashboardSummarySchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  generatedAt: z.string(),
  totals: z.object({
    contacts: z.number().int().nonnegative(),
    newContacts: z.number().int().nonnegative(),
    conversations: z.number().int().nonnegative(),
    openConversations: z.number().int().nonnegative(),
    unreadConversations: z.number().int().nonnegative(),
    messagesSent: z.number().int().nonnegative(),
    messagesReceived: z.number().int().nonnegative(),
    campaignsRun: z.number().int().nonnegative(),
    recipientsDelivered: z.number().int().nonnegative(),
    failedSends: z.number().int().nonnegative(),
    optedOut: z.number().int().nonnegative(),
  }),
  rates: z.object({
    deliveryRate: z.number().min(0).max(1),
    readRate: z.number().min(0).max(1),
    replyRate: z.number().min(0).max(1),
    failureRate: z.number().min(0).max(1),
  }),
});
export type DashboardSummaryDto = z.infer<typeof dashboardSummarySchema>;

export const trendPointSchema = z.object({
  bucket: z.string(),
  messagesSent: z.number().int().nonnegative(),
  messagesReceived: z.number().int().nonnegative(),
  conversationsOpened: z.number().int().nonnegative(),
  contactsAdded: z.number().int().nonnegative(),
});
export type TrendPoint = z.infer<typeof trendPointSchema>;

export const dashboardTrendsSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  granularity: z.enum(TREND_GRANULARITIES),
  points: z.array(trendPointSchema),
});
export type DashboardTrendsDto = z.infer<typeof dashboardTrendsSchema>;

export const campaignPerformanceRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(CAMPAIGN_STATUSES),
  audienceType: z.enum(AUDIENCE_TYPES),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  totalRecipients: z.number().int().nonnegative(),
  sentRecipients: z.number().int().nonnegative(),
  deliveredRecipients: z.number().int().nonnegative(),
  readRecipients: z.number().int().nonnegative(),
  repliedRecipients: z.number().int().nonnegative(),
  failedRecipients: z.number().int().nonnegative(),
  optedOutRecipients: z.number().int().nonnegative(),
  deliveryRate: z.number().min(0).max(1),
  readRate: z.number().min(0).max(1),
  replyRate: z.number().min(0).max(1),
  failureRate: z.number().min(0).max(1),
});
export type CampaignPerformanceRow = z.infer<typeof campaignPerformanceRowSchema>;

export const campaignPerformanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  sortBy: z.enum(['name', 'status', 'createdAt', 'totalRecipients', 'deliveryRate', 'readRate']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type CampaignPerformanceQuery = z.infer<typeof campaignPerformanceQuerySchema>;

export const paginatedCampaignPerformanceSchema = paginatedResponseSchema(campaignPerformanceRowSchema);
export type PaginatedCampaignPerformance = z.infer<typeof paginatedCampaignPerformanceSchema>;

export const failureBucketSchema = z.object({
  code: z.string(),
  message: z.string(),
  count: z.number().int().nonnegative(),
  lastOccurredAt: z.string().nullable(),
});
export type FailureBucket = z.infer<typeof failureBucketSchema>;

export const recentFailureSchema = z.object({
  id: z.string().uuid(),
  campaignName: z.string().nullable(),
  phoneE164: z.string().nullable(),
  code: z.string().nullable(),
  message: z.string().nullable(),
  failedAt: z.string(),
});
export type RecentFailure = z.infer<typeof recentFailureSchema>;

export const failureAnalysisSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  generatedAt: z.string(),
  totalFailures: z.number().int().nonnegative(),
  buckets: z.array(failureBucketSchema),
  recentFailures: z.array(recentFailureSchema),
});
export type FailureAnalysisDto = z.infer<typeof failureAnalysisSchema>;

export const failureAnalysisQuerySchema = dateRangeQuerySchema.extend({
  code: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type FailureAnalysisQuery = z.infer<typeof failureAnalysisQuerySchema>;

export const inboxPerformanceRowSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  conversationsAssigned: z.number().int().nonnegative(),
  conversationsClosed: z.number().int().nonnegative(),
  messagesSent: z.number().int().nonnegative(),
  messagesReceived: z.number().int().nonnegative(),
  notesCreated: z.number().int().nonnegative(),
  avgFirstResponseMinutes: z.number().nonnegative().nullable(),
  avgHandleMinutes: z.number().nonnegative().nullable(),
});
export type InboxPerformanceRow = z.infer<typeof inboxPerformanceRowSchema>;

export const inboxPerformanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  userId: ID_SCHEMA.optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  sortBy: z
    .enum(['name', 'conversationsAssigned', 'conversationsClosed', 'messagesSent', 'avgFirstResponseMinutes', 'avgHandleMinutes'])
    .default('conversationsAssigned'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type InboxPerformanceQuery = z.infer<typeof inboxPerformanceQuerySchema>;

export const paginatedInboxPerformanceSchema = paginatedResponseSchema(inboxPerformanceRowSchema);
export type PaginatedInboxPerformance = z.infer<typeof paginatedInboxPerformanceSchema>;

export const contactReportRowSchema = z.object({
  id: z.string().uuid(),
  phoneE164: z.string(),
  displayName: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  company: z.string().nullable(),
  language: z.enum(LANGUAGES).nullable(),
  phoneCountry: z.string().nullable(),
  status: z.enum(CONTACT_STATUSES),
  source: z.string().nullable(),
  optInStatus: z.enum(OPT_IN_STATUSES),
  suppressed: z.boolean(),
  messagesInbound: z.number().int().nonnegative(),
  messagesOutbound: z.number().int().nonnegative(),
  campaignDeliveries: z.number().int().nonnegative(),
  lastInboundMessageAt: z.string().nullable(),
  lastOutboundMessageAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ContactReportRow = z.infer<typeof contactReportRowSchema>;

export const contactReportQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  language: z.enum(LANGUAGES).optional(),
  source: z.string().trim().max(100).optional(),
  tagId: ID_SCHEMA.optional(),
  listId: ID_SCHEMA.optional(),
  optInStatus: z.enum(OPT_IN_STATUSES).optional(),
  suppressed: z.enum(['yes', 'no']).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  sortBy: z
    .enum(['createdAt', 'displayName', 'phoneE164', 'messagesInbound', 'messagesOutbound', 'campaignDeliveries', 'lastInboundMessageAt'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ContactReportQuery = z.infer<typeof contactReportQuerySchema>;

export const paginatedContactReportSchema = paginatedResponseSchema(contactReportRowSchema);
export type PaginatedContactReport = z.infer<typeof paginatedContactReportSchema>;

export const contactBreakdownSchema = z.object({
  totalContacts: z.number().int().nonnegative(),
  byStatus: z.record(z.string(), z.number().int().nonnegative()),
  byCountry: z.record(z.string(), z.number().int().nonnegative()),
  byLanguage: z.record(z.string(), z.number().int().nonnegative()),
  bySource: z.record(z.string(), z.number().int().nonnegative()),
  suppressed: z.number().int().nonnegative(),
  notSuppressed: z.number().int().nonnegative(),
  optedIn: z.number().int().nonnegative(),
  optedOut: z.number().int().nonnegative(),
  unknownConsent: z.number().int().nonnegative(),
});
export type ContactBreakdownDto = z.infer<typeof contactBreakdownSchema>;

// ---------- Exports ----------

export const EXPORT_JOB_TYPES = [
  'contacts',
  'campaign-recipients',
  'campaign-performance',
  'inbox-performance',
  'failure-analysis',
  'audit-log',
] as const;
export type ExportJobType = (typeof EXPORT_JOB_TYPES)[number];

export const EXPORT_JOB_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type ExportJobStatus = (typeof EXPORT_JOB_STATUSES)[number];

export const exportJobSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(EXPORT_JOB_TYPES),
  filters: z.record(z.string(), z.unknown()).nullable(),
  status: z.enum(EXPORT_JOB_STATUSES),
  fileName: z.string().nullable(),
  totalRows: z.number().int().nonnegative(),
  errorMessage: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  downloadCount: z.number().int().nonnegative(),
  downloadUrl: z.string().nullable(),
});
export type ExportJobDto = z.infer<typeof exportJobSchema>;

export const createExportSchema = z.object({
  type: z.enum(EXPORT_JOB_TYPES),
  filters: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type CreateExportInput = z.infer<typeof createExportSchema>;

export const exportQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(EXPORT_JOB_TYPES).optional(),
  status: z.enum(EXPORT_JOB_STATUSES).optional(),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;

export const paginatedExportsSchema = paginatedResponseSchema(exportJobSchema);
export type PaginatedExports = z.infer<typeof paginatedExportsSchema>;

// ---------- Audit logs ----------

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditLogDto = z.infer<typeof auditLogSchema>;

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(120).optional(),
  actorUserId: ID_SCHEMA.optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  search: z.string().trim().max(255).optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const paginatedAuditLogsSchema = paginatedResponseSchema(auditLogSchema);
export type PaginatedAuditLogs = z.infer<typeof paginatedAuditLogsSchema>;

// ---------- Operations ----------

export const queueStatusSchema = z.object({
  name: z.string(),
  waiting: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  paused: z.boolean(),
  workers: z.number().int().nonnegative(),
});
export type QueueStatusDto = z.infer<typeof queueStatusSchema>;

export const systemStatusSchema = z.object({
  generatedAt: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  version: z.string(),
  database: z.object({
    up: z.boolean(),
    latencyMs: z.number().nonnegative().nullable(),
  }),
  redis: z.object({
    up: z.boolean(),
    latencyMs: z.number().nonnegative().nullable(),
  }),
  queues: z.array(queueStatusSchema),
  webhooks: z.object({
    received: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    processing: z.number().int().nonnegative(),
    processed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    ignored: z.number().int().nonnegative(),
    oldestPendingSeconds: z.number().nonnegative().nullable(),
  }),
  whatsapp: z.object({
    accountStatus: z.enum(WHATSAPP_ACCOUNT_STATUSES).nullable(),
    lastConnectionTestAt: z.string().nullable(),
    lastConnectionError: z.string().nullable(),
    templatesLastSyncedAt: z.string().nullable(),
    phoneNumbers: z.number().int().nonnegative(),
  }),
  inbox: z.object({
    openConversations: z.number().int().nonnegative(),
    unreadConversations: z.number().int().nonnegative(),
    unassignedConversations: z.number().int().nonnegative(),
  }),
});
export type SystemStatusDto = z.infer<typeof systemStatusSchema>;

export const queueOperationSchema = z.object({
  queue: z.string().trim().min(1).max(120),
  jobIds: z.array(z.string().trim().min(1).max(200)).max(500).optional(),
});
export type QueueOperationInput = z.infer<typeof queueOperationSchema>;

export const queueOperationResultSchema = z.object({
  queue: z.string(),
  retried: z.number().int().nonnegative().optional(),
  removed: z.number().int().nonnegative().optional(),
  errors: z.array(z.string()),
});
export type QueueOperationResultDto = z.infer<typeof queueOperationResultSchema>;
