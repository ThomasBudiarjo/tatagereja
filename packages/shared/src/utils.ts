export const fullName = (person: { firstName: string; lastName: string | null }): string =>
  [person.firstName, person.lastName].filter(Boolean).join(' ');

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';

export const invitationStatusOf = (invitation: {
  revokedAt: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
}): 'active' | 'expired' | 'exhausted' | 'revoked' => {
  if (invitation.revokedAt) return 'revoked';
  if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() <= Date.now())
    return 'expired';
  if (invitation.maxUses !== null && invitation.useCount >= invitation.maxUses) return 'exhausted';
  return 'active';
};
