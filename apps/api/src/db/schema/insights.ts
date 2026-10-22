// Tables owned by the insights module. Every church-owned table carries `church_id` with
// `onDelete: 'cascade'`; see docs/ARCHITECTURE-MODULES.md. Export row types next to the tables.
// Headcount-only attendance fields (`mode`, `headcount_*`) live on `attendance_sessions` in
// core.ts; dashboards and reports read the other modules' tables directly.
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { careTasks } from './care';
import { churches, people, users } from './core';

/** A member's home screen layout: hidden and ordered widgets (`HOME_WIDGETS`). */
export const dashboardPreferences = sqliteTable(
  'dashboard_preferences',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    hiddenWidgets: text('hidden_widgets', { mode: 'json' }).$type<string[]>().notNull().default([]),
    widgetOrder: text('widget_order', { mode: 'json' }).$type<string[]>().notNull().default([]),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.churchId] })],
);

/**
 * People absent from N consecutive sessions. Kept so a dismissed alert stays dismissed until
 * the person attends again, and so a follow-up created from it can be linked.
 */
export const absenceAlerts = sqliteTable(
  'absence_alerts',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    streak: integer('streak').notNull(),
    lastPresentAt: text('last_present_at'),
    status: text('status', { enum: ['open', 'dismissed', 'followed_up'] })
      .notNull()
      .default('open'),
    careTaskId: text('care_task_id').references(() => careTasks.id, { onDelete: 'set null' }),
    resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: text('resolved_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('absence_alerts_church_person_unique').on(table.churchId, table.personId),
    index('absence_alerts_church_status_idx').on(table.churchId, table.status),
  ],
);

export type DashboardPreferencesRow = typeof dashboardPreferences.$inferSelect;
export type AbsenceAlertRow = typeof absenceAlerts.$inferSelect;
