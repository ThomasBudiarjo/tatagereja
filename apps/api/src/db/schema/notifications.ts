import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { churches, users } from './core';

/** In-app notifications, one row per recipient. Created through services/notifications.ts. */
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    /** Null for account-level notices that belong to no church. */
    churchId: text('church_id').references(() => churches.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    readAt: text('read_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('notifications_user_created_idx').on(table.userId, table.createdAt),
    index('notifications_user_read_idx').on(table.userId, table.readAt),
    index('notifications_church_idx').on(table.churchId),
    index('notifications_entity_idx').on(table.entityType, table.entityId),
  ],
);

/** Per-user, per-type delivery choices. A missing row means the type's default. */
export const notificationPreferences = sqliteTable(
  'notification_preferences',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    inApp: integer('in_app', { mode: 'boolean' }).notNull().default(true),
    email: integer('email', { mode: 'boolean' }).notNull().default(false),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.type] })],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationPreferenceRow = typeof notificationPreferences.$inferSelect;
