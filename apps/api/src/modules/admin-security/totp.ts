import { TOTP } from '@tatagereja/shared';
import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from '../../lib/tokens';

/*
 * Time-based one-time passwords (RFC 6238) on top of HOTP (RFC 4226), with node:crypto only.
 * Secrets travel as unpadded Base32 (RFC 4648), the format authenticator apps expect.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new random secret, Base32-encoded. */
export const generateTotpSecret = (): string => base32Encode(randomBytes(TOTP.secretBytes));

/** HOTP value for one counter: HMAC-SHA1 with dynamic truncation, zero-padded. */
export function hotp(secret: Buffer, counter: number, digits: number = TOTP.digits): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The 30-second time step a moment falls in. */
export const totpStep = (now = Date.now()): number => Math.floor(now / 1000 / TOTP.periodSeconds);

/** The current code for a Base32 secret (used by tests and the setup check). */
export const totpCode = (secret: string, now = Date.now()): string =>
  hotp(base32Decode(secret), totpStep(now));

/**
 * Checks a code against the steps around now (clock drift) and returns the matched step, so
 * the caller can refuse a code that was already used. Null when no step matches.
 */
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  const key = base32Decode(secret);
  const current = totpStep(now);
  let matched: number | null = null;
  // Every candidate is compared, so timing does not reveal which step matched.
  for (let offset = -TOTP.window; offset <= TOTP.window; offset += 1) {
    if (safeEqual(hotp(key, current + offset), code) && matched === null) {
      matched = current + offset;
    }
  }
  return matched;
}

/** The `otpauth://` URI authenticator apps read from the QR code. */
export function otpauthUrl(secret: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: TOTP.algorithm,
    digits: String(TOTP.digits),
    period: String(TOTP.periodSeconds),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
