import { Role, Language } from '@wa/shared';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  preferredLanguage: Language;
}
