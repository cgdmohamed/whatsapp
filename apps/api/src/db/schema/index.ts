import {
  boolean,
  index,
  integer,
  jsonb,
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
} from '@wa/shared';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).$type<Role>().notNull().default('AGENT'),
  status: varchar('status', { length: 20 }).$type<UserStatus>().notNull().default('ACTIVE'),
  preferredLanguage: varchar('preferred_language', { length: 2 }).$type<Language>().notNull().default('ar'),
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
    status: varchar('status', { length: 20 }).$type<ConversationStatus>().notNull().default('OPEN'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('conversations_contact_idx').on(table.contactId),
    index('conversations_status_idx').on(table.status),
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

export type ConversationRow = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type CampaignRow = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type CampaignRecipientRow = typeof campaignRecipients.$inferSelect;
export type NewCampaignRecipient = typeof campaignRecipients.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessageStatusEventRow = typeof messageStatusEvents.$inferSelect;
export type NewMessageStatusEvent = typeof messageStatusEvents.$inferInsert;
