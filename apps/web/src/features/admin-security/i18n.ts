import { defineDictionary } from '@/lib/i18n/define';
import { auditMessages } from './i18n/audit';
import { churchMessages } from './i18n/church';
import { errorMessages } from './i18n/errors';
import { membersMessages } from './i18n/members';
import { rolesMessages } from './i18n/roles';
import { settingsMessages } from './i18n/settings';

/**
 * The module dictionary: church settings, members, roles, the audit log and security. Each
 * screen keeps its messages in `i18n/<part>.ts` (English and Indonesian side by side); they
 * are merged under one namespace here.
 */
export const adminSecurityDictionary = defineDictionary('admin-security', {
  en: {
    nav: 'Security & access',
    description: 'Roles and permissions, audit log, two-factor sign-in and the security policy.',
    ...settingsMessages.en,
    ...membersMessages.en,
    ...rolesMessages.en,
    ...churchMessages.en,
    ...auditMessages.en,
    ...errorMessages.en,
  },
  id: {
    nav: 'Keamanan & akses',
    description: 'Peran dan hak akses, log audit, verifikasi dua langkah, dan kebijakan keamanan.',
    ...settingsMessages.id,
    ...membersMessages.id,
    ...rolesMessages.id,
    ...churchMessages.id,
    ...auditMessages.id,
    ...errorMessages.id,
  },
});
