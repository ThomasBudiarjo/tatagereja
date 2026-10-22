import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(token);
  return hasher.digest('hex');
}

export function newId(): string {
  return crypto.randomUUID();
}

/**
 * Constant-time string comparison for secrets compared in memory (codes, TOTP values).
 * Values of different length compare unequal without leaking where they differ.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** Alphabet without look-alike characters (no 0/O, 1/I/L), for codes people read aloud. */
export const UNAMBIGUOUS_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A random code from a CSPRNG, e.g. a kids check-in security code. */
export function generateCode(length = 4, alphabet = UNAMBIGUOUS_ALPHABET): string {
  let code = '';
  for (let i = 0; i < length; i += 1) code += alphabet[randomInt(alphabet.length)];
  return code;
}
