import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type {
  ContactStatus,
  ContactListType,
  ImportJobStatus,
  ImportRowStatus,
  Language,
  OptInStatus,
  Role,
  SuppressionReason,
  UserStatus,
  WhatsAppAccountStatus,
  WebhookProcessingStatus,
  TemplateCategory,
  TemplateComponent,
  TemplateStatus,
  CampaignStatus,
  CampaignRecipientStatus,
  MessageDirection,
  MessageRowStatus,
  ConversationStatus,
  ConversationPriority,
  QuickReplyVisibility,
  MediaFileDirection,
  MediaFileSource,
  MediaFileStatus,
  ExportJobType,
  ExportJobStatus,
  HelpArticleStatus,
  HelpArticleType,
  HelpArticleDifficulty,
  HelpCategoryStatus,
  HelpLinkRelation,
  EmailLogStatus,
  NotificationSeverity,
  NotificationType,
  PricingBillingModel,
  PricingCategory,
  PricingRuleSetStatus,
  PricingRuleSourceType,
  CostCalculationStatus,
  ChargeStatus,
  FreeReason,
  EntryWindowSourceType,
  EntryWindowStatus,
  BudgetScopeType,
  BudgetPeriodType,
  BudgetPolicyStatus,
  CostReconciliationStatus,
  ConversationOutcome,
  CostEventType,
} from '@wa/shared';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).$type<Role>().notNull().default('AGENT'),
  status: varchar('status', { length: 20 }).$type<UserStatus>().notNull().default('ACTIVE'),
  preferredLanguage: varchar('preferred_language', { length: 2 }).$type<Language>().notNull().default('ar'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedByTokenId: uuid('replaced_by_token_id').references((): AnyPgColumn => refreshTokens.id),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

export const settings = pgTable(
  'settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    namespace: varchar('namespace', { length: 64 }).notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    encryptedValue: text('encrypted_value'),
    publicValue: text('public_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('settings_namespace_key_idx').on(table.namespace, table.key)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata'),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_actor_user_id_idx').on(table.actorUserId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);

export const whatsappAccounts = pgTable(
  'whatsapp_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }),
    metaBusinessAccountId: varchar('meta_business_account_id', { length: 100 }),
    wabaId: varchar('waba_id', { length: 100 }).notNull(),
    appId: varchar('app_id', { length: 100 }),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    accessTokenLastFour: varchar('access_token_last_four', { length: 4 }).notNull(),
    tokenUpdatedAt: timestamp('token_updated_at', { withTimezone: true }),
    status: varchar('status', { length: 20 }).$type<WhatsAppAccountStatus>().notNull().default('DISCONNECTED'),
    lastConnectionTestAt: timestamp('last_connection_test_at', { withTimezone: true }),
    lastConnectionError: text('last_connection_error'),
    templatesLastSyncedAt: timestamp('templates_last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('whatsapp_accounts_waba_id_idx').on(table.wabaId)],
);

export const whatsappPhoneNumbers = pgTable(
  'whatsapp_phone_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    whatsappAccountId: uuid('whatsapp_account_id')
      .notNull()
      .references(() => whatsappAccounts.id, { onDelete: 'cascade' }),
    phoneNumberId: varchar('phone_number_id', { length: 100 }).notNull(),
    displayPhoneNumber: varchar('display_phone_number', { length: 50 }),
    verifiedName: varchar('verified_name', { length: 100 }),
    qualityRating: varchar('quality_rating', { length: 20 }),
    messagingLimitTier: varchar('messaging_limit_tier', { length: 20 }),
    status: varchar('status', { length: 20 }),
    isDefault: boolean('is_default').notNull().default(false),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('whatsapp_phone_numbers_account_number_idx').on(table.whatsappAccountId, table.phoneNumberId),
    index('whatsapp_phone_numbers_account_idx').on(table.whatsappAccountId),
  ],
);

export const messageTemplates = pgTable(
  'message_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    whatsappAccountId: uuid('whatsapp_account_id')
      .notNull()
      .references(() => whatsappAccounts.id, { onDelete: 'cascade' }),
    metaTemplateId: varchar('meta_template_id', { length: 100 }).notNull(),
    name: varchar('name', { length: 512 }).notNull(),
    language: varchar('language', { length: 10 }).notNull(),
    category: varchar('category', { length: 30 }).$type<TemplateCategory>().notNull(),
    status: varchar('status', { length: 20 }).$type<TemplateStatus>().notNull(),
    qualityScore: varchar('quality_score', { length: 20 }),
    rejectionReason: text('rejection_reason'),
    components: jsonb('components').$type<TemplateComponent[]>().notNull().default([]),
    rawMetaPayload: jsonb('raw_meta_payload').$type<Record<string, unknown> | null>(),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    metaUpdatedAt: timestamp('meta_updated_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('message_templates_account_meta_idx').on(table.whatsappAccountId, table.metaTemplateId),
    index('message_templates_status_idx').on(table.status),
    index('message_templates_account_idx').on(table.whatsappAccountId),
    index('message_templates_updated_at_idx').on(table.updatedAt),
  ],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 50 }).notNull().default('whatsapp'),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    deduplicationKey: varchar('deduplication_key', { length: 255 }).notNull(),
    payload: jsonb('payload').notNull(),
    signatureValid: boolean('signature_valid').notNull().default(true),
    processingStatus: varchar('processing_status', { length: 20 })
      .$type<WebhookProcessingStatus>()
      .notNull()
      .default('RECEIVED'),
    processingAttempts: integer('processing_attempts').notNull().default(0),
    correlationId: varchar('correlation_id', { length: 64 }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('webhook_events_deduplication_key_idx').on(table.deduplicationKey),
    index('webhook_events_processing_status_idx').on(table.processingStatus),
    index('webhook_events_received_at_idx').on(table.receivedAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type WhatsAppAccountRow = typeof whatsappAccounts.$inferSelect;
export type NewWhatsAppAccount = typeof whatsappAccounts.$inferInsert;
export type WhatsAppPhoneNumberRow = typeof whatsappPhoneNumbers.$inferSelect;
export type NewWhatsAppPhoneNumber = typeof whatsappPhoneNumbers.$inferInsert;
export type MessageTemplateRow = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;
export type WebhookEventRow = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
export type ContactRow = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type TagRow = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type ContactListRow = typeof contactLists.$inferSelect;
export type NewContactList = typeof contactLists.$inferInsert;
export type OptInRecordRow = typeof optInRecords.$inferSelect;
export type NewOptInRecord = typeof optInRecords.$inferInsert;
export type SuppressionEntryRow = typeof suppressionEntries.$inferSelect;
export type NewSuppressionEntry = typeof suppressionEntries.$inferInsert;
export type ImportJobRow = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;
export type ImportRowRow = typeof importRows.$inferSelect;
export type NewImportRow = typeof importRows.$inferInsert;

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phoneE164: varchar('phone_e164', { length: 20 }).notNull(),
    phoneCountry: varchar('phone_country', { length: 2 }),
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    displayName: varchar('display_name', { length: 160 }),
    email: varchar('email', { length: 255 }),
    company: varchar('company', { length: 160 }),
    language: varchar('language', { length: 2 }).$type<Language>(),
    status: varchar('status', { length: 20 }).$type<ContactStatus>().notNull().default('ACTIVE'),
    source: varchar('source', { length: 100 }),
    customFields: jsonb('custom_fields').$type<Record<string, string> | null>(),
    lastInboundMessageAt: timestamp('last_inbound_message_at', { withTimezone: true }),
    lastOutboundMessageAt: timestamp('last_outbound_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('contacts_phone_e164_idx').on(table.phoneE164),
    index('contacts_status_idx').on(table.status),
    index('contacts_country_idx').on(table.phoneCountry),
    index('contacts_email_idx').on(table.email),
    index('contacts_created_at_idx').on(table.createdAt),
    index('contacts_last_inbound_idx').on(table.lastInboundMessageAt),
    index('contacts_last_outbound_idx').on(table.lastOutboundMessageAt),
  ],
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('tags_slug_idx').on(table.slug)],
);

export const contactTags = pgTable(
  'contact_tags',
  {
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.contactId, table.tagId] })],
);

export const contactLists = pgTable(
  'contact_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    type: varchar('type', { length: 20 }).$type<ContactListType>().notNull().default('STATIC'),
    activeContactCount: integer('active_contact_count').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [index('contact_lists_type_idx').on(table.type)],
);

export const contactListMembers = pgTable(
  'contact_list_members',
  {
    contactListId: uuid('contact_list_id')
      .notNull()
      .references(() => contactLists.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    addedByUserId: uuid('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.contactListId, table.contactId] }),
    index('contact_list_members_contact_idx').on(table.contactId),
  ],
);

export const optInRecords = pgTable(
  'opt_in_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).$type<OptInStatus>().notNull(),
    source: varchar('source', { length: 100 }),
    consentText: text('consent_text'),
    allowedCategories: jsonb('allowed_categories').$type<string[] | null>(),
    proofReference: varchar('proof_reference', { length: 255 }),
    obtainedAt: timestamp('obtained_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('opt_in_records_contact_idx').on(table.contactId),
    index('opt_in_records_obtained_at_idx').on(table.obtainedAt),
  ],
);

export const suppressionEntries = pgTable(
  'suppression_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    phoneE164: varchar('phone_e164', { length: 20 }),
    reason: varchar('reason', { length: 20 }).$type<SuppressionReason>().notNull(),
    source: varchar('source', { length: 100 }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedByUserId: uuid('removed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('suppression_entries_contact_idx').on(table.contactId),
    index('suppression_entries_phone_idx').on(table.phoneE164),
    index('suppression_entries_active_idx').on(table.removedAt),
  ],
);

export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    storedFilename: varchar('stored_filename', { length: 255 }).notNull(),
    fileType: varchar('file_type', { length: 10 }).$type<'csv' | 'xlsx'>().notNull(),
    status: varchar('status', { length: 20 }).$type<ImportJobStatus>().notNull().default('UPLOADED'),
    totalRows: integer('total_rows').notNull().default(0),
    validRows: integer('valid_rows').notNull().default(0),
    invalidRows: integer('invalid_rows').notNull().default(0),
    createdRows: integer('created_rows').notNull().default(0),
    updatedRows: integer('updated_rows').notNull().default(0),
    skippedRows: integer('skipped_rows').notNull().default(0),
    duplicateRows: integer('duplicate_rows').notNull().default(0),
    errorRows: integer('error_rows').notNull().default(0),
    columnMapping: jsonb('column_mapping').$type<Record<string, string> | null>(),
    options: jsonb('options').$type<Record<string, unknown> | null>(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('import_jobs_status_idx').on(table.status),
    index('import_jobs_created_by_idx').on(table.createdByUserId),
    index('import_jobs_created_at_idx').on(table.createdAt),
  ],
);

export const importRows = pgTable(
  'import_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importJobId: uuid('import_job_id')
      .notNull()
      .references(() => importJobs.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    rawData: jsonb('raw_data').$type<Record<string, unknown>>().notNull(),
    normalizedPhone: varchar('normalized_phone', { length: 20 }),
    status: varchar('status', { length: 20 }).$type<ImportRowStatus>().notNull().default('PENDING'),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    errorMessages: jsonb('error_messages').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('import_rows_job_row_idx').on(table.importJobId, table.rowNumber),
    index('import_rows_job_status_idx').on(table.importJobId, table.status),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    whatsappPhoneNumberId: varchar('whatsapp_phone_number_id', { length: 100 }),
    status: varchar('status', { length: 30 }).$type<ConversationStatus>().notNull().default('NEW'),
    priority: varchar('priority', { length: 20 }).$type<ConversationPriority>().notNull().default('NORMAL'),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    lastMessageId: uuid('last_message_id'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastInboundMessageAt: timestamp('last_inbound_message_at', { withTimezone: true }),
    lastOutboundMessageAt: timestamp('last_outbound_message_at', { withTimezone: true }),
    unreadCount: integer('unread_count').notNull().default(0),
    serviceWindowOpenedAt: timestamp('service_window_opened_at', { withTimezone: true }),
    serviceWindowExpiresAt: timestamp('service_window_expires_at', { withTimezone: true }),
    serviceWindowSourceMessageId: varchar('service_window_source_message_id', { length: 200 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    index('conversations_contact_idx').on(table.contactId),
    index('conversations_status_idx').on(table.status),
    index('conversations_priority_idx').on(table.priority),
    index('conversations_assigned_idx').on(table.assignedUserId),
    index('conversations_last_message_at_idx').on(table.lastMessageAt),
    index('conversations_unread_idx').on(table.unreadCount),
  ],
);

export const conversationAssignments = pgTable(
  'conversation_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    fromUserId: uuid('from_user_id').references(() => users.id, { onDelete: 'set null' }),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('conversation_assignments_conversation_idx').on(table.conversationId), index('conversation_assignments_created_at_idx').on(table.createdAt)],
);

export const internalNotes = pgTable(
  'internal_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('internal_notes_conversation_idx').on(table.conversationId)],
);

export const quickReplies = pgTable(
  'quick_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 120 }).notNull(),
    content: text('content').notNull(),
    language: varchar('language', { length: 2 }).$type<Language>().notNull().default('ar'),
    category: varchar('category', { length: 60 }),
    visibility: varchar('visibility', { length: 10 }).$type<QuickReplyVisibility>().notNull().default('PERSONAL'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    index('quick_replies_visibility_language_idx').on(table.visibility, table.language),
    index('quick_replies_created_by_idx').on(table.createdByUserId),
  ],
);

export const mediaFiles = pgTable(
  'media_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    direction: varchar('direction', { length: 10 }).$type<MediaFileDirection>().notNull(),
    source: varchar('source', { length: 20 }).$type<MediaFileSource>().notNull(),
    metaMediaId: varchar('meta_media_id', { length: 200 }),
    originalFilename: varchar('original_filename', { length: 255 }),
    storedFilename: varchar('stored_filename', { length: 255 }),
    contentType: varchar('content_type', { length: 120 }),
    sizeBytes: integer('size_bytes'),
    sha256: varchar('sha256', { length: 64 }),
    status: varchar('status', { length: 20 }).$type<MediaFileStatus>().notNull().default('PENDING'),
    errorMessage: text('error_message'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('media_files_message_idx').on(table.messageId),
    index('media_files_conversation_idx').on(table.conversationId),
  ],
);

// ---------- Pricing ----------

export const pricingRuleSets = pgTable(
  'pricing_rule_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    provider: varchar('provider', { length: 100 }).notNull().default('Meta'),
    description: text('description'),
    currency: varchar('currency', { length: 3 }).notNull(),
    status: varchar('status', { length: 20 }).$type<PricingRuleSetStatus>().notNull().default('DRAFT'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    sourceType: varchar('source_type', { length: 30 }).$type<PricingRuleSourceType>().notNull().default('MANUAL'),
    sourceReference: varchar('source_reference', { length: 255 }),
    version: integer('version').notNull().default(1),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    index('pricing_rule_sets_status_idx').on(table.status),
    index('pricing_rule_sets_effective_from_idx').on(table.effectiveFrom),
    index('pricing_rule_sets_currency_idx').on(table.currency),
  ],
);

export const pricingRules = pgTable(
  'pricing_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pricingRuleSetId: uuid('pricing_rule_set_id')
      .notNull()
      .references(() => pricingRuleSets.id, { onDelete: 'cascade' }),
    marketCode: varchar('market_code', { length: 20 }).notNull(),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    messageCategory: varchar('message_category', { length: 30 }).$type<PricingCategory>().notNull(),
    messageType: varchar('message_type', { length: 40 }).notNull().default('*'),
    billingModel: varchar('billing_model', { length: 20 }).$type<PricingBillingModel>().notNull(),
    unitPrice: numeric('unit_price', { precision: 14, scale: 4 }).notNull().default('0'),
    tokenInputPrice: numeric('token_input_price', { precision: 14, scale: 6 }),
    tokenOutputPrice: numeric('token_output_price', { precision: 14, scale: 6 }),
    minimumCharge: numeric('minimum_charge', { precision: 14, scale: 4 }),
    currency: varchar('currency', { length: 3 }).notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    customerServiceWindowRequired: boolean('customer_service_window_required').notNull().default(false),
    freeEntryPointEligible: boolean('free_entry_point_eligible').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('pricing_rules_set_idx').on(table.pricingRuleSetId),
    index('pricing_rules_market_idx').on(table.marketCode, table.countryCode),
    index('pricing_rules_category_idx').on(table.messageCategory),
    index('pricing_rules_effective_idx').on(table.effectiveFrom, table.effectiveTo),
  ],
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    whatsappPhoneNumberId: uuid('whatsapp_phone_number_id').references(() => whatsappPhoneNumbers.id, { onDelete: 'set null' }),
    messageTemplateId: uuid('message_template_id').references(() => messageTemplates.id, { onDelete: 'set null' }),
    templateSnapshot: jsonb('template_snapshot').$type<Record<string, unknown> | null>(),
    language: varchar('language', { length: 10 }).notNull(),
    status: varchar('status', { length: 20 }).$type<CampaignStatus>().notNull().default('DRAFT'),
    audienceType: varchar('audience_type', { length: 20 }).$type<import('@wa/shared').AudienceType>().notNull().default('LISTS'),
    audienceSnapshot: jsonb('audience_snapshot').$type<unknown[] | null>().notNull().default([]),
    variableMapping: jsonb('variable_mapping').$type<unknown[] | null>().notNull().default([]),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    totalRecipients: integer('total_recipients').notNull().default(0),
    eligibleRecipients: integer('eligible_recipients').notNull().default(0),
    skippedRecipients: integer('skipped_recipients').notNull().default(0),
    queuedRecipients: integer('queued_recipients').notNull().default(0),
    sentRecipients: integer('sent_recipients').notNull().default(0),
    deliveredRecipients: integer('delivered_recipients').notNull().default(0),
    readRecipients: integer('read_recipients').notNull().default(0),
    repliedRecipients: integer('replied_recipients').notNull().default(0),
    failedRecipients: integer('failed_recipients').notNull().default(0),
    optedOutRecipients: integer('opted_out_recipients').notNull().default(0),
    pricingRuleSetId: uuid('pricing_rule_set_id').references(() => pricingRuleSets.id, { onDelete: 'set null' }),
    estimatedCost: numeric('estimated_cost', { precision: 14, scale: 4 }),
    finalCost: numeric('final_cost', { precision: 14, scale: 4 }),
    costCurrency: varchar('cost_currency', { length: 3 }),
    pricingSnapshot: jsonb('pricing_snapshot').$type<Record<string, unknown> | null>(),
    pricingCalculatedAt: timestamp('pricing_calculated_at', { withTimezone: true }),
    pricingWarningAcknowledgedAt: timestamp('pricing_warning_acknowledged_at', { withTimezone: true }),
    pricingWarningAcknowledgedByUserId: uuid('pricing_warning_acknowledged_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    index('campaigns_status_idx').on(table.status),
    index('campaigns_template_idx').on(table.messageTemplateId),
    index('campaigns_created_by_idx').on(table.createdByUserId),
    index('campaigns_scheduled_at_idx').on(table.scheduledAt),
    index('campaigns_created_at_idx').on(table.createdAt),
  ],
);

export const campaignRecipients = pgTable(
  'campaign_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    phoneE164: varchar('phone_e164', { length: 20 }).notNull(),
    contactSnapshot: jsonb('contact_snapshot').$type<Record<string, unknown> | null>().notNull().default({}),
    resolvedTemplateParameters: jsonb('resolved_template_parameters').$type<string[] | null>().notNull().default([]),
    status: varchar('status', { length: 20 }).$type<CampaignRecipientStatus>().notNull().default('PENDING'),
    eligibilityReason: varchar('eligibility_reason', { length: 30 }).$type<import('@wa/shared').EligibilityReason>(),
    idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
    queueJobId: varchar('queue_job_id', { length: 120 }),
    metaMessageId: varchar('meta_message_id', { length: 200 }),
    queuedAt: timestamp('queued_at', { withTimezone: true }),
    sendAttemptedAt: timestamp('send_attempted_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    optedOutAt: timestamp('opted_out_at', { withTimezone: true }),
    failureCode: varchar('failure_code', { length: 50 }),
    failureMessage: text('failure_message'),
    attemptCount: integer('attempt_count').notNull().default(0),
    recipientMarket: varchar('recipient_market', { length: 20 }),
    recipientCountry: varchar('recipient_country', { length: 2 }),
    messageCategory: varchar('message_category', { length: 30 }).$type<PricingCategory>(),
    estimatedCost: numeric('estimated_cost', { precision: 14, scale: 4 }),
    finalCost: numeric('final_cost', { precision: 14, scale: 4 }),
    chargeStatus: varchar('charge_status', { length: 20 }).$type<ChargeStatus>(),
    freeReason: varchar('free_reason', { length: 40 }).$type<FreeReason>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('campaign_recipients_campaign_contact_idx').on(table.campaignId, table.contactId),
    uniqueIndex('campaign_recipients_idempotency_key_idx').on(table.idempotencyKey),
    index('campaign_recipients_campaign_status_idx').on(table.campaignId, table.status),
    index('campaign_recipients_meta_message_id_idx').on(table.metaMessageId),
    index('campaign_recipients_failure_code_idx').on(table.failureCode),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    campaignRecipientId: uuid('campaign_recipient_id').references(() => campaignRecipients.id, { onDelete: 'set null' }),
    whatsappPhoneNumberId: varchar('whatsapp_phone_number_id', { length: 100 }),
    direction: varchar('direction', { length: 10 }).$type<MessageDirection>().notNull(),
    type: varchar('type', { length: 40 }).notNull(),
    status: varchar('status', { length: 20 }).$type<MessageRowStatus>().notNull().default('PENDING'),
    metaMessageId: varchar('meta_message_id', { length: 200 }),
    replyToMetaMessageId: varchar('reply_to_meta_message_id', { length: 200 }),
    textContent: text('text_content'),
    templateName: varchar('template_name', { length: 512 }),
    templateLanguage: varchar('template_language', { length: 10 }),
    templateParameters: jsonb('template_parameters').$type<string[] | null>(),
    mediaId: varchar('media_id', { length: 200 }),
    mediaUrl: varchar('media_url', { length: 2048 }),
    errorCode: varchar('error_code', { length: 50 }),
    errorMessage: text('error_message'),
    sentByUserId: uuid('sent_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    isTest: boolean('is_test').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('messages_meta_message_id_idx').on(table.metaMessageId),
    index('messages_contact_idx').on(table.contactId),
    index('messages_conversation_idx').on(table.conversationId),
    index('messages_campaign_idx').on(table.campaignId),
    index('messages_campaign_recipient_idx').on(table.campaignRecipientId),
    index('messages_status_idx').on(table.status),
    index('messages_created_at_idx').on(table.createdAt),
  ],
);

export const messageStatusEvents = pgTable(
  'message_status_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    campaignRecipientId: uuid('campaign_recipient_id').references(() => campaignRecipients.id, { onDelete: 'set null' }),
    metaMessageId: varchar('meta_message_id', { length: 200 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    errorCode: varchar('error_code', { length: 50 }),
    errorMessage: text('error_message'),
    eventTimestamp: timestamp('event_timestamp', { withTimezone: true }).notNull(),
    rawEventReference: varchar('raw_event_reference', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('message_status_events_message_idx').on(table.messageId),
    index('message_status_events_recipient_idx').on(table.campaignRecipientId),
    index('message_status_events_meta_message_id_idx').on(table.metaMessageId),
    index('message_status_events_event_timestamp_idx').on(table.eventTimestamp),
  ],
);

export const exportJobs = pgTable(
  'export_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: varchar('type', { length: 40 }).$type<ExportJobType>().notNull(),
    filters: jsonb('filters').$type<Record<string, unknown> | null>(),
    status: varchar('status', { length: 20 }).$type<ExportJobStatus>().notNull().default('PENDING'),
    fileName: varchar('file_name', { length: 255 }),
    totalRows: integer('total_rows').notNull().default(0),
    errorMessage: text('error_message'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    downloadCount: integer('download_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('export_jobs_created_by_idx').on(table.createdByUserId),
    index('export_jobs_type_status_idx').on(table.type, table.status),
    index('export_jobs_created_at_idx').on(table.createdAt),
  ],
);

// ---------- Message Costs ----------

export const messageCosts = pgTable(
  'message_costs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    campaignRecipientId: uuid('campaign_recipient_id').references(() => campaignRecipients.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    whatsappPhoneNumberId: varchar('whatsapp_phone_number_id', { length: 100 }),
    pricingRuleId: uuid('pricing_rule_id').references(() => pricingRules.id, { onDelete: 'set null' }),
    recipientMarket: varchar('recipient_market', { length: 20 }),
    recipientCountry: varchar('recipient_country', { length: 2 }),
    messageCategory: varchar('message_category', { length: 30 }).$type<PricingCategory>().notNull(),
    billingModel: varchar('billing_model', { length: 20 }).$type<PricingBillingModel>().notNull(),
    currency: varchar('currency', { length: 3 }),
    unitPrice: numeric('unit_price', { precision: 14, scale: 4 }),
    inputTokenCount: integer('input_token_count'),
    outputTokenCount: integer('output_token_count'),
    estimatedCost: numeric('estimated_cost', { precision: 14, scale: 4 }),
    confirmedCost: numeric('confirmed_cost', { precision: 14, scale: 4 }),
    adjustedCost: numeric('adjusted_cost', { precision: 14, scale: 4 }),
    finalCost: numeric('final_cost', { precision: 14, scale: 4 }),
    calculationStatus: varchar('calculation_status', { length: 20 }).$type<CostCalculationStatus>().notNull().default('PENDING'),
    chargeStatus: varchar('charge_status', { length: 20 }).$type<ChargeStatus>().notNull().default('UNKNOWN'),
    freeReason: varchar('free_reason', { length: 40 }).$type<FreeReason>(),
    customerServiceWindowOpen: boolean('customer_service_window_open'),
    freeEntryPointWindowOpen: boolean('free_entry_point_window_open'),
    costCalculatedAt: timestamp('cost_calculated_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    adjustedAt: timestamp('adjusted_at', { withTimezone: true }),
    adjustmentReason: text('adjustment_reason'),
    adjustedByUserId: uuid('adjusted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('message_costs_message_id_idx').on(table.messageId),
    index('message_costs_campaign_idx').on(table.campaignId),
    index('message_costs_conversation_idx').on(table.conversationId),
    index('message_costs_contact_idx').on(table.contactId),
    index('message_costs_calculated_at_idx').on(table.costCalculatedAt),
    index('message_costs_category_idx').on(table.messageCategory),
    index('message_costs_charge_status_idx').on(table.chargeStatus),
    index('message_costs_market_idx').on(table.recipientMarket),
  ],
);

export const messageCostEvents = pgTable(
  'message_cost_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageCostId: uuid('message_cost_id')
      .notNull()
      .references(() => messageCosts.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 30 }).$type<CostEventType>().notNull(),
    previousStatus: varchar('previous_status', { length: 20 }),
    newStatus: varchar('new_status', { length: 20 }),
    previousAmount: numeric('previous_amount', { precision: 14, scale: 4 }),
    newAmount: numeric('new_amount', { precision: 14, scale: 4 }),
    currency: varchar('currency', { length: 3 }),
    reason: text('reason'),
    source: varchar('source', { length: 60 }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('message_cost_events_cost_idx').on(table.messageCostId),
    index('message_cost_events_created_at_idx').on(table.createdAt),
  ],
);

export const conversationEntryWindows = pgTable(
  'conversation_entry_windows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
    whatsappPhoneNumberId: varchar('whatsapp_phone_number_id', { length: 100 }),
    sourceType: varchar('source_type', { length: 40 }).$type<EntryWindowSourceType>().notNull(),
    sourceReference: varchar('source_reference', { length: 255 }),
    sourceMessageId: varchar('source_message_id', { length: 200 }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 }).$type<EntryWindowStatus>().notNull().default('OPEN'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('entry_windows_contact_idx').on(table.contactId),
    index('entry_windows_conversation_idx').on(table.conversationId),
    index('entry_windows_status_idx').on(table.status),
    index('entry_windows_expires_idx').on(table.expiresAt),
  ],
);

// ---------- Budgets ----------

export const budgetPolicies = pgTable(
  'budget_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    scopeType: varchar('scope_type', { length: 30 }).$type<BudgetScopeType>().notNull(),
    scopeId: uuid('scope_id'),
    currency: varchar('currency', { length: 3 }).notNull(),
    periodType: varchar('period_type', { length: 30 }).$type<BudgetPeriodType>().notNull(),
    amountLimit: numeric('amount_limit', { precision: 14, scale: 4 }).notNull(),
    warningThresholdPercentage: integer('warning_threshold_percentage').notNull().default(70),
    criticalThresholdPercentage: integer('critical_threshold_percentage').notNull().default(90),
    hardStopEnabled: boolean('hard_stop_enabled').notNull().default(true),
    allowAdminOverride: boolean('allow_admin_override').notNull().default(true),
    status: varchar('status', { length: 20 }).$type<BudgetPolicyStatus>().notNull().default('ACTIVE'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('budget_policies_scope_idx').on(table.scopeType, table.scopeId),
    index('budget_policies_status_idx').on(table.status),
  ],
);

export const budgetUsageSnapshots = pgTable(
  'budget_usage_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetPolicyId: uuid('budget_policy_id')
      .notNull()
      .references(() => budgetPolicies.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    estimatedUsage: numeric('estimated_usage', { precision: 14, scale: 4 }).notNull().default('0'),
    confirmedUsage: numeric('confirmed_usage', { precision: 14, scale: 4 }).notNull().default('0'),
    adjustedUsage: numeric('adjusted_usage', { precision: 14, scale: 4 }).notNull().default('0'),
    remainingAmount: numeric('remaining_amount', { precision: 14, scale: 4 }).notNull().default('0'),
    currency: varchar('currency', { length: 3 }).notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('budget_usage_policy_idx').on(table.budgetPolicyId),
    index('budget_usage_period_idx').on(table.periodStart, table.periodEnd),
  ],
);

export const budgetOverrideEvents = pgTable(
  'budget_override_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetPolicyId: uuid('budget_policy_id')
      .notNull()
      .references(() => budgetPolicies.id, { onDelete: 'cascade' }),
    relatedCampaignId: uuid('related_campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    relatedMessageId: uuid('related_message_id').references(() => messages.id, { onDelete: 'set null' }),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    amountBefore: numeric('amount_before', { precision: 14, scale: 4 }),
    amountAfter: numeric('amount_after', { precision: 14, scale: 4 }),
    currency: varchar('currency', { length: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('budget_override_policy_idx').on(table.budgetPolicyId)],
);

// ---------- Reconciliation ----------

export const costReconciliationJobs = pgTable(
  'cost_reconciliation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceType: varchar('source_type', { length: 40 }).notNull().default('CSV'),
    originalFilename: varchar('original_filename', { length: 255 }),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    currency: varchar('currency', { length: 3 }),
    status: varchar('status', { length: 20 }).$type<CostReconciliationStatus>().notNull().default('UPLOADED'),
    totalRows: integer('total_rows').notNull().default(0),
    matchedRows: integer('matched_rows').notNull().default(0),
    unmatchedRows: integer('unmatched_rows').notNull().default(0),
    adjustedRows: integer('adjusted_rows').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('cost_reconciliation_status_idx').on(table.status),
    index('cost_reconciliation_created_idx').on(table.createdAt),
  ],
);

// ---------- Outcomes ----------

export const conversationOutcomes = pgTable(
  'conversation_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    outcome: varchar('outcome', { length: 30 }).$type<ConversationOutcome>().notNull(),
    revenueAmount: numeric('revenue_amount', { precision: 14, scale: 4 }),
    revenueCurrency: varchar('revenue_currency', { length: 3 }),
    notes: text('notes'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('conversation_outcomes_conversation_idx').on(table.conversationId),
    index('conversation_outcomes_campaign_idx').on(table.campaignId),
  ],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationAssignmentRow = typeof conversationAssignments.$inferSelect;
export type NewConversationAssignment = typeof conversationAssignments.$inferInsert;
export type InternalNoteRow = typeof internalNotes.$inferSelect;
export type NewInternalNote = typeof internalNotes.$inferInsert;
export type QuickReplyRow = typeof quickReplies.$inferSelect;
export type NewQuickReply = typeof quickReplies.$inferInsert;
export type MediaFileRow = typeof mediaFiles.$inferSelect;
export type NewMediaFile = typeof mediaFiles.$inferInsert;
export type CampaignRow = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type CampaignRecipientRow = typeof campaignRecipients.$inferSelect;
export type NewCampaignRecipient = typeof campaignRecipients.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessageStatusEventRow = typeof messageStatusEvents.$inferSelect;
export type NewMessageStatusEvent = typeof messageStatusEvents.$inferInsert;
export type ExportJobRow = typeof exportJobs.$inferSelect;
export type NewExportJob = typeof exportJobs.$inferInsert;
export type PricingRuleSetRow = typeof pricingRuleSets.$inferSelect;
export type NewPricingRuleSet = typeof pricingRuleSets.$inferInsert;
export type PricingRuleRow = typeof pricingRules.$inferSelect;
export type NewPricingRule = typeof pricingRules.$inferInsert;
export type MessageCostRow = typeof messageCosts.$inferSelect;
export type NewMessageCost = typeof messageCosts.$inferInsert;
export type MessageCostEventRow = typeof messageCostEvents.$inferSelect;
export type NewMessageCostEvent = typeof messageCostEvents.$inferInsert;
export type ConversationEntryWindowRow = typeof conversationEntryWindows.$inferSelect;
export type NewConversationEntryWindow = typeof conversationEntryWindows.$inferInsert;
export type BudgetPolicyRow = typeof budgetPolicies.$inferSelect;
export type NewBudgetPolicy = typeof budgetPolicies.$inferInsert;
export type BudgetUsageSnapshotRow = typeof budgetUsageSnapshots.$inferSelect;
export type NewBudgetUsageSnapshot = typeof budgetUsageSnapshots.$inferInsert;
export type BudgetOverrideEventRow = typeof budgetOverrideEvents.$inferSelect;
export type NewBudgetOverrideEvent = typeof budgetOverrideEvents.$inferInsert;
export type CostReconciliationJobRow = typeof costReconciliationJobs.$inferSelect;
export type NewCostReconciliationJob = typeof costReconciliationJobs.$inferInsert;
export type ConversationOutcomeRow = typeof conversationOutcomes.$inferSelect;
export type NewConversationOutcome = typeof conversationOutcomes.$inferInsert;

// ---------- Help Center ----------

export const helpCategories = pgTable(
  'help_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentCategoryId: uuid('parent_category_id').references((): AnyPgColumn => helpCategories.id, { onDelete: 'set null' }),
    nameAr: varchar('name_ar', { length: 160 }).notNull(),
    nameEn: varchar('name_en', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 180 }).notNull(),
    descriptionAr: text('description_ar'),
    descriptionEn: text('description_en'),
    icon: varchar('icon', { length: 60 }),
    sortOrder: integer('sort_order').notNull().default(0),
    status: varchar('status', { length: 20 }).$type<HelpCategoryStatus>().notNull().default('PUBLISHED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('help_categories_slug_idx').on(table.slug),
    index('help_categories_status_idx').on(table.status),
    index('help_categories_sort_idx').on(table.sortOrder),
  ],
);

export const helpArticles = pgTable(
  'help_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => helpCategories.id, { onDelete: 'cascade' }),
    titleAr: varchar('title_ar', { length: 220 }).notNull(),
    titleEn: varchar('title_en', { length: 220 }).notNull(),
    slug: varchar('slug', { length: 220 }).notNull(),
    summaryAr: text('summary_ar'),
    summaryEn: text('summary_en'),
    contentAr: text('content_ar'),
    contentEn: text('content_en'),
    status: varchar('status', { length: 20 }).$type<HelpArticleStatus>().notNull().default('DRAFT'),
    articleType: varchar('article_type', { length: 30 }).$type<HelpArticleType>().notNull().default('OVERVIEW'),
    difficulty: varchar('difficulty', { length: 20 }).$type<HelpArticleDifficulty>().notNull().default('BASIC'),
    estimatedReadingMinutes: integer('estimated_reading_minutes').notNull().default(3),
    allowedRoles: jsonb('allowed_roles').$type<Role[] | null>(),
    routePatterns: jsonb('route_patterns').$type<string[] | null>(),
    featureKey: varchar('feature_key', { length: 80 }),
    keywords: jsonb('keywords').$type<string[] | null>(),
    sortOrder: integer('sort_order').notNull().default(0),
    isFeatured: boolean('is_featured').notNull().default(false),
    isContextual: boolean('is_contextual').notNull().default(true),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('help_articles_slug_idx').on(table.slug),
    index('help_articles_category_idx').on(table.categoryId),
    index('help_articles_status_idx').on(table.status),
    index('help_articles_feature_key_idx').on(table.featureKey),
    index('help_articles_published_at_idx').on(table.publishedAt),
    index('help_articles_featured_idx').on(table.isFeatured),
  ],
);

export const helpArticleLinks = pgTable(
  'help_article_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceArticleId: uuid('source_article_id')
      .notNull()
      .references(() => helpArticles.id, { onDelete: 'cascade' }),
    targetArticleId: uuid('target_article_id')
      .notNull()
      .references(() => helpArticles.id, { onDelete: 'cascade' }),
    relationType: varchar('relation_type', { length: 20 }).$type<HelpLinkRelation>().notNull().default('RELATED'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('help_links_source_idx').on(table.sourceArticleId),
    index('help_links_target_idx').on(table.targetArticleId),
  ],
);

export const helpArticleFeedback = pgTable(
  'help_article_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    articleId: uuid('article_id')
      .notNull()
      .references(() => helpArticles.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    wasHelpful: boolean('was_helpful').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('help_feedback_article_idx').on(table.articleId),
    index('help_feedback_user_idx').on(table.userId),
  ],
);

export const helpArticleViews = pgTable(
  'help_article_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    articleId: uuid('article_id')
      .notNull()
      .references(() => helpArticles.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    route: varchar('route', { length: 255 }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('help_views_article_idx').on(table.articleId),
    index('help_views_viewed_at_idx').on(table.viewedAt),
  ],
);

export const helpChangeLogs = pgTable(
  'help_change_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    articleId: uuid('article_id')
      .notNull()
      .references(() => helpArticles.id, { onDelete: 'cascade' }),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    changeSummary: text('change_summary'),
    previousVersion: jsonb('previous_version').$type<Record<string, unknown> | null>(),
    newVersion: jsonb('new_version').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('help_change_logs_article_idx').on(table.articleId)],
);

export const helpSearchLogs = pgTable(
  'help_search_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    query: varchar('query', { length: 200 }).notNull(),
    language: varchar('language', { length: 2 }).notNull().default('ar'),
    resultCount: integer('result_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('help_search_logs_created_at_idx').on(table.createdAt)],
);

export const helpOnboardingSteps = pgTable(
  'help_onboarding_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stepKey: varchar('step_key', { length: 120 }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('help_onboarding_user_step_idx').on(table.userId, table.stepKey),
    index('help_onboarding_user_idx').on(table.userId),
  ],
);

export const helpOnboardingState = pgTable(
  'help_onboarding_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .unique(),
    hidden: boolean('hidden').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export type HelpCategoryRow = typeof helpCategories.$inferSelect;
export type NewHelpCategory = typeof helpCategories.$inferInsert;
export type HelpArticleRow = typeof helpArticles.$inferSelect;
export type NewHelpArticle = typeof helpArticles.$inferInsert;
export type HelpArticleLinkRow = typeof helpArticleLinks.$inferSelect;
export type NewHelpArticleLink = typeof helpArticleLinks.$inferInsert;
export type HelpArticleFeedbackRow = typeof helpArticleFeedback.$inferSelect;
export type NewHelpArticleFeedback = typeof helpArticleFeedback.$inferInsert;
export type HelpArticleViewRow = typeof helpArticleViews.$inferSelect;
export type NewHelpArticleView = typeof helpArticleViews.$inferInsert;
export type HelpChangeLogRow = typeof helpChangeLogs.$inferSelect;
export type NewHelpChangeLog = typeof helpChangeLogs.$inferInsert;
export type HelpSearchLogRow = typeof helpSearchLogs.$inferSelect;
export type NewHelpSearchLog = typeof helpSearchLogs.$inferInsert;
export type HelpOnboardingStepRow = typeof helpOnboardingSteps.$inferSelect;
export type NewHelpOnboardingStep = typeof helpOnboardingSteps.$inferInsert;
export type HelpOnboardingStateRow = typeof helpOnboardingState.$inferSelect;
export type NewHelpOnboardingState = typeof helpOnboardingState.$inferInsert;

// ---------- Email & Notifications ----------

export const emailLogs = pgTable(
  'email_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
    templateKey: varchar('template_key', { length: 80 }).notNull(),
    subject: varchar('subject', { length: 255 }),
    language: varchar('language', { length: 2 }).$type<Language>().notNull().default('ar'),
    status: varchar('status', { length: 20 }).$type<EmailLogStatus>().notNull().default('QUEUED'),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    relatedEntityType: varchar('related_entity_type', { length: 60 }),
    relatedEntityId: varchar('related_entity_id', { length: 100 }),
    triggerEvent: varchar('trigger_event', { length: 80 }),
    attemptCount: integer('attempt_count').notNull().default(0),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureCode: varchar('failure_code', { length: 60 }),
    failureMessage: text('failure_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('email_logs_idempotency_key_idx').on(table.idempotencyKey),
    index('email_logs_user_idx').on(table.userId),
    index('email_logs_status_idx').on(table.status),
    index('email_logs_queued_at_idx').on(table.queuedAt),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    requestedIp: varchar('requested_ip', { length: 64 }),
    requestedUserAgent: text('requested_user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('password_reset_tokens_user_idx').on(table.userId),
    index('password_reset_tokens_expires_idx').on(table.expiresAt),
  ],
);

export const passwordHistory = pgTable(
  'password_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('password_history_user_idx').on(table.userId)],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .unique(),
    emailSecurityAlerts: boolean('email_security_alerts').notNull().default(true),
    emailCampaignAlerts: boolean('email_campaign_alerts').notNull().default(true),
    emailIntegrationAlerts: boolean('email_integration_alerts').notNull().default(true),
    emailImportAlerts: boolean('email_import_alerts').notNull().default(true),
    emailManagementSummary: boolean('email_management_summary').notNull().default(true),
    inAppSecurityAlerts: boolean('in_app_security_alerts').notNull().default(true),
    inAppCampaignAlerts: boolean('in_app_campaign_alerts').notNull().default(true),
    inAppIntegrationAlerts: boolean('in_app_integration_alerts').notNull().default(true),
    inAppImportAlerts: boolean('in_app_import_alerts').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).$type<NotificationType>().notNull(),
    severity: varchar('severity', { length: 20 }).$type<NotificationSeverity>().notNull().default('INFO'),
    titleAr: varchar('title_ar', { length: 255 }).notNull(),
    titleEn: varchar('title_en', { length: 255 }).notNull(),
    messageAr: text('message_ar'),
    messageEn: text('message_en'),
    actionUrl: varchar('action_url', { length: 255 }),
    relatedEntityType: varchar('related_entity_type', { length: 60 }),
    relatedEntityId: varchar('related_entity_id', { length: 100 }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    index('notifications_user_idx').on(table.userId),
    index('notifications_user_read_idx').on(table.userId, table.readAt),
    index('notifications_created_at_idx').on(table.createdAt),
  ],
);

export type EmailLogRow = typeof emailLogs.$inferSelect;
export type NewEmailLog = typeof emailLogs.$inferInsert;
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type PasswordHistoryRow = typeof passwordHistory.$inferSelect;
export type NewPasswordHistory = typeof passwordHistory.$inferInsert;
export type NotificationPreferencesRow = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferences = typeof notificationPreferences.$inferInsert;
export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
