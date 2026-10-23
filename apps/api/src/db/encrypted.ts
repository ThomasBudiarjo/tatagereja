import { sql } from 'drizzle-orm';
import { customType } from 'drizzle-orm/sqlite-core';
import {
  ENCRYPTED_PREFIX,
  activeKeyring,
  decryptLegacySecret,
  decryptValue,
  encryptValue,
  keyIdOf,
  type Keyring,
} from '../lib/crypto';
import type { Queryable } from './client';

/** Every encrypted column, registered when the schema is defined. */
export const ENCRYPTED_COLUMNS: { table: string; column: string }[] = [];

/**
 * A text column stored encrypted with the server keyring (see lib/crypto.ts). Reads and writes
 * through Drizzle see the plain value; the database file, backups of it and raw SQL see only
 * ciphertext. Never filter or sort on it: equal values encrypt differently every time.
 */
export const encryptedText = (table: string, column: string) => {
  ENCRYPTED_COLUMNS.push({ table, column });
  const purpose = `${table}.${column}`;
  return customType<{ data: string; driverData: string }>({
    dataType: () => 'text',
    toDriver: (value) => encryptValue(activeKeyring(), purpose, value),
    fromDriver: (value) => decryptValue(activeKeyring(), purpose, value),
  })(column);
};

type StoredValue = { id: number; value: string };

const storedValues = (db: Queryable, table: string, column: string, where: ReturnType<typeof sql>) =>
  db.all<StoredValue>(
    sql`select rowid as id, ${sql.identifier(column)} as value from ${sql.identifier(table)} where ${sql.identifier(column)} is not null and ${where}`,
  );

const writeValue = (db: Queryable, table: string, column: string, row: StoredValue, value: string) =>
  db.run(
    sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${value} where rowid = ${row.id}`,
  );

const notEncrypted = (column: string) =>
  sql`${sql.identifier(column)} not like ${`${ENCRYPTED_PREFIX}%`}`;

/**
 * Refuses to start when stored values were written with a key the keyring does not hold: the
 * server would otherwise fail on the first read of each of them.
 */
export function assertEncryptionKeysAvailable(db: Queryable, keyring: Keyring): void {
  const known = [...keyring.keys.keys()];
  for (const { table, column } of ENCRYPTED_COLUMNS) {
    const conditions = known.map(
      (id) => sql`${sql.identifier(column)} not like ${`${ENCRYPTED_PREFIX}${id}:%`}`,
    );
    const unknown = storedValues(
      db,
      table,
      column,
      sql.join([sql`${sql.identifier(column)} like ${`${ENCRYPTED_PREFIX}%`}`, ...conditions], sql` and `),
    )[0];
    if (unknown) {
      throw new Error(
        `${table}.${column} holds values encrypted with key "${keyIdOf(unknown.value)}", which is not configured. ` +
          'Set ENCRYPTION_KEY to that key, or list it in ENCRYPTION_PREVIOUS_KEYS.',
      );
    }
  }
}

/**
 * Encrypts values written before their column was encrypted, and moves two-factor secrets from
 * their earlier format. Runs at every start and only touches values that need it, so it is
 * idempotent. Returns how many values it rewrote, by column.
 */
export function encryptPlaintextColumns(db: Queryable, keyring: Keyring): Record<string, number> {
  const rewritten: Record<string, number> = {};
  db.transaction((tx) => {
    for (const { table, column } of ENCRYPTED_COLUMNS) {
      const purpose = `${table}.${column}`;
      let count = 0;
      for (const row of storedValues(tx, table, column, notEncrypted(column))) {
        let plain: string | null = row.value;
        if (table === 'user_two_factor' && row.value.startsWith('v1:')) {
          plain = decryptLegacySecret(keyring, row.value);
          // A secret whose old key is gone stays as it is; its codes cannot be checked either way.
          if (plain === null) continue;
        }
        writeValue(tx, table, column, row, encryptValue(keyring, purpose, plain));
        count += 1;
      }
      if (count > 0) rewritten[purpose] = count;
    }
  });
  return rewritten;
}

/**
 * Re-encrypts every value written with an older key under the current one (the rotate
 * script). Afterwards the older keys can be removed from ENCRYPTION_PREVIOUS_KEYS.
 */
export function reencryptColumns(db: Queryable, keyring: Keyring): Record<string, number> {
  const rewritten: Record<string, number> = {};
  db.transaction((tx) => {
    for (const { table, column } of ENCRYPTED_COLUMNS) {
      const purpose = `${table}.${column}`;
      let count = 0;
      const stale = storedValues(
        tx,
        table,
        column,
        sql`${sql.identifier(column)} like ${`${ENCRYPTED_PREFIX}%`} and ${sql.identifier(column)} not like ${`${ENCRYPTED_PREFIX}${keyring.current.id}:%`}`,
      );
      for (const row of stale) {
        const plain = decryptValue(keyring, purpose, row.value);
        writeValue(tx, table, column, row, encryptValue(keyring, purpose, plain));
        count += 1;
      }
      if (count > 0) rewritten[purpose] = count;
    }
  });
  return rewritten;
}
