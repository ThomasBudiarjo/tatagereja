import { DEFAULT_CURRENCY, DEFAULT_ENABLED_MODULES, DEFAULT_TIMEZONE } from '@tatagereja/shared';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    avatarUrl: text('avatar_url'),
    /** Consecutive failed sign-ins since the last success; drives the progressive lockout. */
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lastFailedLoginAt: text('last_failed_login_at'),
    /** Sign-in is refused with ACCOUNT_LOCKED until this time. */
    lockedUntil: text('locked_until'),
    passwordChangedAt: text('password_changed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
  ],
);

export const churches = sqliteTable('churches', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  address: text('address'),
  city: text('city'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  logoUrl: text('logo_url'),
  brandColor: text('brand_color'),
  /** ISO 4217 code; every money column stores integer minor units of this currency. */
  currency: text('currency').notNull().default(DEFAULT_CURRENCY),
  timezone: text('timezone').notNull().default(DEFAULT_TIMEZONE),
  /** JSON array of the optional module ids that are switched on. */
  enabledModules: text('enabled_modules', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default([...DEFAULT_ENABLED_MODULES]),
  /** JSON object of per-module settings, keyed by module id. See services/modules.ts. */
  settings: text('settings', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  /** Set once the suggested role templates were created for this church. */
  roleTemplatesSeededAt: text('role_templates_seeded_at'),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const churchMemberships = sqliteTable(
  'church_memberships',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'administrator', 'member'] }).notNull(),
    /** A suspended member keeps their data but cannot open the church. */
    status: text('status', { enum: ['active', 'suspended'] })
      .notNull()
      .default('active'),
    suspendedAt: text('suspended_at'),
    joinedAt: text('joined_at').notNull(),
  },
  (table) => [
    uniqueIndex('church_memberships_church_user_unique').on(table.churchId, table.userId),
    index('church_memberships_user_idx').on(table.userId),
  ],
);

export const invitations = sqliteTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    role: text('role', { enum: ['member', 'administrator'] }).notNull(),
    label: text('label'),
    expiresAt: text('expires_at'),
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    revokedAt: text('revoked_at'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('invitations_token_unique').on(table.token),
    index('invitations_church_idx').on(table.churchId),
  ],
);

export const people = sqliteTable(
  'people',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    gender: text('gender', { enum: ['male', 'female', 'unspecified'] })
      .notNull()
      .default('unspecified'),
    birthDate: text('birth_date'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    photoUrl: text('photo_url'),
    membershipStatus: text('membership_status', {
      enum: ['visitor', 'regular', 'member', 'inactive'],
    })
      .notNull()
      .default('visitor'),
    joinedAt: text('joined_at'),
    /** Wedding anniversary shown in the directory and Warta Jemaat (YYYY-MM-DD). */
    weddingDate: text('wedding_date'),
    notes: text('notes'),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('people_church_idx').on(table.churchId),
    index('people_church_name_idx').on(table.churchId, table.firstName, table.lastName),
    index('people_church_status_idx').on(table.churchId, table.membershipStatus),
    uniqueIndex('people_church_user_unique').on(table.churchId, table.userId),
  ],
);

export const personPrivateDetails = sqliteTable('person_private_details', {
  personId: text('person_id')
    .primaryKey()
    .references(() => people.id, { onDelete: 'cascade' }),
  churchId: text('church_id')
    .notNull()
    .references(() => churches.id, { onDelete: 'cascade' }),
  nationalId: text('national_id'),
  maritalStatus: text('marital_status', {
    enum: ['single', 'married', 'widowed', 'divorced', 'unspecified'],
  })
    .notNull()
    .default('unspecified'),
  baptismDate: text('baptism_date'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  medicalNotes: text('medical_notes'),
  privateNotes: text('private_notes'),
  updatedAt: text('updated_at').notNull(),
});

export const groups = sqliteTable(
  'groups',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    type: text('type', {
      enum: ['komisi', 'ministry', 'small_group', 'committee', 'choir', 'area', 'other'],
    })
      .notNull()
      .default('ministry'),
    /** Free-text schedule kept for older clients; the structured fields below are preferred. */
    meetingSchedule: text('meeting_schedule'),
    /** 0 = Sunday … 6 = Saturday. */
    meetingDay: integer('meeting_day'),
    /** Local time `HH:MM` in the church time zone. */
    meetingTime: text('meeting_time'),
    meetingFrequency: text('meeting_frequency', {
      enum: ['weekly', 'biweekly', 'monthly', 'irregular'],
    }),
    location: text('location'),
    capacity: integer('capacity'),
    coverColor: text('cover_color'),
    /** Public groups are listed for every member, who can ask to join; private ones are not. */
    visibility: text('visibility', { enum: ['public', 'private'] })
      .notNull()
      .default('public'),
    joinPolicy: text('join_policy', { enum: ['request', 'closed'] })
      .notNull()
      .default('request'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('groups_church_idx').on(table.churchId),
    index('groups_church_type_idx').on(table.churchId, table.type),
  ],
);

export const groupMembers = sqliteTable(
  'group_members',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    addedAt: text('added_at').notNull(),
  },
  (table) => [
    uniqueIndex('group_members_group_person_unique').on(table.groupId, table.personId),
    index('group_members_person_idx').on(table.personId),
  ],
);

export const groupLeaders = sqliteTable(
  'group_leaders',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    assignedAt: text('assigned_at').notNull(),
  },
  (table) => [
    uniqueIndex('group_leaders_group_user_unique').on(table.groupId, table.userId),
    index('group_leaders_user_idx').on(table.userId),
  ],
);

/** A recurring event. Occurrences are materialised as `events` rows that point back here. */
export const eventSeries = sqliteTable(
  'event_series',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    frequency: text('frequency', { enum: ['weekly', 'biweekly', 'monthly'] }).notNull(),
    /** First occurrence; later ones keep its local time of day. */
    startsAt: text('starts_at').notNull(),
    durationMinutes: integer('duration_minutes'),
    isAllDay: integer('is_all_day', { mode: 'boolean' }).notNull().default(false),
    /** Last date (YYYY-MM-DD) an occurrence may fall on. */
    untilDate: text('until_date').notNull(),
    capacity: integer('capacity'),
    registrationRequired: integer('registration_required', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('event_series_church_idx').on(table.churchId)],
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at'),
    isAllDay: integer('is_all_day', { mode: 'boolean' }).notNull().default(false),
    seriesId: text('series_id').references(() => eventSeries.id, { onDelete: 'cascade' }),
    /** Edited on its own: "edit all future occurrences" leaves it alone. */
    isSeriesException: integer('is_series_exception', { mode: 'boolean' }).notNull().default(false),
    coverColor: text('cover_color'),
    /** Places available when registration is required; null means unlimited. */
    capacity: integer('capacity'),
    registrationRequired: integer('registration_required', { mode: 'boolean' })
      .notNull()
      .default(false),
    registrationClosesAt: text('registration_closes_at'),
    waitlistEnabled: integer('waitlist_enabled', { mode: 'boolean' }).notNull().default(true),
    checkInEnabled: integer('check_in_enabled', { mode: 'boolean' }).notNull().default(false),
    cancelledAt: text('cancelled_at'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('events_church_starts_idx').on(table.churchId, table.startsAt),
    index('events_group_idx').on(table.groupId),
    index('events_series_idx').on(table.seriesId, table.startsAt),
  ],
);

export const eventParticipants = sqliteTable(
  'event_participants',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['invited', 'going', 'not_going'] })
      .notNull()
      .default('invited'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('event_participants_event_person_unique').on(table.eventId, table.personId),
    index('event_participants_person_idx').on(table.personId),
  ],
);

export const attendanceSessions = sqliteTable(
  'attendance_sessions',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sessionAt: text('session_at').notNull(),
    /** `roster` marks people one by one; `headcount` only stores the counts below. */
    mode: text('mode', { enum: ['roster', 'headcount'] })
      .notNull()
      .default('roster'),
    headcountMen: integer('headcount_men'),
    headcountWomen: integer('headcount_women'),
    headcountChildren: integer('headcount_children'),
    headcountVisitors: integer('headcount_visitors'),
    notes: text('notes'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('attendance_sessions_church_idx').on(table.churchId, table.sessionAt),
    index('attendance_sessions_event_idx').on(table.eventId),
  ],
);

export const attendanceRecords = sqliteTable(
  'attendance_records',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['present', 'absent', 'excused'] }).notNull(),
    /**
     * Copy of the session's `session_at`, kept in step by services/attendance.ts, so absence
     * streaks and last-seen dates are answered from one index instead of joining every mark
     * to its session. Rows written before the column existed are filled in at startup.
     */
    sessionAt: text('session_at').notNull().default(''),
    note: text('note'),
    recordedBy: text('recorded_by')
      .notNull()
      .references(() => users.id),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [
    uniqueIndex('attendance_records_session_person_unique').on(table.sessionId, table.personId),
    index('attendance_records_person_idx').on(table.personId),
    // Present/absent counts per session without reading the rows.
    index('attendance_records_session_status_idx').on(table.sessionId, table.status),
    // Absence streaks and last-present dates per person (covering).
    index('attendance_records_church_status_person_idx').on(
      table.churchId,
      table.status,
      table.personId,
      table.sessionAt,
    ),
  ],
);

export const announcements = sqliteTable(
  'announcements',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    publishedAt: text('published_at'),
    /**
     * Who sees it: the whole church, the members of `group_id`, or the holders of the roles in
     * `announcement_audience_roles`.
     */
    audience: text('audience', { enum: ['church', 'group', 'roles'] })
      .notNull()
      .default('church'),
    /** Published posts become visible from this time (scheduled publishing). */
    publishAt: text('publish_at'),
    /** Hidden from lists after this time. */
    expiresAt: text('expires_at'),
    pinnedAt: text('pinned_at'),
    coverImageUrl: text('cover_image_url'),
    /** Set once the audience was notified, so a scheduled post notifies exactly once. */
    notifiedAt: text('notified_at'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('announcements_church_idx').on(table.churchId, table.status),
    index('announcements_church_pinned_idx').on(table.churchId, table.pinnedAt),
    index('announcements_group_idx').on(table.groupId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type ChurchRow = typeof churches.$inferSelect;
export type MembershipRow = typeof churchMemberships.$inferSelect;
export type InvitationRow = typeof invitations.$inferSelect;
export type PersonRow = typeof people.$inferSelect;
export type PersonPrivateDetailsRow = typeof personPrivateDetails.$inferSelect;
export type GroupRow = typeof groups.$inferSelect;
export type EventSeriesRow = typeof eventSeries.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type AttendanceSessionRow = typeof attendanceSessions.$inferSelect;
export type AttendanceRecordRow = typeof attendanceRecords.$inferSelect;
export type AnnouncementRow = typeof announcements.$inferSelect;
