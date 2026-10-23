import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppConfig } from '../../config';

/*
 * Encryption at rest for two-factor secrets (AES-256-GCM). The key comes from
 * `TWO_FACTOR_ENCRYPTION_KEY` when set, otherwise from a key file created next to the
 * database (mode 0600), so a copied database or backup alone does not reveal the secrets.
 * In-memory databases (tests) use a key that lives as long as the process.
 */

const KEY_FILE = '.tatagereja-2fa.key';
const PREFIX = 'v1';
const keys = new Map<string, Buffer>();

const deriveKey = (material: string): Buffer => createHash('sha256').update(material).digest();

function encryptionKey(config: Pick<AppConfig, 'databasePath'>): Buffer {
  const fromEnv = process.env.TWO_FACTOR_ENCRYPTION_KEY?.trim();
  const id = fromEnv ? 'env' : config.databasePath;
  const cached = keys.get(id);
  if (cached) return cached;
  let key: Buffer;
  if (fromEnv) {
    key = deriveKey(fromEnv);
  } else if (config.databasePath === ':memory:') {
    key = randomBytes(32);
  } else {
    const directory = dirname(config.databasePath);
    const file = join(directory, KEY_FILE);
    if (!existsSync(file)) {
      mkdirSync(directory, { recursive: true });
      try {
        writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
      } catch {
        // Another process created it first; read theirs.
      }
    }
    key = deriveKey(readFileSync(file, 'utf8').trim());
  }
  keys.set(id, key);
  return key;
}

export function encryptSecret(config: Pick<AppConfig, 'databasePath'>, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(config), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${Buffer.concat([iv, tag, encrypted]).toString('base64url')}`;
}

/** Null when the value cannot be decrypted (other key, tampered value). */
export function decryptSecret(
  config: Pick<AppConfig, 'databasePath'>,
  stored: string,
): string | null {
  const [prefix, payload] = stored.split(':');
  if (prefix !== PREFIX || !payload) return null;
  try {
    const data = Buffer.from(payload, 'base64url');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(config), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
