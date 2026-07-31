import type {
  ContactDetailDto,
  ContactDto,
  ContactListSummaryDto,
  OptInRecordDto,
  SuppressionEntryDto,
  TagSummaryDto,
} from '@wa/shared';
import type {
  ContactListRow,
  ContactRow,
  OptInRecordRow,
  SuppressionEntryRow,
  TagRow,
} from '../../db/schema';

export interface EnrichedContact {
  contact: ContactRow;
  tags: TagRow[];
  optInStatus: 'OPTED_IN' | 'OPTED_OUT' | 'UNKNOWN';
  suppressed: boolean;
}

export function toTagSummary(tag: TagRow): TagSummaryDto {
  return { id: tag.id, name: tag.name, slug: tag.slug };
}

export function toListSummary(list: ContactListRow): ContactListSummaryDto {
  return { id: list.id, name: list.name, type: list.type };
}

export function toOptInRecordDto(row: OptInRecordRow): OptInRecordDto {
  return {
    id: row.id,
    contactId: row.contactId,
    status: row.status,
    source: row.source,
    consentText: row.consentText,
    allowedCategories: row.allowedCategories,
    proofReference: row.proofReference,
    obtainedAt: row.obtainedAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdByUserId: row.createdByUserId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toSuppressionEntryDto(row: SuppressionEntryRow): SuppressionEntryDto {
  return {
    id: row.id,
    contactId: row.contactId ?? null,
    phoneE164: row.phoneE164,
    reason: row.reason,
    source: row.source,
    createdByUserId: row.createdByUserId ?? null,
    createdAt: row.createdAt.toISOString(),
    removedAt: row.removedAt ? row.removedAt.toISOString() : null,
    removedByUserId: row.removedByUserId ?? null,
  };
}

export function toContactDto(enriched: EnrichedContact): ContactDto {
  const { contact, tags, optInStatus, suppressed } = enriched;
  return {
    id: contact.id,
    phoneE164: contact.phoneE164,
    phoneCountry: contact.phoneCountry,
    firstName: contact.firstName,
    lastName: contact.lastName,
    displayName: contact.displayName,
    email: contact.email,
    company: contact.company,
    language: contact.language,
    status: contact.status,
    source: contact.source,
    customFields: contact.customFields,
    lastInboundMessageAt: contact.lastInboundMessageAt ? contact.lastInboundMessageAt.toISOString() : null,
    lastOutboundMessageAt: contact.lastOutboundMessageAt ? contact.lastOutboundMessageAt.toISOString() : null,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
    archivedAt: contact.archivedAt ? contact.archivedAt.toISOString() : null,
    tags: tags.map(toTagSummary),
    optInStatus,
    suppressed,
  };
}

export function contactDisplayName(contact: Pick<ContactRow, 'firstName' | 'lastName' | 'displayName'>): string {
  const parts = [contact.firstName, contact.lastName].filter((part): part is string => Boolean(part));
  return (contact.displayName ?? parts.join(' ').trim()) || '';
}

export function toContactDetailDto(
  base: ContactDto,
  lists: ContactListRow[],
  consentHistory: OptInRecordRow[],
  suppressionEntries: SuppressionEntryRow[],
  importHistory: ContactDetailDto['importHistory'],
  auditEvents: ContactDetailDto['auditEvents'],
): ContactDetailDto {
  return {
    ...base,
    lists: lists.map(toListSummary),
    consentHistory: consentHistory.map(toOptInRecordDto),
    suppressionEntries: suppressionEntries.map(toSuppressionEntryDto),
    importHistory,
    auditEvents,
  };
}
