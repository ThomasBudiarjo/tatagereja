import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../src/config';
import {
  assertEncryptionKeysAvailable,
  encryptPlaintextColumns,
  reencryptColumns,
} from '../src/db/encrypted';
import { invitations, personPrivateDetails, userTwoFactor, users } from '../src/db/schema';
import {
  DecryptionError,
  activeKeyring,
  decryptValue,
  encryptValue,
  keyFingerprint,
  parseEncryptionKey,
  useKeyring,
  type Keyring,
} from '../src/lib/crypto';
import {
  DEFAULT_PASSWORD_HASHING,
  hashPassword,
  needsRehash,
  weakPasswordReason,
} from '../src/lib/password';
import { hashToken } from '../src/lib/tokens';
import { totpCode } from '../src/modules/admin-security/totp';
import { hashLegacyInvitationTokens } from '../src/services/invitations';
import { createTestApp, seedChurch } from './helpers';

type TestApp = ReturnType<typeof createTestApp>;

const keyringOf = (...texts: string[]): Keyring => {
  const [current, ...previous] = texts.map((text) => parseEncryptionKey(text));
  const keys = new Map([current!, ...previous].map((key) => [key.id, key.key]));
  return { current: current!, keys, legacy: [], source: 'env' };
};

const raw = (t: TestApp, query: string, ...params: string[]) =>
  t.db.$client.query<Record<string, any>, string[]>(query).get(...params);

describe('field encryption', () => {
  const keyA = randomBytes(32).toString('base64');
  const keyB = `2027b:${randomBytes(32).toString('hex')}`;

  it('parses keys in base64, base64url and hex, with or without an id', () => {
    const bytes = randomBytes(32);
    expect(parseEncryptionKey(bytes.toString('base64')).key.equals(bytes)).toBe(true);
    expect(parseEncryptionKey(bytes.toString('base64url')).key.equals(bytes)).toBe(true);
    expect(parseEncryptionKey(bytes.toString('hex')).key.equals(bytes)).toBe(true);
    expect(parseEncryptionKey(`main:${bytes.toString('base64')}`).id).toBe('main');
    expect(parseEncryptionKey(bytes.toString('base64')).id).toBe(keyFingerprint(bytes));
    expect(() => parseEncryptionKey('too-short')).toThrow('32 random bytes');
    expect(() => parseEncryptionKey(randomBytes(16).toString('base64'))).toThrow();
    expect(() => parseEncryptionKey(`BAD ID:${bytes.toString('base64')}`)).toThrow('key id');
  });

  it('validates the keys at startup', () => {
    expect(() => loadConfig({ ENCRYPTION_KEY: 'not-a-key' })).toThrow('ENCRYPTION_KEY');
    expect(() =>
      loadConfig({ ENCRYPTION_KEY: keyA, ENCRYPTION_PREVIOUS_KEYS: `${keyB},nope` }),
    ).toThrow('ENCRYPTION_PREVIOUS_KEYS');
    const config = loadConfig({ ENCRYPTION_KEY: keyA, ENCRYPTION_PREVIOUS_KEYS: keyB });
    expect(config.previousEncryptionKeys).toEqual([keyB]);
  });

  it('round-trips, binds each value to its column and detects tampering', () => {
    const keyring = keyringOf(keyA);
    const stored = encryptValue(keyring, 'person_private_details.national_id', '3273012345670001');
    expect(stored).toStartWith(`enc1:${keyring.current.id}:`);
    expect(stored).not.toContain('3273');
    expect(encryptValue(keyring, 'x.y', 'same')).not.toBe(encryptValue(keyring, 'x.y', 'same'));
    expect(decryptValue(keyring, 'person_private_details.national_id', stored)).toBe(
      '3273012345670001',
    );
    // Copied into another column, the value does not decrypt.
    expect(() => decryptValue(keyring, 'care_notes.body', stored)).toThrow(DecryptionError);
    const tampered = `${stored.slice(0, -2)}${stored.endsWith('A') ? 'B' : 'A'}A`;
    expect(() => decryptValue(keyring, 'person_private_details.national_id', tampered)).toThrow(
      DecryptionError,
    );
    expect(() =>
      decryptValue(keyringOf(keyB), 'person_private_details.national_id', stored),
    ).toThrow('No encryption key');
    // Rows from before encryption read as they are until the startup migration rewrites them.
    expect(decryptValue(keyring, 'x.y', 'plain text')).toBe('plain text');
  });

  describe('in the database', () => {
    const t = createTestApp();
    afterAll(() => t.close());
    let s: Awaited<ReturnType<typeof seedChurch>>;

    beforeAll(async () => {
      s = await seedChurch(t);
    });

    it('stores private details encrypted and serves them in plain text', async () => {
      const saved = await t.request(
        'PUT',
        `/api/churches/${s.church.id}/people/${s.bob.id}/private`,
        {
          token: s.owner.token,
          body: {
            nationalId: '3273012345670001',
            medicalNotes: 'Alergi kacang',
            privateNotes: 'Sedang dalam pendampingan',
          },
        },
      );
      expect(saved.status).toBe(200);
      const stored = raw(
        t,
        'select national_id, medical_notes, private_notes from person_private_details where person_id = ?',
        s.bob.id,
      );
      for (const value of Object.values(stored ?? {})) expect(value).toStartWith('enc1:');
      expect(JSON.stringify(stored)).not.toContain('Alergi');
      const view = await t.request('GET', `/api/churches/${s.church.id}/people/${s.bob.id}`, {
        token: s.owner.token,
      });
      expect(view.json.privateDetails).toMatchObject({
        nationalId: '3273012345670001',
        medicalNotes: 'Alergi kacang',
      });
      // The directory search still finds people by name.
      const search = await t.request('GET', `/api/churches/${s.church.id}/people?q=Bob`, {
        token: s.owner.token,
      });
      expect(search.json.items.some((item: { id: string }) => item.id === s.bob.id)).toBe(true);
    });

    it('encrypts rows written before encryption at startup, once', () => {
      const legacyKeyMaterial = 'old two-factor key';
      const legacyKey = createHash('sha256').update(legacyKeyMaterial).digest();
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', legacyKey, iv);
      const secret = 'JBSWY3DPEHPK3PXP';
      const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
      const legacySecret = `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')}`;
      t.db.$client
        .query(
          'update person_private_details set national_id = ?, medical_notes = ? where person_id = ?',
        )
        .run('3273000000000002', 'Plain medical note', s.bob.id);
      t.db.$client
        .query(
          'insert into user_two_factor (user_id, secret_encrypted, enabled_at, created_at, updated_at) values (?, ?, ?, ?, ?)',
        )
        .run(
          s.member.user.id,
          legacySecret,
          null,
          new Date().toISOString(),
          new Date().toISOString(),
        );

      const keyring = { ...activeKeyring(), legacy: [legacyKey] };
      const first = encryptPlaintextColumns(t.db, keyring);
      expect(first['person_private_details.national_id']).toBe(1);
      expect(first['person_private_details.medical_notes']).toBe(1);
      expect(first['user_two_factor.secret_encrypted']).toBe(1);
      expect(encryptPlaintextColumns(t.db, keyring)).toEqual({});

      expect(
        raw(t, 'select national_id from person_private_details where person_id = ?', s.bob.id)
          ?.national_id,
      ).toStartWith('enc1:');
      const details = t.db
        .select()
        .from(personPrivateDetails)
        .where(eq(personPrivateDetails.personId, s.bob.id))
        .get();
      expect(details?.nationalId).toBe('3273000000000002');
      const twoFactor = t.db
        .select()
        .from(userTwoFactor)
        .where(eq(userTwoFactor.userId, s.member.user.id))
        .get();
      expect(twoFactor?.secretEncrypted).toBe(secret);
      t.db.delete(userTwoFactor).where(eq(userTwoFactor.userId, s.member.user.id)).run();
    });

    it('rotates to a new key with the rotate routine and refuses to start without the old key', () => {
      const original = activeKeyring();
      const next: Keyring = {
        current: parseEncryptionKey(keyB),
        keys: new Map([
          [parseEncryptionKey(keyB).id, parseEncryptionKey(keyB).key],
          ...original.keys,
        ]),
        legacy: [],
        source: 'env',
      };
      try {
        const withoutOld = keyringOf(keyB);
        expect(() => assertEncryptionKeysAvailable(t.db, withoutOld)).toThrow('not configured');
        useKeyring(next);
        const rewritten = reencryptColumns(t.db, next);
        expect(rewritten['person_private_details.national_id']).toBe(1);
        expect(reencryptColumns(t.db, next)).toEqual({});
        expect(
          raw(t, 'select national_id from person_private_details where person_id = ?', s.bob.id)
            ?.national_id,
        ).toStartWith('enc1:2027b:');
        // Now the old key is no longer needed.
        expect(() => assertEncryptionKeysAvailable(t.db, withoutOld)).not.toThrow();
        useKeyring(withoutOld);
        expect(
          t.db
            .select()
            .from(personPrivateDetails)
            .where(eq(personPrivateDetails.personId, s.bob.id))
            .get()?.nationalId,
        ).toBe('3273000000000002');
        // Rotating back so later suites keep using the process key.
        const back: Keyring = { ...original, keys: next.keys };
        useKeyring(back);
        reencryptColumns(t.db, back);
      } finally {
        useKeyring(original);
      }
    });
  });
});

describe('passwords', () => {
  it('refuses common passwords, decorated ones and the email or name', () => {
    expect(weakPasswordReason('password')).toContain('too common');
    expect(weakPasswordReason('Password123!')).toContain('too common');
    expect(weakPasswordReason('qwertyuiop')).toContain('too common');
    expect(weakPasswordReason('haleluya2024')).toContain('too common');
    expect(weakPasswordReason('ruth.sitompul', { email: 'ruth.sitompul@example.com' })).toContain(
      'email',
    );
    expect(weakPasswordReason('Ruth Sitompul 1', { name: 'Ruth Sitompul' })).toContain('name');
    expect(weakPasswordReason('kidung-pujian-91')).toBeNull();
  });

  it('answers 422 on the field for weak or too long passwords', async () => {
    const t = createTestApp();
    try {
      const common = await t.request('POST', '/api/auth/register', {
        body: { name: 'Lemah', email: 'lemah@example.com', password: 'iloveyou1' },
      });
      expect(common.status).toBe(422);
      expect(common.json.error.issues[0].path).toBe('password');
      const long = await t.request('POST', '/api/auth/register', {
        body: { name: 'Panjang', email: 'panjang@example.com', password: 'x'.repeat(129) },
      });
      expect(long.status).toBe(422);
      const account = await t.register('Kuat', 'kuat@example.com', 'kidung-pujian-91');
      const change = await t.request('POST', '/api/auth/change-password', {
        token: account.token,
        body: { currentPassword: 'kidung-pujian-91', newPassword: 'kuat@example.com' },
      });
      expect(change.status).toBe(422);
      expect(change.json.error.issues[0].path).toBe('newPassword');
      // A login with an absurdly long password is refused before hashing.
      const huge = await t.request('POST', '/api/auth/login', {
        body: { email: 'kuat@example.com', password: 'x'.repeat(10_000) },
      });
      expect(huge.status).toBe(422);
    } finally {
      t.close();
    }
  });

  it('upgrades hashes made with older parameters at sign-in', async () => {
    const t = createTestApp();
    try {
      const account = await t.register('Lama', 'lama@example.com', 'kidung-pujian-91');
      const weak = await Bun.password.hash('kidung-pujian-91', {
        algorithm: 'argon2id',
        memoryCost: 4096,
        timeCost: 1,
      });
      t.db.update(users).set({ passwordHash: weak }).where(eq(users.id, account.user.id)).run();
      expect(needsRehash(weak, t.deps.config.passwordHashing)).toBe(true);
      const login = await t.request('POST', '/api/auth/login', {
        body: { email: 'lama@example.com', password: 'kidung-pujian-91' },
      });
      expect(login.status).toBe(200);
      const stored = t.db.select().from(users).where(eq(users.id, account.user.id)).get();
      expect(stored?.passwordHash).toContain(
        `m=${t.deps.config.passwordHashing.memoryCost},t=${t.deps.config.passwordHashing.timeCost}`,
      );
      expect(needsRehash(stored!.passwordHash, t.deps.config.passwordHashing)).toBe(false);
    } finally {
      t.close();
    }
  });

  it('uses strong argon2id parameters in production', async () => {
    expect(DEFAULT_PASSWORD_HASHING.memoryCost).toBeGreaterThanOrEqual(65536);
    expect(DEFAULT_PASSWORD_HASHING.timeCost).toBeGreaterThanOrEqual(3);
    expect(loadConfig({}).passwordHashing).toEqual(DEFAULT_PASSWORD_HASHING);
    const hash = await hashPassword('kidung-pujian-91');
    expect(hash).toStartWith('$argon2id$v=19$m=65536,t=3,');
  });
});

describe('invitation links', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  let base: string;

  beforeAll(async () => {
    s = await seedChurch(t);
    base = `/api/churches/${s.church.id}/invitations`;
  });

  it('shows the link once and stores only its hash', async () => {
    const created = await t.request('POST', base, {
      token: s.owner.token,
      body: { label: 'Warta Jemaat' },
    });
    expect(created.status).toBe(201);
    const { token, url, id } = created.json.invitation;
    expect(url).toBe(`http://localhost:5173/join/${token}`);
    const stored = raw(t, 'select token from invitations where id = ?', id)?.token;
    expect(stored).toBe(hashToken(token));
    const list = await t.request('GET', base, { token: s.owner.token });
    const listed = list.json.items.find((item: { id: string }) => item.id === id);
    expect(listed.token).toBeNull();
    expect(listed.url).toBeNull();
    expect(JSON.stringify(list.json)).not.toContain(token);
    expect((await t.request('GET', `/api/invitations/${token}`)).status).toBe(200);
    expect((await t.request('GET', `/api/invitations/${stored}`)).status).toBe(404);
  });

  it('regenerates a link: the old one stops working at once', async () => {
    const created = await t.request('POST', base, { token: s.owner.token, body: {} });
    const old = created.json.invitation.token;
    const regenerated = await t.request(
      'POST',
      `${base}/${created.json.invitation.id}/regenerate`,
      {
        token: s.owner.token,
      },
    );
    expect(regenerated.status).toBe(200);
    const fresh = regenerated.json.invitation.token;
    expect(fresh).not.toBe(old);
    expect(regenerated.json.invitation.url).toContain(fresh);
    expect((await t.request('GET', `/api/invitations/${old}`)).status).toBe(404);
    expect((await t.request('GET', `/api/invitations/${fresh}`)).status).toBe(200);
    const joiner = await t.register('Joiner');
    expect((await t.join(joiner.token, fresh)).churchId).toBe(s.church.id);

    const audit = await t.request(
      'GET',
      `/api/churches/${s.church.id}/audit-logs?action=invitation.regenerate`,
      {
        token: s.owner.token,
      },
    );
    expect(audit.json.items).toHaveLength(1);
    expect(JSON.stringify(audit.json)).not.toContain(fresh);

    const member = await t.request('POST', `${base}/${created.json.invitation.id}/regenerate`, {
      token: s.member.token,
    });
    expect(member.status).toBe(403);
    await t.request('DELETE', `${base}/${created.json.invitation.id}`, { token: s.owner.token });
    const revoked = await t.request('POST', `${base}/${created.json.invitation.id}/regenerate`, {
      token: s.owner.token,
    });
    expect(revoked.status).toBe(409);
  });

  it('hashes plain tokens left from before, once', () => {
    const created = t.db
      .select()
      .from(invitations)
      .where(eq(invitations.churchId, s.church.id))
      .get();
    t.db.$client
      .query('update invitations set token = ? where id = ?')
      .run('plain-legacy-token', created!.id);
    expect(hashLegacyInvitationTokens(t.db)).toBe(1);
    expect(hashLegacyInvitationTokens(t.db)).toBe(0);
    expect(raw(t, 'select token from invitations where id = ?', created!.id)?.token).toBe(
      hashToken('plain-legacy-token'),
    );
  });
});

describe('password reset', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let s: Awaited<ReturnType<typeof seedChurch>>;
  const membershipOf = async (userId: string) =>
    (
      await t.request('GET', `/api/churches/${s.church.id}/members`, { token: s.owner.token })
    ).json.items.find((item: { userId: string }) => item.userId === userId).id as string;
  const resetFor = (
    token: string,
    membershipId: string,
    body: unknown = { identityConfirmed: true },
  ) =>
    t.request('POST', `/api/churches/${s.church.id}/members/${membershipId}/password-reset`, {
      token,
      body,
    });

  beforeAll(async () => {
    s = await seedChurch(t);
  });

  it('lets an administrator make a one-time link that resets the password and ends every session', async () => {
    const memberId = await membershipOf(s.member.user.id);
    expect((await resetFor(s.admin.token, memberId, {})).status).toBe(422);
    const link = await resetFor(s.admin.token, memberId);
    expect(link.status).toBe(201);
    expect(link.json.url).toBe(`http://localhost:5173/reset-password/${link.json.token}`);
    expect(link.json.twoFactorRequired).toBe(false);
    const minutes = (new Date(link.json.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
    expect(
      raw(
        t,
        'select count(*) as n from password_reset_tokens where token_hash = ?',
        hashToken(link.json.token),
      )?.n,
    ).toBe(1);

    const preview = await t.request('GET', `/api/auth/password-reset/${link.json.token}`);
    expect(preview.status).toBe(200);
    expect(preview.json.name).toBe('Member');
    expect(preview.json.email).toContain('***@');

    const weak = await t.request('POST', '/api/auth/password-reset', {
      body: { token: link.json.token, newPassword: 'password1' },
    });
    expect(weak.status).toBe(422);
    const done = await t.request('POST', '/api/auth/password-reset', {
      body: { token: link.json.token, newPassword: 'jemaat-baru-2031' },
    });
    expect(done.status).toBe(200);
    expect((await t.request('GET', '/api/auth/me', { token: s.member.token })).status).toBe(401);
    const again = await t.request('POST', '/api/auth/password-reset', {
      body: { token: link.json.token, newPassword: 'jemaat-lagi-2032' },
    });
    expect(again.status).toBe(410);
    expect(again.json.error.code).toBe('RESET_LINK_INVALID');
    const login = await t.request('POST', '/api/auth/login', {
      body: { email: s.member.user.email, password: 'jemaat-baru-2031' },
    });
    expect(login.status).toBe(200);
    s.member.token = login.json.token;

    const audit = await t.request(
      'GET',
      `/api/churches/${s.church.id}/audit-logs?module=admin-security`,
      { token: s.owner.token },
    );
    const actions = audit.json.items.map((item: { action: string }) => item.action);
    expect(actions).toEqual(
      expect.arrayContaining(['member.password_reset_link', 'account.password_reset']),
    );
    expect(JSON.stringify(audit.json)).not.toContain(link.json.token);
  });

  it('expires after thirty minutes and keeps only the newest link', async () => {
    const memberId = await membershipOf(s.member.user.id);
    const first = await resetFor(s.owner.token, memberId);
    const second = await resetFor(s.owner.token, memberId);
    expect((await t.request('GET', `/api/auth/password-reset/${first.json.token}`)).status).toBe(
      410,
    );
    t.db.$client
      .query('update password_reset_tokens set expires_at = ? where token_hash = ?')
      .run(new Date(Date.now() - 1000).toISOString(), hashToken(second.json.token));
    expect((await t.request('GET', `/api/auth/password-reset/${second.json.token}`)).status).toBe(
      410,
    );
  });

  it('refuses links for the owner, oneself, members without the permission and other churches', async () => {
    const ownerId = await membershipOf(s.owner.user.id);
    const adminId = await membershipOf(s.admin.user.id);
    const memberId = await membershipOf(s.member.user.id);
    expect((await resetFor(s.admin.token, ownerId)).status).toBe(403);
    expect((await resetFor(s.admin.token, adminId)).status).toBe(403);
    expect((await resetFor(s.member.token, memberId)).status).toBe(403);

    // The leader also owns another church: an administrator here cannot take that over.
    const elsewhere = await t.createChurch(s.leader.token, 'Gereja Lain');
    expect(elsewhere.id).toBeString();
    const leaderId = await membershipOf(s.leader.user.id);
    const blocked = await resetFor(s.admin.token, leaderId);
    expect(blocked.status).toBe(403);
    expect(blocked.json.error.code).toBe('ESCALATION_DENIED');

    const other = await seedChurch(t);
    const foreign = await t.request(
      'POST',
      `/api/churches/${other.church.id}/members/${memberId}/password-reset`,
      { token: other.owner.token, body: { identityConfirmed: true } },
    );
    expect(foreign.status).toBe(404);
  });

  it('asks an account with two-step verification for its code too', async () => {
    const account = await t.register('Dua Langkah', 'dua@example.com', 'kidung-pujian-91');
    await t.join(account.token, s.invitation.token);
    const setup = await t.request('POST', '/api/auth/two-factor/setup', {
      token: account.token,
      body: { password: account.password },
    });
    const enable = await t.request('POST', '/api/auth/two-factor/enable', {
      token: account.token,
      body: { code: totpCode(setup.json.secret) },
    });
    const recoveryCodes = enable.json.recoveryCodes as string[];
    const link = await resetFor(s.owner.token, await membershipOf(account.user.id));
    expect(link.json.twoFactorRequired).toBe(true);
    const missing = await t.request('POST', '/api/auth/password-reset', {
      body: { token: link.json.token, newPassword: 'jemaat-baru-2031' },
    });
    expect(missing.status).toBe(422);
    expect(missing.json.error.issues[0].path).toBe('code');
    const wrong = await t.request('POST', '/api/auth/password-reset', {
      body: {
        token: link.json.token,
        newPassword: 'jemaat-baru-2031',
        recoveryCode: 'AAAAA-AAAAA',
      },
    });
    expect(wrong.status).toBe(422);
    expect(wrong.json.error.issues[0].path).toBe('recoveryCode');
    const ok = await t.request('POST', '/api/auth/password-reset', {
      body: {
        token: link.json.token,
        newPassword: 'jemaat-baru-2031',
        recoveryCode: recoveryCodes[0],
      },
    });
    expect(ok.status).toBe(200);
  });

  it('lets someone with a recovery code reset it themselves, with one answer for every failure', async () => {
    const account = await t.register('Mandiri', 'mandiri@example.com', 'kidung-pujian-91');
    const setup = await t.request('POST', '/api/auth/two-factor/setup', {
      token: account.token,
      body: { password: account.password },
    });
    const enable = await t.request('POST', '/api/auth/two-factor/enable', {
      token: account.token,
      body: { code: totpCode(setup.json.secret) },
    });
    const code = (enable.json.recoveryCodes as string[])[0];
    const noTwoFactor = await t.register('Tanpa', 'tanpa@example.com', 'kidung-pujian-91');
    expect(noTwoFactor.user.id).toBeString();

    const attempts = await Promise.all(
      [
        { email: 'nobody@example.com', recoveryCode: code },
        { email: 'tanpa@example.com', recoveryCode: code },
        { email: 'mandiri@example.com', recoveryCode: 'AAAAA-AAAAA' },
      ].map((body) =>
        t.request('POST', '/api/auth/password-reset/recovery', {
          body: { ...body, newPassword: 'mandiri-baru-2031' },
        }),
      ),
    );
    for (const attempt of attempts) {
      expect(attempt.status).toBe(422);
      expect(attempt.json.error.message).toBe('This email and recovery code do not match');
    }
    const ok = await t.request('POST', '/api/auth/password-reset/recovery', {
      body: { email: 'mandiri@example.com', recoveryCode: code, newPassword: 'mandiri-baru-2031' },
    });
    expect(ok.status).toBe(200);
    expect(
      (await t.request('GET', '/api/auth/me', { token: enable.json.session.token })).status,
    ).toBe(401);
    const reused = await t.request('POST', '/api/auth/password-reset/recovery', {
      body: { email: 'mandiri@example.com', recoveryCode: code, newPassword: 'mandiri-lagi-2032' },
    });
    expect(reused.status).toBe(422);
    // Two-step verification stays on: signing in still asks for the code.
    const login = await t.request('POST', '/api/auth/login', {
      body: { email: 'mandiri@example.com', password: 'mandiri-baru-2031' },
    });
    expect(login.json.twoFactorRequired).toBe(true);
  });

  it('answers a locked account like any other, and still lets its own recovery code in', async () => {
    const account = await t.register('Terkunci Sekali', 'kunci@example.com', 'kidung-pujian-91');
    const setup = await t.request('POST', '/api/auth/two-factor/setup', {
      token: account.token,
      body: { password: account.password },
    });
    const enable = await t.request('POST', '/api/auth/two-factor/enable', {
      token: account.token,
      body: { code: totpCode(setup.json.secret) },
    });
    const code = (enable.json.recoveryCodes as string[])[0];
    // Someone else keeps the account locked by guessing passwords.
    t.db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() + 60 * 60_000).toISOString() })
      .where(eq(users.id, account.user.id))
      .run();
    const wrong = await t.request('POST', '/api/auth/password-reset/recovery', {
      body: {
        email: 'kunci@example.com',
        recoveryCode: 'AAAAA-AAAAA',
        newPassword: 'terkunci-baru-2031',
      },
    });
    expect(wrong.status).toBe(422);
    expect(wrong.json.error.message).toBe('This email and recovery code do not match');
    // The name is not checked here: refusing it would tell that the account exists.
    const named = await t.request('POST', '/api/auth/password-reset/recovery', {
      body: {
        email: 'kunci@example.com',
        recoveryCode: 'AAAAA-AAAAA',
        newPassword: 'Terkunci Sekali',
      },
    });
    expect(named.json.error.message).toBe('This email and recovery code do not match');
    const ok = await t.request('POST', '/api/auth/password-reset/recovery', {
      body: { email: 'kunci@example.com', recoveryCode: code, newPassword: 'terkunci-baru-2031' },
    });
    expect(ok.status).toBe(200);
    expect(t.db.select().from(users).where(eq(users.id, account.user.id)).get()!.lockedUntil).toBe(
      null,
    );
  });

  it('voids reset links and half-done two-step sign-ins when the password changes', async () => {
    const account = await t.register('Ganti Sandi', 'ganti@example.com', 'kidung-pujian-91');
    await t.join(account.token, s.invitation.token);
    const link = await resetFor(s.owner.token, await membershipOf(account.user.id));
    expect(link.status).toBe(201);
    const setup = await t.request('POST', '/api/auth/two-factor/setup', {
      token: account.token,
      body: { password: account.password },
    });
    const enable = await t.request('POST', '/api/auth/two-factor/enable', {
      token: account.token,
      body: { code: totpCode(setup.json.secret) },
    });
    const challenge = await t.request('POST', '/api/auth/login', {
      body: { email: 'ganti@example.com', password: account.password },
    });
    expect(challenge.json.twoFactorRequired).toBe(true);

    const changed = await t.request('POST', '/api/auth/change-password', {
      token: enable.json.session.token,
      body: { currentPassword: account.password, newPassword: 'ganti-baru-2031' },
    });
    expect(changed.status).toBe(200);
    expect((await t.request('GET', `/api/auth/password-reset/${link.json.token}`)).status).toBe(
      410,
    );
    const finish = await t.request('POST', '/api/auth/login/two-factor', {
      body: {
        challengeToken: challenge.json.challengeToken,
        code: totpCode(setup.json.secret, Date.now() + 30_000),
      },
    });
    expect(finish.status).toBe(401);
    expect(finish.json.error.code).toBe('TWO_FACTOR_INVALID');
  });
});
