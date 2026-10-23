import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/*
 * Field encryption at rest (AES-256-GCM) for secrets and confidential text: TOTP secrets,
 * national ID numbers, medical and private notes, pastoral care notes and check-in alerts.
 *
 * A stored value looks like `enc1:<key id>:<base64url(iv | tag | ciphertext)>`. The key id
 * names the key that wrote it, so a new `ENCRYPTION_KEY` can be introduced while the previous
 * one still reads older values (`ENCRYPTION_PREVIOUS_KEYS`), and the rotate script rewrites them.
 * Each column authenticates its own name as additional data, so a ciphertext copied into another
 * column does not decrypt. Columns are declared with `encryptedText` in the schema and
 * encrypted and decrypted by Drizzle on every write and read; searchable fields (names) are
 * never encrypted.
 */

export const ENCRYPTED_PREFIX = 'enc1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const KEY_ID = /^[a-z0-9]{1,16}$/;

export type EncryptionKey = { id: string; key: Buffer };

export type Keyring = {
  /** The key every new value is written with. */
  current: EncryptionKey;
  /** Every key that may read a value, by id (the current one included). */
  keys: Map<string, Buffer>;
  /** Keys of the two-factor format that came before (`v1:<payload>`), for the migration. */
  legacy: Buffer[];
  /** Where the current key came from, for the startup message. */
  source: 'env' | 'file' | 'memory';
};

/** A short id for a key without an explicit one: part of a hash of it, never the key itself. */
export const keyFingerprint = (key: Buffer): string =>
  createHash('sha256').update('tatagereja-key-id').update(key).digest('hex').slice(0, 8);

/**
 * Parses `ENCRYPTION_KEY`-style text: 32 random bytes in base64, base64url or hex, optionally
 * preceded by an id (`2026a:BASE64`). Throws a message fit for the startup error.
 */
export function parseEncryptionKey(text: string, name = 'ENCRYPTION_KEY'): EncryptionKey {
  const value = text.trim();
  const separator = value.indexOf(':');
  const id = separator > 0 ? value.slice(0, separator).toLowerCase() : null;
  const material = separator > 0 ? value.slice(separator + 1) : value;
  if (id !== null && !KEY_ID.test(id)) {
    throw new Error(`${name}: the key id before ":" may only use a-z and 0-9 (at most 16)`);
  }
  let key: Buffer | null = null;
  if (/^[0-9a-f]{64}$/i.test(material)) key = Buffer.from(material, 'hex');
  else if (/^[A-Za-z0-9+/_-]{43}=?$/.test(material)) {
    key = Buffer.from(material.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  }
  if (!key || key.length !== KEY_BYTES) {
    throw new Error(
      `${name} must be 32 random bytes in base64 or hex (create one with: openssl rand -base64 32)`,
    );
  }
  return { id: id ?? keyFingerprint(key), key };
}

const deriveLegacyKey = (material: string): Buffer =>
  createHash('sha256').update(material).digest();

/** Reads a key file next to the database, creating it (mode 0600) the first time. */
function keyFile(databasePath: string, name: string): string {
  const directory = dirname(databasePath);
  const file = join(directory, name);
  if (!existsSync(file)) {
    mkdirSync(directory, { recursive: true });
    try {
      writeFileSync(file, randomBytes(KEY_BYTES).toString('base64'), { mode: 0o600, flag: 'wx' });
    } catch {
      // Another process created it first; read theirs.
    }
  }
  return readFileSync(file, 'utf8').trim();
}

export const KEY_FILE = '.tatagereja.key';
/** The file the two-factor key lived in before field encryption covered every secret. */
export const LEGACY_TWO_FACTOR_KEY_FILE = '.tatagereja-2fa.key';

export type KeyringConfig = {
  databasePath: string;
  encryptionKey: string;
  previousEncryptionKeys: string[];
  legacyTwoFactorKey: string;
};

/**
 * The keyring for a server. `ENCRYPTION_KEY` is the production setting; without it a key file is
 * created next to the database (and kept with backups), and in-memory databases (tests) get a
 * key that lives as long as the process. Invalid keys stop the server at startup.
 */
export function loadKeyring(config: KeyringConfig): Keyring {
  const keys = new Map<string, Buffer>();
  let current: EncryptionKey;
  let source: Keyring['source'];
  if (config.encryptionKey) {
    current = parseEncryptionKey(config.encryptionKey);
    source = 'env';
  } else if (config.databasePath === ':memory:') {
    current = memoryKey;
    source = 'memory';
  } else {
    current = parseEncryptionKey(keyFile(config.databasePath, KEY_FILE), KEY_FILE);
    source = 'file';
  }
  keys.set(current.id, current.key);
  for (const text of config.previousEncryptionKeys) {
    const previous = parseEncryptionKey(text, 'ENCRYPTION_PREVIOUS_KEYS');
    if (keys.has(previous.id) && !keys.get(previous.id)?.equals(previous.key)) {
      throw new Error(`ENCRYPTION_PREVIOUS_KEYS: two different keys share the id ${previous.id}`);
    }
    keys.set(previous.id, previous.key);
  }
  const legacy: Buffer[] = [];
  if (config.legacyTwoFactorKey) legacy.push(deriveLegacyKey(config.legacyTwoFactorKey));
  if (config.databasePath !== ':memory:') {
    const file = join(dirname(config.databasePath), LEGACY_TWO_FACTOR_KEY_FILE);
    if (existsSync(file)) legacy.push(deriveLegacyKey(readFileSync(file, 'utf8').trim()));
  }
  return { current, keys, legacy, source };
}

const memoryKey: EncryptionKey = (() => {
  const key = randomBytes(KEY_BYTES);
  return { id: keyFingerprint(key), key };
})();

/*
 * The keyring Drizzle uses for `encryptedText` columns. It is process-wide because column
 * mappers have no request context; `useKeyring` sets it at startup (createDeps).
 */
let active: Keyring | null = null;

export function useKeyring(keyring: Keyring): void {
  active = keyring;
}

export function activeKeyring(): Keyring {
  if (!active) {
    active = loadKeyring({
      databasePath: ':memory:',
      encryptionKey: '',
      previousEncryptionKeys: [],
      legacyTwoFactorKey: '',
    });
  }
  return active;
}

export const isEncrypted = (value: string): boolean => value.startsWith(ENCRYPTED_PREFIX);

/** The key id of a stored value, or null when it is not in the encrypted format. */
export const keyIdOf = (value: string): string | null => {
  if (!isEncrypted(value)) return null;
  const end = value.indexOf(':', ENCRYPTED_PREFIX.length);
  return end > 0 ? value.slice(ENCRYPTED_PREFIX.length, end) : null;
};

export function encryptValue(keyring: Keyring, purpose: string, plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyring.current.key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  return `${ENCRYPTED_PREFIX}${keyring.current.id}:${payload}`;
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * Decrypts a stored value. Values that are not in the encrypted format pass through unchanged
 * (rows written before encryption, until the startup migration rewrites them); a value whose
 * key is missing or whose tag does not verify throws, because it was tampered with or the
 * wrong key is configured.
 */
export function decryptValue(keyring: Keyring, purpose: string, stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const id = keyIdOf(stored);
  const key = id ? keyring.keys.get(id) : undefined;
  if (!id || !key) {
    throw new DecryptionError(`No encryption key with id ${id ?? '?'} is configured`);
  }
  try {
    const data = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length + id.length + 1), 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new DecryptionError(`A value of ${purpose} could not be decrypted`);
  }
}

/** Reads a two-factor secret in the format used before field encryption (`v1:<payload>`). */
export function decryptLegacySecret(keyring: Keyring, stored: string): string | null {
  const [prefix, payload] = stored.split(':');
  if (prefix !== 'v1' || !payload) return null;
  const data = Buffer.from(payload, 'base64url');
  for (const key of keyring.legacy) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, IV_BYTES));
      decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([
        decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // try the next key
    }
  }
  return null;
}
