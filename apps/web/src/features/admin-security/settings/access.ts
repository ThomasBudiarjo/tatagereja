import type { AccessRule } from '@/lib/modules';

/**
 * Who may open each church settings section. Kept apart from the screens so the module
 * manifest can use it without loading them; the API still checks every request.
 */
export const SECTION_ACCESS = {
  members: { anyOf: ['members.view', 'members.manage'] },
  roles: { anyOf: ['roles.manage', 'members.view', 'members.manage'] },
  invitations: { anyOf: ['invitations.manage'] },
  modules: { anyOf: ['settings.manage'] },
  security: { anyOf: ['security.view', 'security.manage', 'backup.export'] },
  audit: { anyOf: ['audit.view'] },
} satisfies Record<string, AccessRule>;
