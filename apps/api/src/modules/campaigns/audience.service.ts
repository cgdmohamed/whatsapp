import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, exists, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type {
  AudienceFilter,
  AudienceSelection,
  AudienceSnapshotContact,
  EligibilityReason,
  PreflightBreakdown,
  PreflightReport,
  TemplateComponent,
  VariableMapping,
} from '@wa/shared';
import { ELIGIBILITY_REASONS } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import {
  contactListMembers,
  contactTags,
  contacts,
  optInRecords,
  suppressionEntries,
  type ContactRow,
} from '../../db/schema';
import { normalizePhone } from '../contacts/phone/phone-normalizer';

export interface ResolvedVariable {
  name: string;
  value: string | null;
  missing: boolean;
}

export interface ResolvedRecipient {
  contact: AudienceSnapshotContact;
  variables: ResolvedVariable[];
  eligible: boolean;
  reason: EligibilityReason;
}

export interface AudienceResolution {
  snapshot: AudienceSnapshotContact[];
  recipients: ResolvedRecipient[];
  seenPhones: Set<string>;
}

function toSnapshot(contact: ContactRow): AudienceSnapshotContact {
  return {
    id: contact.id,
    phoneE164: contact.phoneE164,
    firstName: contact.firstName ?? null,
    lastName: contact.lastName ?? null,
    displayName: contact.displayName ?? null,
    company: contact.company ?? null,
    email: contact.email ?? null,
    language: contact.language ?? null,
    status: contact.status ?? null,
    customFields: contact.customFields ?? null,
  };
}

@Injectable()
export class AudienceService {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async resolveSelection(selection: AudienceSelection): Promise<ContactRow[]> {
    let contactIds: string[] | null = null;

    if (selection.type === 'LISTS') {
      const listIds = selection.listIds ?? [];
      if (listIds.length === 0) {
        return [];
      }
      const memberRows = await this.db
        .select({ contactId: contactListMembers.contactId })
        .from(contactListMembers)
        .where(inArray(contactListMembers.contactListId, listIds));
      contactIds = [...new Set(memberRows.map((row) => row.contactId))];
    } else if (selection.type === 'TAGS') {
      const tagIds = selection.tagIds ?? [];
      if (tagIds.length === 0) {
        return [];
      }
      const tagRows = await this.db
        .select({ contactId: contactTags.contactId })
        .from(contactTags)
        .where(inArray(contactTags.tagId, tagIds));
      contactIds = [...new Set(tagRows.map((row) => row.contactId))];
    } else if (selection.type === 'CONTACTS') {
      contactIds = selection.contactIds ?? [];
    }

    if (contactIds !== null) {
      if (contactIds.length === 0) {
        return [];
      }
      // Deduplicate while preserving order.
      return this.fetchContactsByIds(contactIds);
    }

    // FILTER path: apply basic contact filters via a query builder.
    return this.fetchContactsByFilter(selection);
  }

  private async fetchContactsByIds(ids: string[]): Promise<ContactRow[]> {
    const rows = await this.db
      .select()
      .from(contacts)
      .where(inArray(contacts.id, ids))
      .orderBy(asc(contacts.createdAt));
    const seen = new Set<string>();
    return rows.filter((row) => {
      if (seen.has(row.id)) {
        return false;
      }
      seen.add(row.id);
      return true;
    });
  }

  private async fetchContactsByFilter(selection: AudienceSelection): Promise<ContactRow[]> {
    const filters = selection.filters;
    const conditions: SQL[] = [isNull(contacts.archivedAt)];
    if (filters?.status) {
      conditions.push(eq(contacts.status, filters.status));
    } else {
      conditions.push(sql `${contacts.status} <> 'ARCHIVED'`);
    }
    if (filters?.language) {
      conditions.push(eq(contacts.language, filters.language));
    }
    if (filters?.country) {
      conditions.push(eq(contacts.phoneCountry, filters.country));
    }
    if (filters?.optInStatus) {
      conditions.push(this.optInStatusCondition(filters.optInStatus));
    }
    if (filters?.suppressed === 'yes') {
      conditions.push(this.activeSuppressionCondition());
    } else if (filters?.suppressed === 'no') {
      conditions.push(sql`NOT (${this.activeSuppressionCondition()})`);
    }

    return this.db.select().from(contacts).where(and(...conditions)).orderBy(asc(contacts.createdAt)).limit(200000);
  }

  buildSnapshot(rows: ContactRow[]): AudienceSnapshotContact[] {
    return rows.map(toSnapshot);
  }

  resolveVariable(
    contact: AudienceSnapshotContact,
    mapping: VariableMapping,
  ): ResolvedVariable {
    let value: string | null = null;
    switch (mapping.source) {
      case 'FIRST_NAME':
        value = contact.firstName ?? null;
        break;
      case 'LAST_NAME':
        value = contact.lastName ?? null;
        break;
      case 'DISPLAY_NAME':
        value = contact.displayName ?? null;
        break;
      case 'COMPANY':
        value = contact.company ?? null;
        break;
      case 'PHONE':
        value = contact.phoneE164 ?? null;
        break;
      case 'EMAIL':
        value = contact.email ?? null;
        break;
      case 'CUSTOM_FIELD':
        value = contact.customFields && mapping.customFieldKey
          ? contact.customFields[mapping.customFieldKey] ?? null
          : null;
        break;
      case 'STATIC':
        value = mapping.staticText ?? null;
        break;
    }
    const resolved = value && value.trim().length > 0 ? value : mapping.fallback ?? null;
    return {
      name: mapping.variableName,
      value: resolved,
      missing: resolved === null || resolved.trim().length === 0,
    };
  }

  async resolveRecipient(
    contact: AudienceSnapshotContact,
    variables: VariableMapping[],
    templateVarNames: string[],
    defaultCountry: string,
  ): Promise<ResolvedRecipient> {
    const phoneResult = normalizePhone(contact.phoneE164, defaultCountry);

    if (!phoneResult.ok) {
      return { contact, variables: [], eligible: false, reason: 'INVALID_PHONE' };
    }
    if (contact.status === 'ARCHIVED') {
      return { contact, variables: [], eligible: false, reason: 'ARCHIVED' };
    }

    // Build variable values for each template variable in template order.
    const mappingByName = new Map(variables.map((mapping) => [mapping.variableName, mapping]));
    const resolved: ResolvedVariable[] = [];
    let missingVariable = false;
    for (const name of templateVarNames) {
      const mapping = mappingByName.get(name);
      if (!mapping) {
        resolved.push({ name, value: null, missing: true });
        missingVariable = true;
        continue;
      }
      const result = this.resolveVariable(contact, mapping);
      resolved.push(result);
      if (result.missing) {
        missingVariable = true;
      }
    }

    // Eligibility checks ordered per spec.
    const reason = await this.determineEligibility(contact, missingVariable);
    return {
      contact,
      variables: resolved,
      eligible: reason === 'ELIGIBLE',
      reason,
    };
  }

  private async determineEligibility(
    contact: AudienceSnapshotContact,
    missingVariable: boolean,
  ): Promise<EligibilityReason> {
    if (missingVariable) {
      return 'MISSING_VARIABLE';
    }

    const [suppressionRow] = await this.db
      .select({ id: suppressionEntries.id })
      .from(suppressionEntries)
      .where(
        and(
          eq(suppressionEntries.contactId, contact.id),
          isNull(suppressionEntries.removedAt),
        ),
      )
      .limit(1);
    if (suppressionRow) {
      return 'SUPPRESSED';
    }

    const [latestOptIn] = await this.db
      .select()
      .from(optInRecords)
      .where(eq(optInRecords.contactId, contact.id))
      .orderBy(sql `${optInRecords.obtainedAt} desc, ${optInRecords.createdAt} desc`)
      .limit(1);
    if (!latestOptIn || latestOptIn.status === 'UNKNOWN') {
      return 'UNKNOWN_CONSENT';
    }
    if (latestOptIn.status === 'OPTED_OUT') {
      return 'OPTED_OUT';
    }
    return 'ELIGIBLE';
  }

  async resolveAudience(
    selection: AudienceSelection,
    variableMapping: VariableMapping[],
    templateVarNames: string[],
    defaultCountry: string,
  ): Promise<AudienceResolution> {
    const rows = await this.resolveSelection(selection);
    return this.resolveFromRows(rows, variableMapping, templateVarNames, defaultCountry);
  }

  async resolveFromSnapshot(
    snapshot: AudienceSnapshotContact[],
    variableMapping: VariableMapping[],
    templateVarNames: string[],
    defaultCountry: string,
  ): Promise<AudienceResolution> {
    return this.resolveFromRows(
      snapshot as unknown as ContactRow[],
      variableMapping,
      templateVarNames,
      defaultCountry,
    );
  }

  private async resolveFromRows(
    rows: ContactRow[],
    variableMapping: VariableMapping[],
    templateVarNames: string[],
    defaultCountry: string,
  ): Promise<AudienceResolution> {
    const snapshot = this.buildSnapshot(rows);
    const recipients: ResolvedRecipient[] = [];
    const seenPhones = new Set<string>();
    for (const contact of snapshot) {
      const recipient = await this.resolveRecipient(contact, variableMapping, templateVarNames, defaultCountry);
      recipients.push(recipient);
      seenPhones.add(contact.phoneE164);
    }
    return { snapshot, recipients, seenPhones };
  }

  buildPreflightReport(
    campaignId: string | null,
    recipients: ResolvedRecipient[],
    checks: PreflightReport['checks'],
    errors: string[],
  ): PreflightReport {
    const breakdown: PreflightBreakdown = {
      totalSelected: recipients.length,
      eligible: 0,
      invalidPhone: 0,
      unknownConsent: 0,
      optedOut: 0,
      suppressed: 0,
      missingVariable: 0,
      duplicate: 0,
      archived: 0,
      other: 0,
    };
    const blockedCount = new Map<EligibilityReason, number>();
    for (const reason of ELIGIBILITY_REASONS) {
      blockedCount.set(reason, 0);
    }

    const seenPhones = new Set<string>();
    for (const recipient of recipients) {
      if (recipient.contact.status === 'ARCHIVED') {
        breakdown.archived += 1;
        blockedCount.set('ARCHIVED', (blockedCount.get('ARCHIVED') ?? 0) + 1);
        continue;
      }
      if (seenPhones.has(recipient.contact.phoneE164)) {
        breakdown.duplicate += 1;
        blockedCount.set('DUPLICATE', (blockedCount.get('DUPLICATE') ?? 0) + 1);
        continue;
      }
      seenPhones.add(recipient.contact.phoneE164);

      if (recipient.eligible) {
        breakdown.eligible += 1;
        blockedCount.set('ELIGIBLE', (blockedCount.get('ELIGIBLE') ?? 0) + 1);
      } else {
        switch (recipient.reason) {
          case 'INVALID_PHONE':
            breakdown.invalidPhone += 1;
            break;
          case 'UNKNOWN_CONSENT':
            breakdown.unknownConsent += 1;
            break;
          case 'OPTED_OUT':
            breakdown.optedOut += 1;
            break;
          case 'SUPPRESSED':
            breakdown.suppressed += 1;
            break;
          case 'MISSING_VARIABLE':
            breakdown.missingVariable += 1;
            break;
          default:
            breakdown.other += 1;
            break;
        }
        blockedCount.set(recipient.reason, (blockedCount.get(recipient.reason) ?? 0) + 1);
      }
    }

    const invalidReasons = errors.length === 0 && breakdown.eligible === 0 ? ['CAMPAIGN_NO_ELIGIBLE_RECIPIENTS'] : [];
    return {
      campaignId,
      valid: errors.length === 0 && breakdown.eligible > 0 && checks.accountConnected && checks.phoneNumberActive && checks.templateApproved && checks.templateStatusUnchanged && checks.templateLanguageMatches && checks.sendingLimitsConfigured,
      checks,
      breakdown,
      blockedReasons: Array.from(blockedCount.entries())
        .filter(([, count]) => count > 0)
        .map(([reason, count]) => ({ reason, count })),
      errors: [...errors, ...invalidReasons],
      generatedAt: new Date().toISOString(),
    };
  }

  private optInStatusCondition(status: AudienceFilter['optInStatus']): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(optInRecords)
        .where(
          and(
            eq(optInRecords.contactId, contacts.id),
            eq(optInRecords.status, status as never),
            sql`${optInRecords.obtainedAt} = (select max(o.obtained_at) from opt_in_records o where o.contact_id = ${contacts.id})`,
          ),
        ),
    );
  }

  private activeSuppressionCondition(): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(suppressionEntries)
        .where(and(eq(suppressionEntries.contactId, contacts.id), isNull(suppressionEntries.removedAt))),
    );
  }
}

export function collectTemplateVariableNames(components: TemplateComponent[] | null | undefined): string[] {
  if (!components) {
    return [];
  }
  const ordered = [...components].sort((a, b) => {
    const priority: Record<string, number> = { HEADER: 0, BODY: 1, FOOTER: 2, BUTTONS: 3 };
    return (priority[a.type] ?? 9) - (priority[b.type] ?? 9);
  });
  const names: string[] = [];
  for (const component of ordered) {
    for (const variable of component.variables) {
      names.push(variable.name);
    }
    if (component.buttons) {
      for (const button of component.buttons) {
        if (button.url) {
          for (const match of button.url.matchAll(/\{\{(\d+)\}\}/g)) {
            names.push(`{{${match[1]}}}`);
          }
        }
      }
    }
  }
  return [...new Set(names)];
}