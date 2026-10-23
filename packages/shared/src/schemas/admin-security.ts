// Zod schemas, enums and labels owned by the admin-security module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { CHURCH_ROLES, LIMITS, MEMBERSHIP_STATUSES } from '../constants';
import type { LocalizedText } from '../localized';
import { MODULE_IDS, type ModuleId } from '../modules';
import {
  GRANTABLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  canGrant,
  has,
  normalizePermissions,
  type AccessLike,
  type Permission,
  type PermissionDefinition,
} from '../permissions';
import { auditLogQuerySchema, auditLogSchema } from './audit';
import {
  SESSION_TRANSPORTS,
  authResponseSchema,
  changePasswordBodySchema,
  emailSchema,
  passwordSchema,
  userSummarySchema,
} from './auth';
import { membershipSchema } from './church';
import { idSchema, isoDateSchema, isoDateTimeSchema, paginatedSchema } from './common';
import { memberPermissionsSchema } from './role';

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
  /** Sign-in history older than this is pruned. */
  loginEventsRetentionDays: 365,
  membersPageSizeMax: 200,
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
  /** A refresh token was used twice: someone copied it, so the session was ended. */
  'refresh_reuse',
  'password_reset',
  'password_reset_failure',
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
  refresh_reuse: {
    en: 'Session ended: a copied sign-in was used',
    id: 'Sesi diakhiri: salinan sesi masuk dipakai',
  },
  password_reset: { en: 'Password reset', id: 'Kata sandi diatur ulang' },
  password_reset_failure: {
    en: 'Password reset refused',
    id: 'Atur ulang kata sandi ditolak',
  },
};

/** Outcomes that mean someone failed to get in; the UI colours them as warnings. */
export const FAILED_LOGIN_OUTCOMES: readonly LoginEventOutcome[] = [
  'failure',
  'locked',
  'two_factor_failure',
  'refresh_reuse',
  'password_reset_failure',
];

/** Six digits from an authenticator app; spaces are ignored. */
export const totpCodeSchema = z
  .string()
  .max(LIMITS.codeMax)
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
      .regex(/^[A-Z0-9]+$/, 'Enter the recovery code'),
  );

/** Shows a stored recovery code as two groups of five: `ABCDE-FGHJK`. */
export const formatRecoveryCode = (code: string): string =>
  code.length === ADMIN_SECURITY_LIMITS.recoveryCodeLength
    ? `${code.slice(0, 5)}-${code.slice(5)}`
    : code;

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

/**
 * Disabling 2FA, regenerating recovery codes or deleting a protected account needs the
 * password and a second factor: a current authenticator code, or one unused recovery code
 * (for people who lost their phone).
 */
export const twoFactorConfirmBodySchema = z
  .object({
    password: z.string().min(1).max(LIMITS.passwordMax),
    code: totpCodeSchema.optional(),
    recoveryCode: recoveryCodeSchema.optional(),
  })
  .refine((value) => !!value.code !== !!value.recoveryCode, {
    message: 'Enter either the authenticator code or a recovery code',
    path: ['code'],
  });
export type TwoFactorConfirmBody = z.infer<typeof twoFactorConfirmBodySchema>;

/** Answer to a correct password when the account has 2FA: the client asks for the code next. */
export const loginChallengeSchema = z.object({
  twoFactorRequired: z.literal(true),
  challengeToken: z.string(),
  expiresAt: isoDateTimeSchema,
});
export type LoginChallenge = z.infer<typeof loginChallengeSchema>;

/** `POST /auth/login` answers with a session, or with a challenge when the account has 2FA. */
export const loginResponseSchema = z.union([loginChallengeSchema, authResponseSchema]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const isLoginChallenge = (value: LoginResponse): value is LoginChallenge =>
  'twoFactorRequired' in value && value.twoFactorRequired === true;

export const loginTwoFactorBodySchema = z
  .object({
    challengeToken: z.string().trim().min(1).max(LIMITS.tokenMax),
    code: totpCodeSchema.optional(),
    recoveryCode: recoveryCodeSchema.optional(),
    transport: z.enum(SESSION_TRANSPORTS).default('bearer'),
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
  /** `failed` keeps only failed attempts (wrong password, wrong code, blocked). */
  outcome: z.enum(['all', 'failed']).default('all'),
});
export type LoginEventListQuery = z.infer<typeof loginEventListQuerySchema>;

export const loginEventListSchema = paginatedSchema(loginEventSchema);
export type LoginEventList = z.infer<typeof loginEventListSchema>;

/**
 * Changing the password always signs out every other session, and gives this one new
 * credentials (`session` in the answer).
 */
export const securePasswordChangeBodySchema = changePasswordBodySchema;
export type SecurePasswordChangeBody = z.infer<typeof securePasswordChangeBodySchema>;

export const passwordChangeResponseSchema = z.object({
  ok: z.literal(true),
  /** Other sessions signed out by the change. */
  revokedSessions: z.number().int().nonnegative(),
  session: authResponseSchema,
});

/** Turning two-step verification on: the recovery codes (shown once) and rotated credentials. */
export const twoFactorEnabledSchema = z.object({
  recoveryCodes: z.array(z.string()),
  revokedSessions: z.number().int().nonnegative(),
  session: authResponseSchema,
});
export type TwoFactorEnabled = z.infer<typeof twoFactorEnabledSchema>;

export const twoFactorDisabledSchema = z.object({
  ok: z.literal(true),
  revokedSessions: z.number().int().nonnegative(),
  session: authResponseSchema,
});

export const revokeSessionsResponseSchema = z.object({
  ok: z.literal(true),
  revokedSessions: z.number().int().nonnegative(),
});

/** Admin-assisted password reset links work this long, and once. */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/** The administrator confirms they checked who is asking (in person, by phone). */
export const createPasswordResetBodySchema = z.object({
  identityConfirmed: z.literal(true, 'Confirm that you checked who is asking'),
});
export type CreatePasswordResetBody = z.infer<typeof createPasswordResetBodySchema>;

/** The link is shown once; only its hash is stored. */
export const passwordResetLinkSchema = z.object({
  url: z.string(),
  token: z.string(),
  expiresAt: isoDateTimeSchema,
  /** The member also needs a code from their authenticator (or a recovery code) to use it. */
  twoFactorRequired: z.boolean(),
});
export type PasswordResetLink = z.infer<typeof passwordResetLinkSchema>;

/** What the reset page shows before a new password is chosen. */
export const passwordResetPreviewSchema = z.object({
  name: z.string(),
  /** Partly hidden, e.g. `ru***@example.com`. */
  email: z.string(),
  expiresAt: isoDateTimeSchema,
  twoFactorRequired: z.boolean(),
});
export type PasswordResetPreview = z.infer<typeof passwordResetPreviewSchema>;

export const passwordResetTokenParamsSchema = z.object({
  token: z.string().trim().min(1).max(LIMITS.tokenMax),
});

export const completePasswordResetBodySchema = z.object({
  token: z.string().trim().min(1).max(LIMITS.tokenMax),
  newPassword: passwordSchema,
  code: totpCodeSchema.optional(),
  recoveryCode: recoveryCodeSchema.optional(),
});
export type CompletePasswordResetBody = z.infer<typeof completePasswordResetBodySchema>;

/** Self-service reset for accounts with two-step verification: one unused recovery code. */
export const recoveryPasswordResetBodySchema = z.object({
  email: emailSchema,
  recoveryCode: recoveryCodeSchema,
  newPassword: passwordSchema,
});
export type RecoveryPasswordResetBody = z.infer<typeof recoveryPasswordResetBodySchema>;

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

/** What would make a password stronger, for the hints under the meter. */
export const PASSWORD_HINTS = ['length', 'mixedCase', 'number', 'symbol', 'common'] as const;
export type PasswordHint = (typeof PASSWORD_HINTS)[number];

export const passwordHints = (password: string): PasswordHint[] => {
  const hints: PasswordHint[] = [];
  if (password.length < 12) hints.push('length');
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) hints.push('mixedCase');
  if (!/\d/.test(password)) hints.push('number');
  if (!/[^A-Za-z0-9]/.test(password)) hints.push('symbol');
  if (COMMON_PASSWORDS.has(password.toLowerCase())) hints.push('common');
  return hints;
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

export const updateChurchSecurityPolicyBodySchema = z.object({
  requireTwoFactorForManagers: z.boolean(),
});
export type UpdateChurchSecurityPolicyBody = z.infer<typeof updateChurchSecurityPolicyBodySchema>;

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

/** Whether the church policy asks this member for 2FA. */
export const twoFactorRequiredFor = (
  policy: ChurchSecurityPolicy,
  access: Pick<AccessLike, 'permissions'>,
): boolean => policy.requireTwoFactorForManagers && holdsManagementPermission(access);

export const securityPolicyResponseSchema = z.object({
  policy: churchSecurityPolicySchema,
  /** The policy asks the caller for 2FA. */
  appliesToYou: z.boolean(),
  /** The caller has 2FA turned on. */
  twoFactorEnabled: z.boolean(),
});
export type SecurityPolicyResponse = z.infer<typeof securityPolicyResponseSchema>;

export const deleteAccountBodySchema = z.object({
  password: z.string().min(1).max(LIMITS.passwordMax),
  /** Required when the account has 2FA: a current code or an unused recovery code. */
  code: totpCodeSchema.optional(),
  recoveryCode: recoveryCodeSchema.optional(),
});
export type DeleteAccountBody = z.infer<typeof deleteAccountBodySchema>;

/** Re-entering the password before downloading personal data or a church backup. */
export const passwordConfirmBodySchema = z.object({
  password: z.string().min(1).max(LIMITS.passwordMax),
});
export type PasswordConfirmBody = z.infer<typeof passwordConfirmBodySchema>;

/**
 * Transferring ownership asks the owner to type the church name, in addition to the password.
 * `confirmName` is checked whenever it is sent; the interface always sends it.
 */
export const confirmTransferOwnershipBodySchema = z.object({
  userId: idSchema,
  password: z.string().min(1).max(LIMITS.passwordMax),
  confirmName: z.string().trim().min(1).max(LIMITS.nameMax).optional(),
});
export type ConfirmTransferOwnershipBody = z.infer<typeof confirmTransferOwnershipBodySchema>;

/** Compares a typed church name with the real one, ignoring case and surrounding spaces. */
export const namesMatch = (typed: string, actual: string): boolean =>
  typed.trim().toLocaleLowerCase() === actual.trim().toLocaleLowerCase();

/** "Download my data": the account and the caller's own records in every church. */
export const personalDataExportSchema = z.object({
  format: z.literal('tatagereja-personal-data'),
  exportedAt: isoDateTimeSchema,
  account: z.object({
    id: idSchema,
    email: z.string(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
    createdAt: isoDateTimeSchema,
    twoFactorEnabled: z.boolean(),
  }),
  churches: z.array(
    z.object({
      churchId: idSchema,
      churchName: z.string(),
      role: z.string(),
      status: z.string(),
      joinedAt: isoDateTimeSchema,
      /** The caller's person records and the rows each table holds about them, by table. */
      records: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
    }),
  ),
  sessions: z.array(z.record(z.string(), z.unknown())),
  loginEvents: z.array(loginEventSchema),
});
export type PersonalDataExport = z.infer<typeof personalDataExportSchema>;

/** The owner's church backup: every church-owned table, keyed by table name. */
export const churchBackupSchema = z.object({
  format: z.literal('tatagereja-backup'),
  version: z.number().int().min(1),
  exportedAt: isoDateTimeSchema,
  churchId: idSchema,
  churchName: z.string(),
  /** Credentials (invitation tokens, token hashes) are left out. */
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type ChurchBackup = z.infer<typeof churchBackupSchema>;

/** Why an account cannot be deleted yet: churches it still owns. */
export const accountDeletionBlockersSchema = z.object({
  ownedChurches: z.array(z.object({ id: idSchema, name: z.string() })),
  twoFactorEnabled: z.boolean(),
});
export type AccountDeletionBlockers = z.infer<typeof accountDeletionBlockersSchema>;

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

export const MEMBER_SORTS = ['name', '-name', 'joinedAt', '-joinedAt', 'role'] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

/** Members screen filters. */
export const memberListQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  role: z.enum(CHURCH_ROLES).optional(),
  roleId: idSchema.optional(),
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
  /** `off` keeps members holding management permissions without 2FA. */
  twoFactor: z.enum(['on', 'off']).optional(),
  sort: z.enum(MEMBER_SORTS).default('name'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_SECURITY_LIMITS.membersPageSizeMax)
    .default(ADMIN_SECURITY_LIMITS.membersPageSizeMax),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

export const memberListItemSchema = membershipSchema.extend({
  suspendedAt: isoDateTimeSchema.nullable(),
  /** The account has 2FA; null unless the caller may see security details (`security.view`). */
  twoFactorEnabled: z.boolean().nullable(),
  /** Holds permissions beyond the member defaults (the 2FA policy applies). */
  manager: z.boolean(),
  /** Leads at least one group. */
  isLeader: z.boolean(),
  personId: idSchema.nullable(),
});
export type MemberListItem = z.infer<typeof memberListItemSchema>;

export const memberListSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  suspended: z.number().int().nonnegative(),
  byRole: z.record(z.enum(CHURCH_ROLES), z.number().int().nonnegative()),
  /** Managers without 2FA, whom the security policy would stop; null without `security.view`. */
  managersWithoutTwoFactor: z.number().int().nonnegative().nullable(),
});
export type MemberListSummary = z.infer<typeof memberListSummarySchema>;

export const memberListSchema = paginatedSchema(memberListItemSchema).extend({
  summary: memberListSummarySchema,
});
export type MemberList = z.infer<typeof memberListSchema>;

export const memberDetailSchema = z.object({
  membership: memberListItemSchema,
  permissions: memberPermissionsSchema,
  leaderGroups: z.array(z.object({ id: idSchema, name: z.string() })),
  person: z.object({ id: idSchema, name: z.string() }).nullable(),
  lastActiveAt: isoDateTimeSchema.nullable(),
});
export type MemberDetail = z.infer<typeof memberDetailSchema>;

export const roleMembersSchema = z.object({
  items: z.array(
    z.object({
      membershipId: idSchema,
      role: z.enum(CHURCH_ROLES),
      status: z.enum(MEMBERSHIP_STATUSES),
      user: userSummarySchema,
      assignedAt: isoDateTimeSchema,
    }),
  ),
});
export type RoleMembers = z.infer<typeof roleMembersSchema>;

// ---------------------------------------------------------------------------------------------
// Roles: shared helpers for the editor and its preview
// ---------------------------------------------------------------------------------------------

/** Permissions the caller may switch on or off in a custom role (anti-escalation). */
export const grantablePermissionsFor = (access: AccessLike): Permission[] =>
  GRANTABLE_PERMISSIONS.filter((permission) => canGrant(access, [permission]));

/** Added and removed permissions between two versions of a role. */
export const permissionDiff = (
  before: readonly Permission[],
  after: readonly Permission[],
): { added: Permission[]; removed: Permission[] } => ({
  added: normalizePermissions(after.filter((permission) => !before.includes(permission))),
  removed: normalizePermissions(before.filter((permission) => !after.includes(permission))),
});

export type RolePreviewGroup = {
  module: ModuleId;
  label: LocalizedText;
  permissions: readonly PermissionDefinition<Permission>[];
};

/** "What this role can do": its permissions grouped by module, in catalog order. */
export const rolePreview = (permissions: readonly Permission[]): RolePreviewGroup[] =>
  PERMISSION_GROUPS.map((group) => ({
    module: group.module,
    label: group.label,
    permissions: group.permissions.filter((definition) => permissions.includes(definition.key)),
  })).filter((group) => group.permissions.length > 0);

/** Sensitive permissions in a list, so the editor can warn before saving. */
export const sensitivePermissions = (permissions: readonly Permission[]): Permission[] =>
  PERMISSION_DEFINITIONS.filter(
    (definition) => definition.sensitive && permissions.includes(definition.key),
  ).map((definition) => definition.key);

/** Whether the caller may see the members screen's security columns. */
export const canViewSecurity = (access: AccessLike): boolean =>
  has(access, 'security.view') || has(access, 'security.manage');

// ---------------------------------------------------------------------------------------------
// Audit log viewer
// ---------------------------------------------------------------------------------------------

/**
 * Audit log filters for the viewer: the shared query plus calendar days (`YYYY-MM-DD`) that
 * the API resolves in the church time zone.
 */
export const auditLogFilterSchema = auditLogQuerySchema.extend({
  fromDate: isoDateSchema.optional(),
  toDate: isoDateSchema.optional(),
});
export type AuditLogFilter = z.infer<typeof auditLogFilterSchema>;

/** The CSV export takes the same filters without paging. */
export const auditLogExportQuerySchema = auditLogFilterSchema.omit({
  page: true,
  limit: true,
  cursor: true,
});
export type AuditLogExportQuery = z.infer<typeof auditLogExportQuerySchema>;

export const auditLogFacetsSchema = z.object({
  actors: z.array(z.object({ id: idSchema, name: z.string() })),
  modules: z.array(z.enum(MODULE_IDS)),
  actions: z.array(z.string()),
  entityTypes: z.array(z.string()),
});
export type AuditLogFacets = z.infer<typeof auditLogFacetsSchema>;

export const auditLogDetailSchema = z.object({ entry: auditLogSchema });

/** One changed field of an audit entry, for the before/after view. */
export type AuditChange = { field: string; before: unknown; after: unknown };

/**
 * The fields an entry changed, comparing its before and after snapshots. Creations list every
 * after field, deletions every before field.
 */
export const auditChanges = (before: unknown, after: unknown): AuditChange[] => {
  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const left = asRecord(before);
  const right = asRecord(after);
  const fields = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return fields
    .filter((field) => JSON.stringify(left[field] ?? null) !== JSON.stringify(right[field] ?? null))
    .map((field) => ({ field, before: left[field] ?? null, after: right[field] ?? null }));
};

// ---------------------------------------------------------------------------------------------
// Security overview
// ---------------------------------------------------------------------------------------------

export const securityOverviewSchema = z.object({
  policy: churchSecurityPolicySchema,
  members: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    suspended: z.number().int().nonnegative(),
  }),
  /** Present for callers holding `security.view`. */
  twoFactor: z
    .object({
      managers: z.number().int().nonnegative(),
      managersWithTwoFactor: z.number().int().nonnegative(),
      withoutTwoFactor: z.array(
        z.object({ membershipId: idSchema, user: userSummarySchema, role: z.enum(CHURCH_ROLES) }),
      ),
    })
    .nullable(),
  customRoles: z.number().int().nonnegative(),
  /** Present for callers holding `audit.view`. */
  audit: z
    .object({
      last7Days: z.number().int().nonnegative(),
      recent: z.array(auditLogSchema),
    })
    .nullable(),
});
export type SecurityOverview = z.infer<typeof securityOverviewSchema>;
