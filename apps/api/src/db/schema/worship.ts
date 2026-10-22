// Tables owned by the worship module. Every church-owned table carries `church_id` with
// `onDelete: 'cascade'`; see docs/ARCHITECTURE-MODULES.md. Export row types next to the tables.
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { attendanceSessions, churches, groups, people, users } from './core';

/** Ibadah Umum, Pemuda, Remaja, Sekolah Minggu, Doa, Hari Raya, ... */
export const serviceTypes = sqliteTable(
  'service_types',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category', {
      enum: ['general', 'youth', 'teens', 'sunday_school', 'prayer', 'holy_day', 'other'],
    })
      .notNull()
      .default('general'),
    /** Usual start, local `HH:MM` in the church time zone. */
    defaultTime: text('default_time'),
    defaultDurationMinutes: integer('default_duration_minutes'),
    defaultLocation: text('default_location'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('service_types_church_name_unique').on(table.churchId, table.name)],
);

/** One planned worship service (ibadah) with its liturgy and roster. */
export const worshipServices = sqliteTable(
  'worship_services',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    serviceTypeId: text('service_type_id').references(() => serviceTypes.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at'),
    location: text('location'),
    theme: text('theme'),
    /** Bible readings, e.g. ["Yesaya 40:1-11", "Markus 1:1-8"]. */
    scriptureReadings: text('scripture_readings', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    preacherPersonId: text('preacher_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    /** Guest preacher (pendeta tamu) when there is no person record. */
    preacherName: text('preacher_name'),
    notes: text('notes'),
    status: text('status', { enum: ['draft', 'published', 'cancelled'] })
      .notNull()
      .default('draft'),
    attendanceSessionId: text('attendance_session_id').references(() => attendanceSessions.id, {
      onDelete: 'set null',
    }),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('worship_services_church_starts_idx').on(table.churchId, table.startsAt),
    index('worship_services_type_idx').on(table.serviceTypeId),
    index('worship_services_preacher_idx').on(table.preacherPersonId),
  ],
);

export const songs = sqliteTable(
  'songs',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    author: text('author'),
    defaultKey: text('default_key'),
    /** Beats per minute. */
    tempo: integer('tempo'),
    lyrics: text('lyrics'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    ccliNumber: text('ccli_number'),
    /** Hymnal (KJ, PKJ, NKB, ...) and its number. */
    hymnal: text('hymnal', { enum: ['KJ', 'PKJ', 'NKB', 'KPRI', 'BE', 'other'] }),
    hymnalNumber: text('hymnal_number'),
    notes: text('notes'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('songs_church_title_idx').on(table.churchId, table.title),
    index('songs_church_hymnal_idx').on(table.churchId, table.hymnal, table.hymnalNumber),
  ],
);

/** The order of service (liturgi). Song usage history is read from these rows. */
export const liturgyItems = sqliteTable(
  'liturgy_items',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => worshipServices.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    type: text('type', {
      enum: ['song', 'reading', 'prayer', 'sermon', 'offering', 'announcement', 'other'],
    }).notNull(),
    title: text('title').notNull(),
    durationMinutes: integer('duration_minutes'),
    songId: text('song_id').references(() => songs.id, { onDelete: 'set null' }),
    songKey: text('song_key'),
    personId: text('person_id').references(() => people.id, { onDelete: 'set null' }),
    /** Who leads the item when it is not a person record. */
    personName: text('person_name'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('liturgy_items_service_position_idx').on(table.serviceId, table.position),
    index('liturgy_items_song_idx').on(table.songId),
  ],
);

/** Pemusik, Singers, Multimedia, Penerima Tamu, Penatua bertugas, Guru Sekolah Minggu, ... */
export const servingTeams = sqliteTable(
  'serving_teams',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color'),
    /** Optional link to the group (komisi) the team belongs to. */
    groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('serving_teams_church_name_unique').on(table.churchId, table.name)],
);

export const servingPositions = sqliteTable(
  'serving_positions',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => servingTeams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** How many people a service usually needs in this position. */
    needed: integer('needed').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('serving_positions_team_name_unique').on(table.teamId, table.name)],
);

/** Team membership. `leader` members schedule their own team (team leader scope). */
export const servingTeamMembers = sqliteTable(
  'serving_team_members',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => servingTeams.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['member', 'leader'] })
      .notNull()
      .default('member'),
    joinedAt: text('joined_at').notNull(),
  },
  (table) => [
    uniqueIndex('serving_team_members_team_person_unique').on(table.teamId, table.personId),
    index('serving_team_members_person_idx').on(table.personId),
  ],
);

/** The positions a team member can serve in. */
export const servingMemberPositions = sqliteTable(
  'serving_member_positions',
  {
    teamMemberId: text('team_member_id')
      .notNull()
      .references(() => servingTeamMembers.id, { onDelete: 'cascade' }),
    positionId: text('position_id')
      .notNull()
      .references(() => servingPositions.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.teamMemberId, table.positionId] }),
    index('serving_member_positions_position_idx').on(table.positionId),
  ],
);

/** Jadwal pelayanan: a person serving in a position at a service. */
export const rosterAssignments = sqliteTable(
  'roster_assignments',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => worshipServices.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => servingTeams.id, { onDelete: 'cascade' }),
    positionId: text('position_id')
      .notNull()
      .references(() => servingPositions.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'accepted', 'declined'] })
      .notNull()
      .default('pending'),
    declineReason: text('decline_reason'),
    respondedAt: text('responded_at'),
    notifiedAt: text('notified_at'),
    notes: text('notes'),
    assignedBy: text('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('roster_assignments_service_position_person_unique').on(
      table.serviceId,
      table.positionId,
      table.personId,
    ),
    index('roster_assignments_person_status_idx').on(table.personId, table.status),
    index('roster_assignments_church_service_idx').on(table.churchId, table.serviceId),
  ],
);

/** Dates a volunteer cannot serve (inclusive range, YYYY-MM-DD). */
export const volunteerBlockouts = sqliteTable(
  'volunteer_blockouts',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    reason: text('reason'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('volunteer_blockouts_person_start_idx').on(table.personId, table.startDate)],
);

export type ServiceTypeRow = typeof serviceTypes.$inferSelect;
export type WorshipServiceRow = typeof worshipServices.$inferSelect;
export type SongRow = typeof songs.$inferSelect;
export type LiturgyItemRow = typeof liturgyItems.$inferSelect;
export type ServingTeamRow = typeof servingTeams.$inferSelect;
export type ServingPositionRow = typeof servingPositions.$inferSelect;
export type ServingTeamMemberRow = typeof servingTeamMembers.$inferSelect;
export type ServingMemberPositionRow = typeof servingMemberPositions.$inferSelect;
export type RosterAssignmentRow = typeof rosterAssignments.$inferSelect;
export type VolunteerBlockoutRow = typeof volunteerBlockouts.$inferSelect;
