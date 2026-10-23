import {
  FAILED_LOGIN_OUTCOMES,
  deleteAccountBodySchema,
  loginEventListQuerySchema,
  passwordConfirmBodySchema,
  twoFactorConfirmBodySchema,
  twoFactorEnableBodySchema,
  twoFactorSetupBodySchema,
  type PersonalDataExport,
  type LocalizedText,
} from '@tatagereja/shared';
import { and, count, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import {
  auditLogs,
  churches,
  churchMemberships,
  loginEvents,
  people,
  sessions,
  userRecoveryCodes,
  userTwoFactor,
  users,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { HttpError, conflict, notFound } from '../../lib/errors';
import { verifyPassword } from '../../lib/password';
import { offsetOf } from '../../lib/query';
import { enforceRateLimit } from '../../lib/rate-limit';
import { nowIso } from '../../lib/time';
import { authPlugin } from '../../plugins/auth';
import { recordAudit, type AuditContext } from '../../services/audit';
import { revokeOtherSessions, rotateSession, sessionResponse } from '../../services/sessions';
import { notify } from '../../services/notifications';
import { churchTables, withoutCredentials } from './introspection';
import { toLoginEvent } from './serializers';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';
import {
  churchesRequiringTwoFactor,
  enabledTwoFactor,
  invalidSecondFactor,
  issueRecoveryCodes,
  passwordIncorrect,
  unusedRecoveryCodes,
  useSecondFactor,
} from './two-factor';

const MANAGE_LIMIT = { windowMs: 15 * 60_000, max: 20 };
const EXPORT_LIMIT = { windowMs: 60 * 60_000, max: 10 };
/** Insertion order breaks ties between sign-in events written in the same millisecond. */
const LOGIN_EVENT_ORDER = sql`${loginEvents}.rowid`;

/**
 * Tables left out of "download my data": pastoral care written about a person by caregivers
 * is confidential to them, not a record the person keeps.
 */
const PERSONAL_EXPORT_EXCLUDED = /^(care_|visitor_follow_ups$|diakonia_aid$|absence_alerts$)/;

/**
 * Tables whose rows belong to whoever wrote them rather than to the person they are about: a
 * prayer request someone else submitted for this person (for pastors only, say) is not theirs.
 */
const PERSONAL_EXPORT_AUTHOR_COLUMN: Record<string, string> = { prayer_requests: 'submitted_by' };

/**
 * Account security: two-step verification, sign-in history, signing out other devices, and
 * data rights (download my data, delete my account). Everyone manages their own account; no
 * church permission is involved.
 */
export const accountSecurityRouter = (deps: Deps) => {
  const { db, config } = deps;

  const loadUser = (userId: string) => {
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw notFound('User');
    return user;
  };

  const confirmPassword = async (userId: string, password: string) => {
    const user = loadUser(userId);
    if (!(await verifyPassword(password, user.passwordHash))) throw passwordIncorrect();
    return user;
  };

  const twoFactorNotice = (
    tx: Queryable,
    userId: string,
    title: LocalizedText,
    body: LocalizedText,
  ) =>
    notify(tx, {
      churchId: null,
      userIds: [userId],
      type: 'account.two_factor_changed',
      title,
      body,
      link: '/profile?tab=security',
      entityType: 'user',
      entityId: userId,
    });

  const accountAudit = (
    tx: Queryable,
    audit: AuditContext,
    action: string,
    userId: string,
    summary: string,
    after?: unknown,
  ) =>
    recordAudit(tx, audit, {
      module: 'admin-security',
      action,
      entityType: 'user',
      entityId: userId,
      summary,
      after,
    });

  const ownedChurches = (userId: string) =>
    db
      .select({ id: churches.id, name: churches.name })
      .from(churches)
      .where(eq(churches.ownerUserId, userId))
      .all();

  return new Elysia({ prefix: '/auth' })
    .use(authPlugin(deps))
    .get(
      '/two-factor',
      ({ auth }) => {
        const row = enabledTwoFactor(db, auth.user.id);
        return {
          enabled: !!row,
          enabledAt: row?.enabledAt ?? null,
          recoveryCodesRemaining: row ? unusedRecoveryCodes(db, auth.user.id) : 0,
          requiredByChurchIds: churchesRequiringTwoFactor(db, auth.user.id),
        };
      },
      { auth: true },
    )
    .post(
      '/two-factor/setup',
      async ({ auth, body }) => {
        enforceRateLimit(deps.limiters, 'auth.two_factor_manage', auth.user.id, MANAGE_LIMIT);
        await confirmPassword(auth.user.id, body.password);
        if (enabledTwoFactor(db, auth.user.id)) {
          throw conflict('Two-step verification is already on. Turn it off first to start over');
        }
        const secret = generateTotpSecret();
        const now = nowIso();
        // A pending setup is replaced each time; it only counts once a code confirms it.
        db.insert(userTwoFactor)
          .values({
            userId: auth.user.id,
            secretEncrypted: secret,
            enabledAt: null,
            lastUsedStep: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: userTwoFactor.userId,
            set: {
              secretEncrypted: secret,
              enabledAt: null,
              lastUsedStep: null,
              updatedAt: now,
            },
          })
          .run();
        return {
          secret,
          otpauthUrl: otpauthUrl(secret, auth.user.email, config.serverName),
        };
      },
      { auth: true, body: twoFactorSetupBodySchema },
    )
    .post(
      '/two-factor/enable',
      ({ auth, audit, body, request, set }) => {
        enforceRateLimit(deps.limiters, 'auth.two_factor_manage', auth.user.id, MANAGE_LIMIT);
        const row = db
          .select()
          .from(userTwoFactor)
          .where(eq(userTwoFactor.userId, auth.user.id))
          .get();
        if (!row) throw conflict('Start the setup first');
        if (row.enabledAt) throw conflict('Two-step verification is already on');
        const step = verifyTotp(row.secretEncrypted, body.code);
        if (step === null) throw invalidSecondFactor({ code: body.code });
        const result = db.transaction((tx) => {
          const now = nowIso();
          tx.update(userTwoFactor)
            .set({ enabledAt: now, lastUsedStep: step, updatedAt: now })
            .where(eq(userTwoFactor.userId, auth.user.id))
            .run();
          const codes = issueRecoveryCodes(tx, auth.user.id);
          // Sessions that signed in without the second factor end; this one gets new credentials.
          const revoked = revokeOtherSessions(tx, auth.user.id, auth.sessionId);
          const issued = rotateSession(tx, config, auth.sessionId);
          accountAudit(
            tx,
            audit,
            'account.two_factor_enable',
            auth.user.id,
            `${auth.user.name} turned on two-step verification`,
          );
          twoFactorNotice(
            tx,
            auth.user.id,
            { id: 'Verifikasi dua langkah aktif', en: 'Two-step verification is on' },
            {
              id: 'Saat masuk, Anda kini juga diminta kode dari aplikasi autentikator.',
              en: 'Signing in now also asks for a code from your authenticator app.',
            },
          );
          return { codes, revoked, issued };
        });
        return {
          recoveryCodes: result.codes,
          revokedSessions: result.revoked,
          session: sessionResponse(set, request, result.issued, auth.user),
        };
      },
      { auth: true, body: twoFactorEnableBodySchema },
    )
    .post(
      '/two-factor/disable',
      async ({ auth, audit, body, request, set }) => {
        enforceRateLimit(deps.limiters, 'auth.two_factor_manage', auth.user.id, MANAGE_LIMIT);
        await confirmPassword(auth.user.id, body.password);
        const row = enabledTwoFactor(db, auth.user.id);
        if (!row) throw conflict('Two-step verification is not on');
        const result = db.transaction((tx) => {
          if (!useSecondFactor(tx, row, body)) throw invalidSecondFactor(body);
          tx.delete(userTwoFactor).where(eq(userTwoFactor.userId, auth.user.id)).run();
          tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, auth.user.id)).run();
          const revoked = revokeOtherSessions(tx, auth.user.id, auth.sessionId);
          const issued = rotateSession(tx, config, auth.sessionId);
          accountAudit(
            tx,
            audit,
            'account.two_factor_disable',
            auth.user.id,
            `${auth.user.name} turned off two-step verification`,
          );
          twoFactorNotice(
            tx,
            auth.user.id,
            { id: 'Verifikasi dua langkah nonaktif', en: 'Two-step verification is off' },
            {
              id: 'Akun Anda kini hanya dilindungi kata sandi. Jika ini bukan Anda, segera ganti kata sandi.',
              en: 'Your account is protected by your password only. If this was not you, change your password now.',
            },
          );
          return { revoked, issued };
        });
        return {
          ok: true as const,
          revokedSessions: result.revoked,
          session: sessionResponse(set, request, result.issued, auth.user),
        };
      },
      { auth: true, body: twoFactorConfirmBodySchema },
    )
    .post(
      '/two-factor/recovery-codes',
      async ({ auth, audit, body }) => {
        enforceRateLimit(deps.limiters, 'auth.two_factor_manage', auth.user.id, MANAGE_LIMIT);
        await confirmPassword(auth.user.id, body.password);
        const row = enabledTwoFactor(db, auth.user.id);
        if (!row) throw conflict('Two-step verification is not on');
        const recoveryCodes = db.transaction((tx) => {
          if (!useSecondFactor(tx, row, body)) throw invalidSecondFactor(body);
          const codes = issueRecoveryCodes(tx, auth.user.id);
          accountAudit(
            tx,
            audit,
            'account.recovery_codes_regenerate',
            auth.user.id,
            `${auth.user.name} made new recovery codes`,
          );
          twoFactorNotice(
            tx,
            auth.user.id,
            { id: 'Kode pemulihan baru dibuat', en: 'New recovery codes were made' },
            {
              id: 'Kode pemulihan sebelumnya tidak berlaku lagi.',
              en: 'Your previous recovery codes no longer work.',
            },
          );
          return codes;
        });
        return { recoveryCodes };
      },
      { auth: true, body: twoFactorConfirmBodySchema },
    )
    .get(
      '/login-events',
      ({ auth, query }) => {
        const conditions: SQL[] = [eq(loginEvents.userId, auth.user.id)];
        if (query.outcome === 'failed') {
          conditions.push(inArray(loginEvents.outcome, [...FAILED_LOGIN_OUTCOMES]));
        }
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(loginEvents).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(loginEvents)
          .where(where)
          .orderBy(desc(loginEvents.createdAt), desc(LOGIN_EVENT_ORDER))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return { items: rows.map(toLoginEvent), total, page: query.page, limit: query.limit };
      },
      { auth: true, query: loginEventListQuerySchema },
    )
    .delete(
      '/sessions',
      ({ auth, audit }) => {
        const revoked = db.transaction((tx) => {
          const count = revokeOtherSessions(tx, auth.user.id, auth.sessionId);
          if (count > 0) {
            accountAudit(
              tx,
              audit,
              'account.sessions_revoke',
              auth.user.id,
              `${auth.user.name} signed out ${count} other session${count === 1 ? '' : 's'}`,
            );
          }
          return count;
        });
        return { ok: true as const, revokedSessions: revoked };
      },
      { auth: true },
    )
    .post(
      '/export',
      async ({ auth, audit, body }) => {
        enforceRateLimit(deps.limiters, 'auth.export', auth.user.id, EXPORT_LIMIT);
        const user = await confirmPassword(auth.user.id, body.password);
        const memberships = db
          .select({ membership: churchMemberships, church: churches })
          .from(churchMemberships)
          .innerJoin(churches, eq(churches.id, churchMemberships.churchId))
          .where(eq(churchMemberships.userId, user.id))
          .all();
        const tables = churchTables().filter((info) => !PERSONAL_EXPORT_EXCLUDED.test(info.name));
        const exported: PersonalDataExport = {
          format: 'tatagereja-personal-data',
          exportedAt: nowIso(),
          account: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            createdAt: user.createdAt,
            twoFactorEnabled: !!enabledTwoFactor(db, user.id),
          },
          churches: memberships.map(({ membership, church }) => {
            const personIds = db
              .select({ id: people.id })
              .from(people)
              .where(and(eq(people.churchId, church.id), eq(people.userId, user.id)))
              .all()
              .map((row) => row.id);
            const records: Record<string, Record<string, unknown>[]> = {};
            for (const info of tables) {
              const churchColumn = info.columns.get('church_id');
              if (!churchColumn) continue;
              const owners: SQL[] = [];
              const authorColumn = info.columns.get(PERSONAL_EXPORT_AUTHOR_COLUMN[info.name] ?? '');
              if (authorColumn) owners.push(eq(authorColumn, user.id));
              const personColumn = info.name === 'people' ? info.columns.get('id') : null;
              if (personColumn && personIds.length > 0) {
                owners.push(inArray(personColumn, personIds));
              }
              const personRef = authorColumn ? undefined : info.columns.get('person_id');
              if (personRef && personIds.length > 0) owners.push(inArray(personRef, personIds));
              const userRef = info.columns.get('user_id');
              if (userRef && info.name !== 'people') owners.push(eq(userRef, user.id));
              if (owners.length === 0) continue;
              const rows = db
                .select()
                .from(info.table)
                .where(and(eq(churchColumn, church.id), or(...owners)))
                .all() as Record<string, unknown>[];
              if (rows.length > 0) records[info.name] = rows.map(withoutCredentials);
            }
            return {
              churchId: church.id,
              churchName: church.name,
              role: membership.role,
              status: membership.status,
              joinedAt: membership.joinedAt,
              records,
            };
          }),
          sessions: db
            .select({
              createdAt: sessions.createdAt,
              lastUsedAt: sessions.lastUsedAt,
              expiresAt: sessions.expiresAt,
              userAgent: sessions.userAgent,
              ip: sessions.ip,
            })
            .from(sessions)
            .where(eq(sessions.userId, user.id))
            .all(),
          loginEvents: db
            .select()
            .from(loginEvents)
            .where(eq(loginEvents.userId, user.id))
            .orderBy(desc(loginEvents.createdAt), desc(LOGIN_EVENT_ORDER))
            .all()
            .map(toLoginEvent),
        };
        accountAudit(
          db,
          audit,
          'account.data_export',
          user.id,
          `${user.name} downloaded their personal data`,
        );
        return exported;
      },
      { auth: true, body: passwordConfirmBodySchema },
    )
    .get(
      '/account/deletion',
      ({ auth }) => ({
        ownedChurches: ownedChurches(auth.user.id),
        twoFactorEnabled: !!enabledTwoFactor(db, auth.user.id),
      }),
      { auth: true },
    )
    .delete(
      '/account',
      async ({ auth, audit, body }) => {
        enforceRateLimit(deps.limiters, 'auth.two_factor_manage', auth.user.id, MANAGE_LIMIT);
        const owned = ownedChurches(auth.user.id);
        if (owned.length > 0) {
          throw new HttpError(
            409,
            'CONFLICT',
            `Transfer ownership of ${owned.map((church) => church.name).join(', ')} or delete ${owned.length === 1 ? 'it' : 'them'} before deleting your account`,
          );
        }
        const user = await confirmPassword(auth.user.id, body.password);
        const twoFactor = enabledTwoFactor(db, user.id);
        if (twoFactor && !body.code && !body.recoveryCode) {
          throw new HttpError(
            400,
            'TWO_FACTOR_REQUIRED',
            'Enter a code from your authenticator app to delete your account',
          );
        }
        const memberships = db
          .select({ churchId: churchMemberships.churchId, id: churchMemberships.id })
          .from(churchMemberships)
          .where(eq(churchMemberships.userId, user.id))
          .all();
        db.transaction((tx) => {
          if (twoFactor && !useSecondFactor(tx, twoFactor, body)) {
            throw invalidSecondFactor(body);
          }
          // Rows the user created that do not cascade (events, announcements, invitations…)
          // pass to the church owner, so the church keeps them.
          for (const info of churchTables()) {
            for (const column of info.blockingUserColumns) {
              tx.run(
                sql`update ${sql.identifier(info.name)} set ${sql.identifier(column)} = (select ${churches.ownerUserId} from ${churches} where ${churches.id} = ${sql.identifier(info.name)}.church_id) where ${sql.identifier(column)} = ${user.id}`,
              );
            }
          }
          for (const membership of memberships) {
            recordAudit(
              tx,
              { ...audit, churchId: membership.churchId },
              {
                module: 'admin-security',
                action: 'member.account_delete',
                entityType: 'membership',
                entityId: membership.id,
                summary: `${user.name} deleted their account`,
                before: { userId: user.id, name: user.name },
              },
            );
          }
          accountAudit(tx, audit, 'account.delete', user.id, 'An account was deleted');
          // Account-level entries are about the account alone: they keep what happened and
          // when, not who, nor from where. Church entries stay with the church's records.
          tx.update(auditLogs)
            .set({
              summary: sql`replace(${auditLogs.summary}, ${user.name}, 'A deleted account')`,
              params: {},
              before: null,
              after: null,
              ip: null,
              userAgent: null,
            })
            .where(and(isNull(auditLogs.churchId), eq(auditLogs.entityId, user.id)))
            .run();
          // Sessions, memberships, role assignments, 2FA and sign-in history cascade; person
          // records stay in the directory, unlinked.
          tx.delete(users).where(eq(users.id, user.id)).run();
        });
        return { ok: true as const };
      },
      { auth: true, body: deleteAccountBodySchema },
    );
};
