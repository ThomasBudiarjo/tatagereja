import { LIMITS } from '@tatagereja/shared';
import { readFileSync } from 'node:fs';
import { validationError } from './errors';

/** argon2id cost: memory in KiB and passes. Parallelism is always 1 in Bun. */
export type PasswordHashing = { memoryCost: number; timeCost: number };

/**
 * 64 MiB and three passes (RFC 9106's second recommended setting), about 150 ms per hash on a
 * small server. Raising it later is safe: older hashes are upgraded the next time each person
 * signs in.
 */
export const DEFAULT_PASSWORD_HASHING: PasswordHashing = { memoryCost: 65536, timeCost: 3 };

/** Passwords longer than this many bytes are refused before hashing (no hashing DoS). */
export const PASSWORD_MAX_BYTES = 512;

export const passwordTooLong = (password: string): boolean =>
  password.length > LIMITS.passwordMax || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES;

export async function hashPassword(
  password: string,
  params: PasswordHashing = DEFAULT_PASSWORD_HASHING,
): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'argon2id', ...params });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (passwordTooLong(password)) return false;
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}

/** Whether a stored hash was made with other parameters (or another algorithm) than `params`. */
export function needsRehash(hash: string, params: PasswordHashing): boolean {
  const match = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=\d+\$/.exec(hash);
  if (!match) return true;
  return Number(match[1]) !== params.memoryCost || Number(match[2]) !== params.timeCost;
}

let common: Set<string> | null = null;

/** The bundled list of the most common passwords, loaded on first use. */
function commonPasswords(): Set<string> {
  if (!common) {
    const file = new URL('./common-passwords.txt', import.meta.url);
    common = new Set(
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#')),
    );
  }
  return common;
}

/** Digits and symbols people add to the end of a word ("jakarta2024!"). */
const TRAILING_DECORATION = /[\d\W_]+$/u;

/**
 * Why a new password is refused, or null when it may be used: it is one of the most common
 * passwords (also with digits or symbols added at the end), or it is the person's own email
 * address or name.
 */
export function weakPasswordReason(
  password: string,
  person: { email?: string | null; name?: string | null } = {},
): string | null {
  const lowered = password.toLowerCase();
  const base = lowered.replace(TRAILING_DECORATION, '');
  const list = commonPasswords();
  if (list.has(lowered) || (base.length >= 4 && list.has(base))) {
    return 'This password is too common. Choose one that is harder to guess';
  }
  const email = person.email?.toLowerCase();
  const local = email?.split('@')[0] ?? '';
  const name = person.name?.toLowerCase().replace(/\s+/g, '') ?? '';
  const compact = base.replace(/\s+/g, '');
  if (
    (email && lowered.includes(email)) ||
    (local.length >= 4 && compact === local) ||
    (name.length >= 4 && compact === name)
  ) {
    return 'Do not use your email address or name as your password';
  }
  return null;
}

/** Refuses a new password that is too long or too weak, with 422 on the field that holds it. */
export function assertStrongPassword(
  password: string,
  path: string,
  person: { email?: string | null; name?: string | null } = {},
): void {
  const reason = passwordTooLong(password)
    ? 'This password is too long'
    : weakPasswordReason(password, person);
  if (reason) throw validationError(reason, [{ path, message: reason }]);
}
