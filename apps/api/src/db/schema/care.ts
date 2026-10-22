// Tables owned by the care module. Every church-owned table carries `church_id` with
// `onDelete: 'cascade'`; see docs/ARCHITECTURE-MODULES.md. Export row types next to the tables.
// Confidential text (case descriptions, notes, visit summaries) never goes into audit
// summaries, notifications or search results.
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { churches, people, users } from './core';
import { households } from './people';

/**
 * A pastoral care case. `confidential` cases are readable only by their assigned caregivers and
 * holders of `care.confidential`, even for administrators.
 */
export const careCases = sqliteTable(
  'care_cases',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    personId: text('person_id').references(() => people.id, { onDelete: 'cascade' }),
    householdId: text('household_id').references(() => households.id, { onDelete: 'set null' }),
    category: text('category', {
      enum: ['visitation', 'counseling', 'hospital', 'grief', 'financial_aid', 'other'],
    }).notNull(),
    priority: text('priority', { enum: ['low', 'normal', 'high', 'urgent'] })
      .notNull()
      .default('normal'),
    status: text('status', { enum: ['open', 'in_progress', 'closed'] })
      .notNull()
      .default('open'),
    confidentiality: text('confidentiality', { enum: ['normal', 'confidential'] })
      .notNull()
      .default('normal'),
    /** Short, non-sensitive label shown in lists ("Kunjungan RS", "Pendampingan duka"). */
    title: text('title').notNull(),
    description: text('description'),
    nextActionDate: text('next_action_date'),
    nextActionNote: text('next_action_note'),
    /** Set when the reminder for `next_action_date` was sent. */
    reminderSentAt: text('reminder_sent_at'),
    closedAt: text('closed_at'),
    closedReason: text('closed_reason'),
    openedBy: text('opened_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('care_cases_church_status_idx').on(table.churchId, table.status, table.updatedAt),
    index('care_cases_church_next_action_idx').on(table.churchId, table.nextActionDate),
    index('care_cases_person_idx').on(table.personId),
  ],
);

export const careCaseCaregivers = sqliteTable(
  'care_case_caregivers',
  {
    caseId: text('case_id')
      .notNull()
      .references(() => careCases.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: text('assigned_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.userId] }),
    index('care_case_caregivers_user_idx').on(table.churchId, table.userId),
  ],
);

/** The case timeline. */
export const careNotes = sqliteTable(
  'care_notes',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    caseId: text('case_id')
      .notNull()
      .references(() => careCases.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['note', 'call', 'visit', 'meeting', 'status_change'] })
      .notNull()
      .default('note'),
    body: text('body').notNull(),
    authorUserId: text('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('care_notes_case_created_idx').on(table.caseId, table.createdAt)],
);

/** Perkunjungan log. A visit linked to a confidential case inherits its confidentiality. */
export const careVisits = sqliteTable(
  'care_visits',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    caseId: text('case_id').references(() => careCases.id, { onDelete: 'set null' }),
    personId: text('person_id').references(() => people.id, { onDelete: 'set null' }),
    householdId: text('household_id').references(() => households.id, { onDelete: 'set null' }),
    visitDate: text('visit_date').notNull(),
    location: text('location'),
    summary: text('summary'),
    confidentiality: text('confidentiality', { enum: ['normal', 'confidential'] })
      .notNull()
      .default('normal'),
    followUpNeeded: integer('follow_up_needed', { mode: 'boolean' }).notNull().default(false),
    followUpNote: text('follow_up_note'),
    /** Visitors without a person record (e.g. a guest pastor). */
    otherVisitors: text('other_visitors'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('care_visits_church_date_idx').on(table.churchId, table.visitDate),
    index('care_visits_person_idx').on(table.personId),
    index('care_visits_case_idx').on(table.caseId),
  ],
);

/** The people who made a visit (pendeta, penatua, diaken). */
export const careVisitVisitors = sqliteTable(
  'care_visit_visitors',
  {
    visitId: text('visit_id')
      .notNull()
      .references(() => careVisits.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.visitId, table.personId] }),
    index('care_visit_visitors_person_idx').on(table.personId),
  ],
);

/**
 * Pokok doa. Requests with `church` visibility are shown to members only once a moderator
 * approved them; `care_team` and `pastors` requests are never public.
 */
export const prayerRequests = sqliteTable(
  'prayer_requests',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    personId: text('person_id').references(() => people.id, { onDelete: 'set null' }),
    submittedBy: text('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    visibility: text('visibility', { enum: ['church', 'care_team', 'pastors'] })
      .notNull()
      .default('church'),
    /** The requester's name is hidden from everyone but moderators. */
    isAnonymous: integer('is_anonymous', { mode: 'boolean' }).notNull().default(false),
    moderationStatus: text('moderation_status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    moderatedBy: text('moderated_by').references(() => users.id, { onDelete: 'set null' }),
    moderatedAt: text('moderated_at'),
    moderationNote: text('moderation_note'),
    prayedCount: integer('prayed_count').notNull().default(0),
    answeredAt: text('answered_at'),
    testimony: text('testimony'),
    closedAt: text('closed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('prayer_requests_church_status_idx').on(
      table.churchId,
      table.moderationStatus,
      table.createdAt,
    ),
    index('prayer_requests_submitter_idx').on(table.submittedBy),
  ],
);

/** "I prayed": one row per request and member, counting how often they prayed. */
export const prayerRequestPrayers = sqliteTable(
  'prayer_request_prayers',
  {
    requestId: text('request_id')
      .notNull()
      .references(() => prayerRequests.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    count: integer('count').notNull().default(1),
    lastPrayedAt: text('last_prayed_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.userId] })],
);

/** Visitor follow-up pipeline: new → contacted → visited → joined / closed. */
export const visitorFollowUps = sqliteTable(
  'visitor_follow_ups',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    stage: text('stage', { enum: ['new', 'contacted', 'visited', 'joined', 'closed'] })
      .notNull()
      .default('new'),
    /** How they found the church (friend, social media, walk-in, ...). */
    source: text('source'),
    firstVisitDate: text('first_visit_date'),
    assignedUserId: text('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    closedReason: text('closed_reason'),
    stageChangedAt: text('stage_changed_at').notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('visitor_follow_ups_church_stage_idx').on(table.churchId, table.stage),
    index('visitor_follow_ups_person_idx').on(table.personId),
    index('visitor_follow_ups_assignee_idx').on(table.assignedUserId),
  ],
);

/** Follow-up tasks ("My tasks"), linked to a visitor follow-up, a case or just a person. */
export const careTasks = sqliteTable(
  'care_tasks',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: text('due_date'),
    status: text('status', { enum: ['open', 'done', 'cancelled'] })
      .notNull()
      .default('open'),
    assignedUserId: text('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    followUpId: text('follow_up_id').references(() => visitorFollowUps.id, {
      onDelete: 'cascade',
    }),
    caseId: text('case_id').references(() => careCases.id, { onDelete: 'cascade' }),
    personId: text('person_id').references(() => people.id, { onDelete: 'set null' }),
    completedAt: text('completed_at'),
    completedBy: text('completed_by').references(() => users.id, { onDelete: 'set null' }),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('care_tasks_assignee_status_idx').on(
      table.churchId,
      table.assignedUserId,
      table.status,
      table.dueDate,
    ),
    index('care_tasks_follow_up_idx').on(table.followUpId),
    index('care_tasks_case_idx').on(table.caseId),
  ],
);

/**
 * Bantuan diakonia. The amount is optional (goods and services have none); the finance link is
 * only a reference text, never a foreign key. Voided instead of deleted.
 */
export const diakoniaAid = sqliteTable(
  'diakonia_aid',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    personId: text('person_id').references(() => people.id, { onDelete: 'set null' }),
    householdId: text('household_id').references(() => households.id, { onDelete: 'set null' }),
    caseId: text('case_id').references(() => careCases.id, { onDelete: 'set null' }),
    /** Recipient name when there is no person record. */
    recipientName: text('recipient_name'),
    category: text('category', {
      enum: ['food', 'health', 'education', 'housing', 'emergency', 'funeral', 'other'],
    }).notNull(),
    form: text('form', { enum: ['cash', 'goods', 'service'] })
      .notNull()
      .default('cash'),
    description: text('description'),
    amount: integer('amount'),
    givenAt: text('given_at').notNull(),
    financeReference: text('finance_reference'),
    voidedAt: text('voided_at'),
    voidedBy: text('voided_by').references(() => users.id, { onDelete: 'set null' }),
    voidReason: text('void_reason'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('diakonia_aid_church_given_idx').on(table.churchId, table.givenAt),
    index('diakonia_aid_person_idx').on(table.personId),
  ],
);

export type CareCaseRow = typeof careCases.$inferSelect;
export type CareCaseCaregiverRow = typeof careCaseCaregivers.$inferSelect;
export type CareNoteRow = typeof careNotes.$inferSelect;
export type CareVisitRow = typeof careVisits.$inferSelect;
export type CareVisitVisitorRow = typeof careVisitVisitors.$inferSelect;
export type PrayerRequestRow = typeof prayerRequests.$inferSelect;
export type PrayerRequestPrayerRow = typeof prayerRequestPrayers.$inferSelect;
export type VisitorFollowUpRow = typeof visitorFollowUps.$inferSelect;
export type CareTaskRow = typeof careTasks.$inferSelect;
export type DiakoniaAidRow = typeof diakoniaAid.$inferSelect;
