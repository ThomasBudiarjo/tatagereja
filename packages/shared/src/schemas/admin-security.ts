// Zod schemas, enums and labels owned by the admin-security module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { LIMITS } from '../constants';
import type { LocalizedText } from '../localized';
import { PERMISSION_DEFINITIONS, type AccessLike, type Permission } from '../permissions';
import { changePasswordBodySchema } from './auth';
import { idSchema, isoDateTimeSchema, paginatedSchema } from './common';

/** TOTP (RFC 6238) parameters shared by the API and the authenticator setup screen. */
export const TOTP = {
  issuer: 'TataGereja',
  algorithm: 'SHA1',
  digits: 6,
  periodSeconds: 30,
  /** Codes from this many steps before or after the current one are accepted (clock drift). */
  window: 1,
  /** Bytes of entropy in a new secret (160 bits, the RFC 4226 recommendation). */
  secretBytes: 20,
} as const;

export const ADMIN_SECURITY_LIMITS = {
  recoveryCodeCount: 10,
  /** Characters per recovery code, shown as two groups of five ("ABCDE-FGHJK"). */
  recoveryCodeLength: 10,
  challengeTtlMinutes: 5,
  challengeMaxAttempts: 5,
  loginEventsPageSizeMax: 100,
} as const;

/**
 * Progressive lockout after failed sign-ins on one account: the first `freeAttempts` failures
 * cost nothing, then each further failure doubles the wait, up to `maxDelayMinutes`.
 */
export const LOGIN_LOCKOUT_POLICY = {
  freeAttempts: 5,
  baseDelayMinutes: 1,
  maxDelayMinutes: 60,
} as const;

/** Minutes the account stays locked after `failedCount` consecutive failures (0 = not locked). */
export const lockoutDelayMinutes = (failedCount: number): number => {
  const excess = failedCount - LOGIN_LOCKOUT_POLICY.freeAttempts;
  if (excess < 0) return 0;
  return Math.min(
    LOGIN_LOCKOUT_POLICY.maxDelayMinutes,
    LOGIN_LOCKOUT_POLICY.baseDelayMinutes * 2 ** excess,
  );
};

export const LOGIN_EVENT_OUTCOMES = [
  'success',
  'failure',
  'locked',
  'two_factor_required',
  'two_factor_success',
  'two_factor_failure',
  'recovery_code_used',
] as const;
export type LoginEventOutcome = (typeof LOGIN_EVENT_OUTCOMES)[number];

export const LOGIN_EVENT_OUTCOME_LABELS: Record<LoginEventOutcome, LocalizedText> = {
  success: { en: 'Signed in', id: 'Berhasil masuk' },
  failure: { en: 'Wrong password', id: 'Kata sandi salah' },
  locked: { en: 'Blocked: account locked', id: 'Diblokir: akun terkunci' },
  two_factor_required: {
    en: 'Password accepted, code requested',
    id: 'Kata sandi benar, kode diminta',
  },
  two_factor_success: { en: 'Signed in with 2FA', id: 'Masuk dengan verifikasi dua langkah' },
  two_factor_failure: { en: 'Wrong 2FA code', id: 'Kode verifikasi salah' },
  recovery_code_used: { en: 'Signed in with a recovery code', id: 'Masuk dengan kode pemulihan' },
};

/** Six digits from an authenticator app; spaces are ignored. */
export const totpCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'));

/** A recovery code; case, spaces and dashes are ignored. */
export const recoveryCodeSchema = z
  .string()
  .max(LIMITS.codeMax)
  .transform((value) => value.replace(/[\s-]+/g, '').toUpperCase())
  .pipe(
    z
      .string()
      .length(ADMIN_SECURITY_LIMITS.recoveryCodeLength, 'Enter the recovery code')
      .regex(/^[A-Z0-9]+$/),
  );

export const twoFactorStatusSchema = z.object({
  enabled: z.boolean(),
  enabledAt: isoDateTimeSchema.nullable(),
  /** Unused recovery codes left. */
  recoveryCodesRemaining: z.number().int().nonnegative(),
  /** Churches whose security policy requires 2FA from this account. */
  requiredByChurchIds: z.array(idSchema),
});
export type TwoFactorStatus = z.infer<typeof twoFactorStatusSchema>;

/** Starting setup returns the secret once, for the QR code and manual entry. */
export const twoFactorSetupSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
});
export type TwoFactorSetup = z.infer<typeof twoFactorSetupSchema>;

export const twoFactorSetupBodySchema = z.object({
  password: z.string().min(1).max(LIMITS.passwordMax),
});
export type TwoFactorSetupBody = z.infer<typeof twoFactorSetupBodySchema>;

export const twoFactorEnableBodySchema = z.object({ code: totpCodeSchema });
export type TwoFactorEnableBody = z.infer<typeof twoFactorEnableBodySchema>;

/** Recovery codes are shown exactly once, when generated. */
export const recoveryCodesSchema = z.object({ recoveryCodes: z.array(z.string()) });
export type RecoveryCodes = z.infer<typeof recoveryCodesSchema>;

/** Disabling 2FA or regenerating recovery codes needs the password and a current code. */
export const twoFactorConfirmBodySchema = z.object({
  password: z.string().min(1).max(LIMITS.passwordMax),
  code: totpCodeSchema,
});
export type TwoFactorConfirmBody = z.infer<typeof twoFactorConfirmBodySchema>;

/** Answer to a correct password when the account has 2FA: the client asks for the code next. */
export const loginChallengeSchema = z.object({
  twoFactorRequired: z.literal(true),
  challengeToken: z.string(),
  expiresAt: isoDateTimeSchema,
});
export type LoginChallenge = z.infer<typeof loginChallengeSchema>;

export const loginTwoFactorBodySchema = z
  .object({
    challengeToken: z.string().trim().min(1).max(LIMITS.tokenMax),
    code: totpCodeSchema.optional(),
    recoveryCode: recoveryCodeSchema.optional(),
  })
  .refine((value) => !!value.code !== !!value.recoveryCode, {
    message: 'Enter either the authenticator code or a recovery code',
    path: ['code'],
  });
export type LoginTwoFactorBody = z.infer<typeof loginTwoFactorBodySchema>;

export const loginEventSchema = z.object({
  id: idSchema,
  outcome: z.enum(LOGIN_EVENT_OUTCOMES),
  reason: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type LoginEvent = z.infer<typeof loginEventSchema>;

export const loginEventListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_SECURITY_LIMITS.loginEventsPageSizeMax)
    .default(20),
});
export type LoginEventListQuery = z.infer<typeof loginEventListQuerySchema>;

export const loginEventListSchema = paginatedSchema(loginEventSchema);
export type LoginEventList = z.infer<typeof loginEventListSchema>;

/** Changing the password signs out every other session unless the member chooses otherwise. */
export const securePasswordChangeBodySchema = changePasswordBodySchema.extend({
  revokeOtherSessions: z.boolean().default(true),
});
export type SecurePasswordChangeBody = z.infer<typeof securePasswordChangeBodySchema>;

export const PASSWORD_STRENGTHS = ['very_weak', 'weak', 'fair', 'good', 'strong'] as const;
export type PasswordStrength = (typeof PASSWORD_STRENGTHS)[number];

export const PASSWORD_STRENGTH_LABELS: Record<PasswordStrength, LocalizedText> = {
  very_weak: { en: 'Very weak', id: 'Sangat lemah' },
  weak: { en: 'Weak', id: 'Lemah' },
  fair: { en: 'Fair', id: 'Cukup' },
  good: { en: 'Good', id: 'Baik' },
  strong: { en: 'Strong', id: 'Kuat' },
};

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'iloveyou',
  'admin123',
  'tuhanyesus',
  'yesuskristus',
  'haleluya',
  'gereja123',
]);

/**
 * A quick, dependency-free strength estimate for the password meter: length, character
 * variety, repeats and well-known passwords. Score 0 (very weak) … 4 (strong).
 */
export const passwordStrength = (
  password: string,
): { score: 0 | 1 | 2 | 3 | 4; strength: PasswordStrength } => {
  const lower = password.toLowerCase();
  let points = 0;
  if (password.length >= LIMITS.passwordMin) points += 1;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password));
  if (classes.length >= 3) points += 1;
  if (classes.length === 4) points += 1;
  if (/(.)\1{2,}/.test(password)) points -= 1;
  if (/^\d+$/.test(password)) points -= 1;
  if (COMMON_PASSWORDS.has(lower) || password.length < LIMITS.passwordMin) points = 0;
  const score = Math.max(0, Math.min(4, points)) as 0 | 1 | 2 | 3 | 4;
  return { score, strength: PASSWORD_STRENGTHS[score] ?? 'very_weak' };
};

/**
 * Church security policy, stored in `churches.settings['admin-security']`. Only the owner
 * (`security.manage`) changes it.
 */
export const churchSecurityPolicySchema = z.object({
  /** Members holding any management permission must turn on 2FA to open the church. */
  requireTwoFactorForManagers: z.boolean().default(false),
});
export type ChurchSecurityPolicy = z.infer<typeof churchSecurityPolicySchema>;

export const updateChurchSecurityPolicyBodySchema = churchSecurityPolicySchema;

/**
 * Permissions every member holds by default are not "management"; holding anything else
 * (people.edit, finance.view, roles.manage, ...) makes the 2FA policy apply.
 */
const MEMBER_DEFAULT_PERMISSIONS = new Set<Permission>(
  PERMISSION_DEFINITIONS.filter((definition) => definition.memberDefault).map(
    (definition) => definition.key,
  ),
);

export const holdsManagementPermission = (access: Pick<AccessLike, 'permissions'>): boolean =>
  access.permissions.some((permission) => !MEMBER_DEFAULT_PERMISSIONS.has(permission));

export const deleteAccountBodySchema = z.object({
  password: z.string().min(1).max(LIMITS.passwordMax),
});
export type DeleteAccountBody = z.infer<typeof deleteAccountBodySchema>;

/** Transferring ownership asks the owner to type the church name, in addition to the password. */
export const confirmTransferOwnershipBodySchema = z.object({
  userId: idSchema,
  password: z.string().min(1).max(LIMITS.passwordMax),
  confirmName: z.string().trim().min(1).max(LIMITS.nameMax),
});
export type ConfirmTransferOwnershipBody = z.infer<typeof confirmTransferOwnershipBodySchema>;

/** "Download my data": the account and the caller's own records in every church. */
export const personalDataExportSchema = z.object({
  exportedAt: isoDateTimeSchema,
  account: z.object({
    id: idSchema,
    email: z.string(),
    name: z.string(),
    createdAt: isoDateTimeSchema,
  }),
  churches: z.array(
    z.object({
      churchId: idSchema,
      churchName: z.string(),
      role: z.string(),
      joinedAt: isoDateTimeSchema,
      /** The caller's person record and the rows each module holds about them. */
      records: z.record(z.string(), z.unknown()),
    }),
  ),
  loginEvents: z.array(loginEventSchema),
});
export type PersonalDataExport = z.infer<typeof personalDataExportSchema>;

/** The owner's church backup: every church-owned table, keyed by table name. */
export const churchBackupSchema = z.object({
  format: z.literal('tatagereja-backup'),
  version: z.number().int().min(1),
  exportedAt: isoDateTimeSchema,
  churchId: idSchema,
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type ChurchBackup = z.infer<typeof churchBackupSchema>;

/** Members screen filters. */
export const memberListQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  role: z.enum(['owner', 'administrator', 'member']).optional(),
  roleId: idSchema.optional(),
  status: z.enum(['active', 'suspended']).optional(),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;
