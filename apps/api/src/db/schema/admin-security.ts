// Tables owned by the admin-security module. Every church-owned table carries `church_id` with
// `onDelete: 'cascade'`; see docs/ARCHITECTURE-MODULES.md. Export row types next to the tables.
// These tables belong to accounts, not churches: they cascade from `users` instead.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { churches, users } from './core';
import { encryptedText } from '../encrypted';

/**
 * TOTP (RFC 6238) second factor. `enabled_at` stays null while setup waits for the first valid
 * code. The secret is stored encrypted (never returned after setup); `last_used_step` refuses
 * replaying a code inside its 30-second window.
 */
export const userTwoFactor = sqliteTable('user_two_factor', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretEncrypted: encryptedText('user_two_factor', 'secret_encrypted').notNull(),
  enabledAt: text('enabled_at'),
  lastUsedStep: integer('last_used_step'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** One-time recovery codes, stored as hashes. A used code keeps its row with `used_at`. */
export const userRecoveryCodes = sqliteTable(
  'user_recovery_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('user_recovery_codes_user_hash_unique').on(table.userId, table.codeHash),
    index('user_recovery_codes_user_idx').on(table.userId),
  ],
);

/**
 * The short-lived second step of a sign-in: the password was right and the account has 2FA.
 * The client receives the raw token once; only its hash is stored.
 */
export const twoFactorChallenges = sqliteTable(
  'two_factor_challenges',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    ip: text('ip'),
    userAgent: text('user_agent'),
    expiresAt: text('expires_at').notNull(),
    consumedAt: text('consumed_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('two_factor_challenges_token_hash_unique').on(table.tokenHash),
    index('two_factor_challenges_user_idx').on(table.userId),
  ],
);

/**
 * Sign-in history. `user_id` is null for attempts on an unknown e-mail address; `email` is kept
 * so lockouts and reviews work either way.
 */
export const loginEvents = sqliteTable(
  'login_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    outcome: text('outcome', {
      enum: [
        'success',
        'failure',
        'locked',
        'two_factor_required',
        'two_factor_success',
        'two_factor_failure',
        'recovery_code_used',
        'refresh_reuse',
        'password_reset',
        'password_reset_failure',
      ],
    }).notNull(),
    reason: text('reason'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('login_events_user_created_idx').on(table.userId, table.createdAt),
    index('login_events_email_created_idx').on(table.email, table.createdAt),
  ],
);

/**
 * One-time password reset links an owner or administrator made for a member (there is no
 * email). Valid for 30 minutes and once; only the hash is stored. A link for an account with
 * two-step verification also asks for a code from it.
 */
export const passwordResetTokens = sqliteTable(
  'password_reset_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    issuedBy: text('issued_by').references(() => users.id, { onDelete: 'set null' }),
    /** The church whose administrator made the link; deleting the church voids it. */
    issuedInChurchId: text('issued_in_church_id').references(() => churches.id, {
      onDelete: 'cascade',
    }),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('password_reset_tokens_token_hash_unique').on(table.tokenHash),
    index('password_reset_tokens_user_idx').on(table.userId),
  ],
);

export type UserTwoFactorRow = typeof userTwoFactor.$inferSelect;
export type UserRecoveryCodeRow = typeof userRecoveryCodes.$inferSelect;
export type TwoFactorChallengeRow = typeof twoFactorChallenges.$inferSelect;
export type LoginEventRow = typeof loginEvents.$inferSelect;
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
