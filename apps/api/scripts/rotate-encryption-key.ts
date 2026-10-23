/**
 * Re-encrypts every confidential field with the current ENCRYPTION_KEY.
 *
 * Rotating the key:
 *  1. Create a new key: `openssl rand -base64 32`.
 *  2. Set ENCRYPTION_KEY to the new key and move the old one into ENCRYPTION_PREVIOUS_KEYS
 *     (comma-separated; keys written as `id:base64` keep their id). Restart the server: it
 *     reads values under either key and writes new ones under the new key.
 *  3. Run `bun run db:rotate-key` with the same environment. Every value written with an older
 *     key is rewritten under the new one, in one transaction.
 *  4. Remove the old key from ENCRYPTION_PREVIOUS_KEYS and restart.
 *
 * It is safe to run while the server is up (SQLite serialises the writes) and to run again.
 */
import { loadConfig } from '../src/config';
import { openDatabase } from '../src/db/client';
import { reencryptColumns } from '../src/db/encrypted';
import { prepareDatabaseSecurity } from '../src/services/security-startup';

const config = loadConfig();
const database = openDatabase(config.databasePath);
try {
  const { keyring } = prepareDatabaseSecurity(database.db, config);
  const rewritten = reencryptColumns(database.db, keyring);
  const total = Object.values(rewritten).reduce((sum, count) => sum + count, 0);
  for (const [column, count] of Object.entries(rewritten)) {
    console.log(`${column}: ${count} value${count === 1 ? '' : 's'} re-encrypted`);
  }
  console.log(
    total === 0
      ? `Every value is already encrypted with key ${keyring.current.id}.`
      : `Done: ${total} value${total === 1 ? '' : 's'} now use key ${keyring.current.id}. ` +
          'Older keys can be removed from ENCRYPTION_PREVIOUS_KEYS.',
  );
} catch (error) {
  console.error(`Rotation failed, nothing was changed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  database.close();
}
