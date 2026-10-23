// Tables owned by the checkin module. Every church-owned table carries `church_id` with
// `onDelete: 'cascade'`; see docs/ARCHITECTURE-MODULES.md. Export row types next to the tables.
// Children and guardians are `people` rows; families come from the people module's households.
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { attendanceSessions, churches, people, users } from './core';
import { facilityResources } from './facilities';
import { worshipServices } from './worship';
import { encryptedText } from '../encrypted';

/** Sekolah Minggu classes by age (Balita, Kelas Kecil, Tengah, Besar, Tunas Remaja). */
export const checkinClasses = sqliteTable(
  'checkin_classes',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Inclusive age range in years; null means open-ended. */
    minAge: integer('min_age'),
    maxAge: integer('max_age'),
    resourceId: text('resource_id').references(() => facilityResources.id, {
      onDelete: 'set null',
    }),
    location: text('location'),
    capacity: integer('capacity'),
    /** Children per teacher before the roster shows a ratio warning. */
    maxChildrenPerTeacher: integer('max_children_per_teacher'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('checkin_classes_church_name_unique').on(table.churchId, table.name)],
);

/** Guru Sekolah Minggu assigned to a class. */
export const checkinClassTeachers = sqliteTable(
  'checkin_class_teachers',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    classId: text('class_id')
      .notNull()
      .references(() => checkinClasses.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    isLead: integer('is_lead', { mode: 'boolean' }).notNull().default(false),
    assignedAt: text('assigned_at').notNull(),
  },
  (table) => [
    uniqueIndex('checkin_class_teachers_class_person_unique').on(table.classId, table.personId),
    index('checkin_class_teachers_person_idx').on(table.personId),
  ],
);

/** A check-in session for one service or date. Closed sessions accept no new check-ins. */
export const checkinSessions = sqliteTable(
  'checkin_sessions',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    date: text('date').notNull(),
    worshipServiceId: text('worship_service_id').references(() => worshipServices.id, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    /** Attendance session the check-ins are copied to on close (feeds attendance stats). */
    attendanceSessionId: text('attendance_session_id').references(() => attendanceSessions.id, {
      onDelete: 'set null',
    }),
    openedBy: text('opened_by').references(() => users.id, { onDelete: 'set null' }),
    openedAt: text('opened_at').notNull(),
    closedBy: text('closed_by').references(() => users.id, { onDelete: 'set null' }),
    closedAt: text('closed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('checkin_sessions_church_date_idx').on(table.churchId, table.date)],
);

/** Per-child check-in settings: the usual class. */
export const checkinChildProfiles = sqliteTable('checkin_child_profiles', {
  personId: text('person_id')
    .primaryKey()
    .references(() => people.id, { onDelete: 'cascade' }),
  churchId: text('church_id')
    .notNull()
    .references(() => churches.id, { onDelete: 'cascade' }),
  defaultClassId: text('default_class_id').references(() => checkinClasses.id, {
    onDelete: 'set null',
  }),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: text('updated_at').notNull(),
});

/** Allergy, medical and custody alerts, shown prominently to teachers. */
export const checkinChildAlerts = sqliteTable(
  'checkin_child_alerts',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['allergy', 'medical', 'custody', 'other'] }).notNull(),
    severity: text('severity', { enum: ['info', 'warning', 'critical'] })
      .notNull()
      .default('warning'),
    description: encryptedText('checkin_child_alerts', 'description').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('checkin_child_alerts_person_idx').on(table.personId, table.isActive)],
);

/** People allowed to pick a child up, besides the household's guardians. */
export const checkinAuthorizedPickups = sqliteTable(
  'checkin_authorized_pickups',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    childPersonId: text('child_person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    pickupPersonId: text('pickup_person_id').references(() => people.id, {
      onDelete: 'cascade',
    }),
    /** Name of someone without a person record (e.g. a driver or grandparent). */
    name: text('name').notNull(),
    relationship: text('relationship'),
    phone: text('phone'),
    notes: encryptedText('checkin_authorized_pickups', 'notes'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('checkin_authorized_pickups_child_idx').on(table.childPersonId)],
);

/**
 * One child checked in to a class. `security_code` is a CSPRNG code from the unambiguous
 * alphabet, unique within the session; check-out requires it (compare with `safeEqual`).
 */
export const checkins = sqliteTable(
  'checkins',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => checkinSessions.id, { onDelete: 'cascade' }),
    classId: text('class_id')
      .notNull()
      .references(() => checkinClasses.id, { onDelete: 'cascade' }),
    childPersonId: text('child_person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    guardianPersonId: text('guardian_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    securityCode: text('security_code').notNull(),
    method: text('method', { enum: ['staff', 'self', 'kiosk'] })
      .notNull()
      .default('staff'),
    status: text('status', { enum: ['checked_in', 'checked_out'] })
      .notNull()
      .default('checked_in'),
    checkedInAt: text('checked_in_at').notNull(),
    checkedInBy: text('checked_in_by').references(() => users.id, { onDelete: 'set null' }),
    checkedOutAt: text('checked_out_at'),
    checkedOutBy: text('checked_out_by').references(() => users.id, { onDelete: 'set null' }),
    pickupPersonId: text('pickup_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    pickupName: text('pickup_name'),
    /** Set when a manager checked out without the code; the reason is audited. */
    overrideReason: text('override_reason'),
    labelPrintedAt: text('label_printed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('checkins_session_code_unique').on(table.sessionId, table.securityCode),
    // A child is checked in at most once at a time within a session.
    uniqueIndex('checkins_session_child_open_unique')
      .on(table.sessionId, table.childPersonId)
      .where(sql`status = 'checked_in'`),
    index('checkins_session_class_idx').on(table.sessionId, table.classId, table.status),
    index('checkins_child_idx').on(table.childPersonId, table.checkedInAt),
  ],
);

export type CheckinClassRow = typeof checkinClasses.$inferSelect;
export type CheckinClassTeacherRow = typeof checkinClassTeachers.$inferSelect;
export type CheckinSessionRow = typeof checkinSessions.$inferSelect;
export type CheckinChildProfileRow = typeof checkinChildProfiles.$inferSelect;
export type CheckinChildAlertRow = typeof checkinChildAlerts.$inferSelect;
export type CheckinAuthorizedPickupRow = typeof checkinAuthorizedPickups.$inferSelect;
export type CheckinRow = typeof checkins.$inferSelect;
