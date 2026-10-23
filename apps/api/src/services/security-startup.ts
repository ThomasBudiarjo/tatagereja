import { and, eq, isNull } from 'drizzle-orm';
import type { AppConfig } from '../config';
import type { Queryable } from '../db/client';
import { assertEncryptionKeysAvailable, encryptPlaintextColumns } from '../db/encrypted';
import { sessions } from '../db/schema';
import { loadKeyring, useKeyring, type Keyring } from '../lib/crypto';
import { hashLegacyInvitationTokens } from './invitations';

export type SecurityStartup = {
  keyring: Keyring;
  /** Values encrypted by this start, by `table.column` (empty once everything is encrypted). */
  encrypted: Record<string, number>;
  hashedInvitations: number;
  endedLegacySessions: number;
};

/**
 * Brings stored credentials up to the current rules before the server answers anything. Every
 * step only touches rows that still need it, so it runs at every start:
 *
 *  1. loads the encryption keyring and refuses to start when stored values need a missing key;
 *  2. encrypts confidential columns written in plain text (and older two-factor secrets);
 *  3. hashes invitation tokens stored in plain text;
 *  4. ends bearer sessions from before refresh tokens (their long-lived token is retired).
 */
export function prepareDatabaseSecurity(
  db: Queryable,
  config: Pick<
    AppConfig,
    'databasePath' | 'encryptionKey' | 'previousEncryptionKeys' | 'legacyTwoFactorKey'
  >,
): SecurityStartup {
  const keyring = loadKeyring(config);
  useKeyring(keyring);
  assertEncryptionKeysAvailable(db, keyring);
  const encrypted = encryptPlaintextColumns(db, keyring);
  const hashedInvitations = db.transaction((tx) => hashLegacyInvitationTokens(tx));
  const endedLegacySessions = db
    .delete(sessions)
    .where(and(eq(sessions.transport, 'bearer'), isNull(sessions.refreshTokenHash)))
    .returning({ id: sessions.id })
    .all().length;
  return { keyring, encrypted, hashedInvitations, endedLegacySessions };
}
