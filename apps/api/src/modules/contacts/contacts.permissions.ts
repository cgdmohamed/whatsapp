import { ForbiddenException } from '@nestjs/common';

import { ERROR_CODES } from '../../common/errors';
import type { Role } from '@wa/shared';

export type ContactCapability =
  | 'contact.view'
  | 'contact.create'
  | 'contact.edit'
  | 'contact.edit.phone'
  | 'contact.archive'
  | 'contact.restore'
  | 'contact.tags'
  | 'contact.lists'
  | 'contact.consent'
  | 'contact.consent.override'
  | 'contact.suppress'
  | 'contact.unsuppress'
  | 'contact.export'
  | 'list.manage'
  | 'tag.manage'
  | 'import.manage';

const CAPABILITY_ROLES: Record<ContactCapability, Role[]> = {
  'contact.view': ['ADMIN', 'MANAGER', 'AGENT'],
  'contact.create': ['ADMIN', 'MANAGER'],
  'contact.edit': ['ADMIN', 'MANAGER', 'AGENT'],
  'contact.edit.phone': ['ADMIN', 'MANAGER'],
  'contact.archive': ['ADMIN', 'MANAGER'],
  'contact.restore': ['ADMIN', 'MANAGER'],
  'contact.tags': ['ADMIN', 'MANAGER'],
  'contact.lists': ['ADMIN', 'MANAGER'],
  'contact.consent': ['ADMIN', 'MANAGER'],
  'contact.consent.override': ['ADMIN'],
  'contact.suppress': ['ADMIN', 'MANAGER'],
  'contact.unsuppress': ['ADMIN'],
  'contact.export': ['ADMIN', 'MANAGER', 'AGENT'],
  'list.manage': ['ADMIN', 'MANAGER'],
  'tag.manage': ['ADMIN', 'MANAGER'],
  'import.manage': ['ADMIN', 'MANAGER'],
};

export function can(role: Role, capability: ContactCapability): boolean {
  return CAPABILITY_ROLES[capability].includes(role);
}

export function assertCan(role: Role, capability: ContactCapability): void {
  if (!can(role, capability)) {
    throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
  }
}

// Fields an AGENT is allowed to update on a contact directly.
export const AGENT_EDITABLE_FIELDS = [
  'firstName',
  'lastName',
  'displayName',
  'email',
  'company',
  'language',
  'customFields',
] as const;
