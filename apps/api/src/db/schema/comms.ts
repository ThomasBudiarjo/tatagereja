// Tables owned by the comms module. Every church-owned table carries `church_id` with
// `onDelete: 'cascade'`; see docs/ARCHITECTURE-MODULES.md. Export row types next to the tables.
// Announcement scheduling/pinning/audience columns, event series and event registration
// settings live on `announcements`, `event_series` and `events` in core.ts.
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { churchRoles } from './access';
import { announcements, churches, events, people, users } from './core';

/** The roles an `audience = 'roles'` announcement is shown to. */
export const announcementAudienceRoles = sqliteTable(
  'announcement_audience_roles',
  {
    announcementId: text('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => churchRoles.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.announcementId, table.roleId] }),
    index('announcement_audience_roles_role_idx').on(table.roleId),
  ],
);

/** Read receipts ("seen by N"). */
export const announcementReads = sqliteTable(
  'announcement_reads',
  {
    announcementId: text('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    readAt: text('read_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.announcementId, table.userId] }),
    index('announcement_reads_user_idx').on(table.userId),
  ],
);

/**
 * Registrations for events with `registration_required`. `waitlisted` rows are promoted to
 * `registered` in `created_at` order when a place frees up.
 */
export const eventRegistrations = sqliteTable(
  'event_registrations',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    /** The account that registered (a parent registering a child, or the person themselves). */
    registeredBy: text('registered_by').references(() => users.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['registered', 'waitlisted', 'cancelled'] }).notNull(),
    /** Places taken, including the person (e.g. 3 for a family). */
    partySize: integer('party_size').notNull().default(1),
    note: text('note'),
    promotedAt: text('promoted_at'),
    cancelledAt: text('cancelled_at'),
    checkedInAt: text('checked_in_at'),
    checkedInBy: text('checked_in_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('event_registrations_event_person_unique').on(table.eventId, table.personId),
    index('event_registrations_event_status_idx').on(table.eventId, table.status, table.createdAt),
    index('event_registrations_person_idx').on(table.personId),
  ],
);

/**
 * Private iCal feeds. The URL carries the raw token once; only its hash is stored. Revoking
 * sets `revoked_at` and the feed stops answering.
 */
export const calendarFeedTokens = sqliteTable(
  'calendar_feed_tokens',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    label: text('label'),
    /** Calendar sources included in the feed (`CALENDAR_SOURCES`). */
    sources: text('sources', { mode: 'json' }).$type<string[]>().notNull().default([]),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('calendar_feed_tokens_token_hash_unique').on(table.tokenHash),
    index('calendar_feed_tokens_user_idx').on(table.churchId, table.userId),
  ],
);

/**
 * Warta Jemaat. `sections` is the composed content (`BulletinSection[]` in shared), validated
 * when read; finance sections are only rendered for holders of `finance.reports`.
 */
export const bulletins = sqliteTable(
  'bulletins',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** The Sunday (or date) the bulletin is for, YYYY-MM-DD. */
    issueDate: text('issue_date').notNull(),
    theme: text('theme'),
    coverImageUrl: text('cover_image_url'),
    sections: text('sections', { mode: 'json' }).$type<unknown[]>().notNull().default([]),
    includeFinanceSummary: integer('include_finance_summary', { mode: 'boolean' })
      .notNull()
      .default(false),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    publishedAt: text('published_at'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('bulletins_church_issue_idx').on(table.churchId, table.issueDate)],
);

export type AnnouncementAudienceRoleRow = typeof announcementAudienceRoles.$inferSelect;
export type AnnouncementReadRow = typeof announcementReads.$inferSelect;
export type EventRegistrationRow = typeof eventRegistrations.$inferSelect;
export type CalendarFeedTokenRow = typeof calendarFeedTokens.$inferSelect;
export type BulletinRow = typeof bulletins.$inferSelect;
