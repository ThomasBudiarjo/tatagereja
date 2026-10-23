export const fullName = (person: { firstName: string; lastName: string | null }): string =>
  [person.firstName, person.lastName].filter(Boolean).join(' ');

/** Titles that come before a name in Indonesian churches ("Pdt. Imanuel", "Pnt. Bonar"). */
const NAME_TITLES = /^(pdt|pnt|dkn|ev|em|bpk|bapak|ibu|ny|nn|sdr|sdri|dr|drs|ir|prof|st|br)\.?$/i;

/** The name to greet someone with: their first name, skipping titles such as "Pdt." or "Pnt.". */
export const callName = (name: string): string => {
  const words = name.trim().split(/\s+/);
  return words.find((word) => !NAME_TITLES.test(word)) ?? words[0] ?? '';
};

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
