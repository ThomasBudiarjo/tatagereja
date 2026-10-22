import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { churches, users } from './core';

/**
 * Append-only record of sensitive changes. Rows are written in the same transaction as the
 * change they describe (services/audit.ts). `church_id` is null for account-level events and
 * for a deleted church's final entry.
 */
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id').references(() => churches.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    module: text('module').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    summary: text('summary').notNull(),
    before: text('before', { mode: 'json' }).$type<unknown>(),
    after: text('after', { mode: 'json' }).$type<unknown>(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('audit_logs_church_created_idx').on(table.churchId, table.createdAt),
    index('audit_logs_church_module_idx').on(table.churchId, table.module),
    index('audit_logs_entity_idx').on(table.churchId, table.entityType, table.entityId),
    index('audit_logs_actor_idx').on(table.actorUserId),
  ],
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
