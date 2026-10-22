import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { churches, churchMemberships, users } from './core';

/** Church-defined custom roles. Their permissions add to the member's base role. */
export const churchRoles = sqliteTable(
  'church_roles',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** JSON array of permission keys. Unknown or owner-only keys are ignored when read. */
    permissions: text('permissions', { mode: 'json' }).$type<string[]>().notNull().default([]),
    isTemplate: integer('is_template', { mode: 'boolean' }).notNull().default(false),
    templateKey: text('template_key'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('church_roles_church_name_unique').on(table.churchId, table.name),
    index('church_roles_church_idx').on(table.churchId),
  ],
);

export const membershipRoles = sqliteTable(
  'membership_roles',
  {
    membershipId: text('membership_id')
      .notNull()
      .references(() => churchMemberships.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => churchRoles.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: text('assigned_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.membershipId, table.roleId] }),
    index('membership_roles_role_idx').on(table.roleId),
    index('membership_roles_church_idx').on(table.churchId),
  ],
);

export type ChurchRoleRow = typeof churchRoles.$inferSelect;
export type MembershipRoleRow = typeof membershipRoles.$inferSelect;
