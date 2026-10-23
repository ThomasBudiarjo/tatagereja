import {
  ADMIN_SECURITY_LIMITS,
  LOGIN_LOCKOUT_POLICY,
  churchSecurityPolicySchema,
  lockoutDelayMinutes,
  twoFactorRequiredFor,
  type LoginEventOutcome,
} from '@tatagereja/shared';
import { and, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import type { AppConfig } from '../../config';
import type { Queryable } from '../../db/client';
import type { UserRow, UserTwoFactorRow } from '../../db/schema';
import {
  churches,
  churchMemberships,
  loginEvents,
  userRecoveryCodes,
  userTwoFactor,
  users,
} from '../../db/schema';
import { HttpError, validationError } from '../../lib/errors';
import type { RequestMeta } from '../../lib/request';
import { addDays, nowIso } from '../../lib/time';
import { UNAMBIGUOUS_ALPHABET, generateCode, hashToken, newId } from '../../lib/tokens';
import { loadAccess } from '../../services/access';
import { moduleSettings } from '../../services/modules';
import { notify } from '../../services/notifications';
import { decryptSecret } from './secrets';
import { verifyTotp } from './totp';

/** The enabled second factor of an account, or null. */
export const enabledTwoFactor = (db: Queryable, userId: string): UserTwoFactorRow | null =>
  db
    .select()
    .from(userTwoFactor)
    .where(and(eq(userTwoFactor.userId, userId), isNotNull(userTwoFactor.enabledAt)))
    .get() ?? null;

/** Users of a list that have 2FA turned on. */
export const usersWithTwoFactor = (db: Queryable, userIds?: readonly string[]): Set<string> => {
  if (userIds && userIds.length === 0) return new Set();
  const conditions = [isNotNull(userTwoFactor.enabledAt)];
  if (userIds) conditions.push(inArray(userTwoFactor.userId, [...userIds]));
  return new Set(
    db
      .select({ userId: userTwoFactor.userId })
      .from(userTwoFactor)
      .where(and(...conditions))
      .all()
      .map((row) => row.userId),
  );
};

export const unusedRecoveryCodes = (db: Queryable, userId: string): number =>
  db
    .select({ id: userRecoveryCodes.id })
    .from(userRecoveryCodes)
    .where(and(eq(userRecoveryCodes.userId, userId), isNull(userRecoveryCodes.usedAt)))
    .all().length;

/** Replaces the account's recovery codes and returns the new ones (shown once). */
export function issueRecoveryCodes(db: Queryable, userId: string): string[] {
  const codes = new Set<string>();
  while (codes.size < ADMIN_SECURITY_LIMITS.recoveryCodeCount) {
    codes.add(generateCode(ADMIN_SECURITY_LIMITS.recoveryCodeLength, UNAMBIGUOUS_ALPHABET));
  }
  const now = nowIso();
  db.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId)).run();
  db.insert(userRecoveryCodes)
    .values(
      [...codes].map((code) => ({
        id: newId(),
        userId,
        codeHash: hashToken(code),
        createdAt: now,
      })),
    )
    .run();
  return [...codes];
}

export type SecondFactor = { code?: string; recoveryCode?: string };
export type SecondFactorResult = { method: 'totp' | 'recovery'; remainingRecoveryCodes: number };

/**
 * Checks a TOTP code (refusing one already used in its window) or consumes a recovery code.
 * Returns null when neither is valid. Run it inside the transaction of the action it guards.
 */
export function useSecondFactor(
  db: Queryable,
  config: Pick<AppConfig, 'databasePath'>,
  row: UserTwoFactorRow,
  factor: SecondFactor,
): SecondFactorResult | null {
  if (factor.code) {
    const secret = decryptSecret(config, row.secretEncrypted);
    if (!secret) return null;
    const step = verifyTotp(secret, factor.code);
    if (step === null || (row.lastUsedStep !== null && step <= row.lastUsedStep)) return null;
    db.update(userTwoFactor)
      .set({ lastUsedStep: step, updatedAt: nowIso() })
      .where(eq(userTwoFactor.userId, row.userId))
      .run();
    return { method: 'totp', remainingRecoveryCodes: unusedRecoveryCodes(db, row.userId) };
  }
  if (factor.recoveryCode) {
    const used = db
      .update(userRecoveryCodes)
      .set({ usedAt: nowIso() })
      .where(
        and(
          eq(userRecoveryCodes.userId, row.userId),
          eq(userRecoveryCodes.codeHash, hashToken(factor.recoveryCode)),
          isNull(userRecoveryCodes.usedAt),
        ),
      )
      .returning({ id: userRecoveryCodes.id })
      .get();
    if (!used) return null;
    return { method: 'recovery', remainingRecoveryCodes: unusedRecoveryCodes(db, row.userId) };
  }
  return null;
}

/** 422 on the field that holds the wrong code, so forms can show it in place. */
export const invalidSecondFactor = (factor: SecondFactor) => {
  const path = factor.recoveryCode ? 'recoveryCode' : 'code';
  const message = factor.recoveryCode
    ? 'This recovery code is not valid or was already used'
    : 'The code is not valid. Check the time on your phone and try again';
  return validationError(message, [{ path, message }]);
};

/**
 * Re-entering the password behind a signed-in session (change password, delete church,
 * transfer ownership) is limited per account, so a stolen session cannot guess it.
 */
export const PASSWORD_CHECK_LIMIT = { windowMs: 15 * 60_000, max: 10 };

export const passwordIncorrect = () =>
  validationError('Password is incorrect', [
    { path: 'password', message: 'Password is incorrect' },
  ]);

// ---------------------------------------------------------------------------------------------
// Sign-in history and lockout
// ---------------------------------------------------------------------------------------------

export function recordLoginEvent(
  db: Queryable,
  entry: {
    userId: string | null;
    email: string;
    outcome: LoginEventOutcome;
    reason?: string | null;
    meta: RequestMeta;
  },
): void {
  const now = new Date();
  db.insert(loginEvents)
    .values({
      id: newId(),
      userId: entry.userId,
      email: entry.email.slice(0, 254),
      outcome: entry.outcome,
      reason: entry.reason ?? null,
      ip: entry.meta.ip,
      userAgent: entry.meta.userAgent,
      createdAt: now.toISOString(),
    })
    .run();
  // Old history is pruned as it grows: per account, or per address tried for unknown ones.
  const cutoff = addDays(now, -ADMIN_SECURITY_LIMITS.loginEventsRetentionDays).toISOString();
  db.delete(loginEvents)
    .where(
      and(
        entry.userId
          ? eq(loginEvents.userId, entry.userId)
          : and(isNull(loginEvents.userId), eq(loginEvents.email, entry.email.slice(0, 254))),
        lt(loginEvents.createdAt, cutoff),
      ),
    )
    .run();
}

/** Failures older than this no longer count towards a lockout. */
const FAILURE_MEMORY_MS = 24 * 60 * 60 * 1000;

export const lockedUntilOf = (user: Pick<UserRow, 'lockedUntil'>, now = Date.now()): Date | null =>
  user.lockedUntil && new Date(user.lockedUntil).getTime() > now
    ? new Date(user.lockedUntil)
    : null;

export const accountLocked = (until: Date) => {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return new HttpError(
    429,
    'ACCOUNT_LOCKED',
    `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}`,
  );
};

/**
 * Counts one failed sign-in on an account and locks it progressively. Returns the lock end
 * when this failure locked the account. The account owner is told the first time it locks.
 */
export function registerLoginFailure(
  db: Queryable,
  user: UserRow,
  outcome: 'failure' | 'two_factor_failure',
  meta: RequestMeta,
): Date | null {
  const now = Date.now();
  const recent =
    user.lastFailedLoginAt && now - new Date(user.lastFailedLoginAt).getTime() < FAILURE_MEMORY_MS;
  const failedCount = (recent ? user.failedLoginCount : 0) + 1;
  const delay = lockoutDelayMinutes(failedCount);
  const lockedUntil = delay > 0 ? new Date(now + delay * 60_000) : null;
  db.update(users)
    .set({
      failedLoginCount: failedCount,
      lastFailedLoginAt: new Date(now).toISOString(),
      lockedUntil: lockedUntil?.toISOString() ?? null,
    })
    .where(eq(users.id, user.id))
    .run();
  recordLoginEvent(db, {
    userId: user.id,
    email: user.email,
    outcome,
    reason: lockedUntil ? `locked_${delay}m` : null,
    meta,
  });
  if (lockedUntil && failedCount === LOGIN_LOCKOUT_POLICY.freeAttempts) {
    notify(db, {
      churchId: null,
      userIds: [user.id],
      type: 'account.locked',
      title: 'Sign-in to your account was paused',
      body: `${failedCount} wrong attempts in a row. If this was not you, change your password and turn on two-step verification.`,
      link: '/profile?tab=activity',
      entityType: 'user',
      entityId: user.id,
    });
  }
  return lockedUntil;
}

export function clearLoginFailures(db: Queryable, userId: string): void {
  db.update(users)
    .set({ failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null })
    .where(eq(users.id, userId))
    .run();
}

// ---------------------------------------------------------------------------------------------
// Church policy
// ---------------------------------------------------------------------------------------------

/** Active churches whose security policy asks this account for 2FA. */
export function churchesRequiringTwoFactor(db: Queryable, userId: string): string[] {
  const rows = db
    .select({ church: churches, membership: churchMemberships })
    .from(churchMemberships)
    .innerJoin(churches, eq(churches.id, churchMemberships.churchId))
    .where(and(eq(churchMemberships.userId, userId), eq(churchMemberships.status, 'active')))
    .all();
  return rows
    .filter((row) => {
      const policy = moduleSettings(row.church, 'admin-security', churchSecurityPolicySchema);
      if (!policy.requireTwoFactorForManagers) return false;
      return twoFactorRequiredFor(policy, loadAccess(db, row.church, row.membership));
    })
    .map((row) => row.church.id);
}
