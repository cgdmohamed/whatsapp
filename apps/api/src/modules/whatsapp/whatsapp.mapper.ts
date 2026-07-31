import type { WhatsAppAccountDto, WhatsAppPhoneNumberDto } from '@wa/shared';

import type { WhatsAppAccountRow, WhatsAppPhoneNumberRow } from '../../db/schema';

function toIso(value: Date): string;
function toIso(value: Date | null): string | null;
function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function toWhatsAppAccountDto(account: WhatsAppAccountRow): WhatsAppAccountDto {
  return {
    id: account.id,
    name: account.name,
    metaBusinessAccountId: account.metaBusinessAccountId,
    wabaId: account.wabaId,
    appId: account.appId,
    accessTokenLastFour: account.accessTokenLastFour,
    tokenUpdatedAt: toIso(account.tokenUpdatedAt),
    status: account.status,
    lastConnectionTestAt: toIso(account.lastConnectionTestAt),
    lastConnectionError: account.lastConnectionError,
    createdAt: toIso(account.createdAt),
    updatedAt: toIso(account.updatedAt),
  };
}

function toQualityRating(value: string | null): WhatsAppPhoneNumberDto['qualityRating'] {
  if (value === null) {
    return null;
  }
  const normalized = value.toUpperCase();
  if (normalized === 'GREEN' || normalized === 'YELLOW' || normalized === 'RED' || normalized === 'UNKNOWN') {
    return normalized;
  }
  return 'UNKNOWN';
}

export function toWhatsAppPhoneNumberDto(phoneNumber: WhatsAppPhoneNumberRow): WhatsAppPhoneNumberDto {
  return {
    id: phoneNumber.id,
    whatsappAccountId: phoneNumber.whatsappAccountId,
    phoneNumberId: phoneNumber.phoneNumberId,
    displayPhoneNumber: phoneNumber.displayPhoneNumber,
    verifiedName: phoneNumber.verifiedName,
    qualityRating: toQualityRating(phoneNumber.qualityRating),
    messagingLimitTier: phoneNumber.messagingLimitTier,
    status: phoneNumber.status,
    isDefault: phoneNumber.isDefault,
    lastSyncedAt: toIso(phoneNumber.lastSyncedAt),
    createdAt: toIso(phoneNumber.createdAt),
    updatedAt: toIso(phoneNumber.updatedAt),
  };
}
