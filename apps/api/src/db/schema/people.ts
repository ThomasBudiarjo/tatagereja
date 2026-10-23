// Tables owned by the people module. Every church-owned table carries `church_id` with
// `onDelete: 'cascade'`; see docs/ARCHITECTURE-MODULES.md. Export row types next to the tables.
// Group meeting fields and the wedding date live on `groups` and `people` in core.ts.
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { churches, groups, people, users } from './core';

/** Church-defined geographic areas (wilayah, sektor, rayon, lingkungan). */
export const areas = sqliteTable(
  'areas',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Short code shown in lists, e.g. "W-03". */
    code: text('code'),
    description: text('description'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('areas_church_name_unique').on(table.churchId, table.name),
    index('areas_church_idx').on(table.churchId, table.sortOrder),
  ],
);

/**
 * Coordinators of an area (koordinator wilayah). A scoped assignment like group leaders: with
 * `people.edit` they manage the people of their area only.
 */
export const areaCoordinators = sqliteTable(
  'area_coordinators',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    areaId: text('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedAt: text('assigned_at').notNull(),
  },
  (table) => [
    uniqueIndex('area_coordinators_area_user_unique').on(table.areaId, table.userId),
    index('area_coordinators_user_idx').on(table.churchId, table.userId),
  ],
);

/** A family (keluarga / kepala keluarga) sharing an address and phone. */
export const households = sqliteTable(
  'households',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    areaId: text('area_id').references(() => areas.id, { onDelete: 'set null' }),
    address: text('address'),
    city: text('city'),
    postalCode: text('postal_code'),
    phone: text('phone'),
    photoUrl: text('photo_url'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('households_church_name_idx').on(table.churchId, table.name),
    index('households_area_idx').on(table.areaId),
  ],
);

/** A person belongs to at most one household. */
export const householdMembers = sqliteTable(
  'household_members',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    relationship: text('relationship', {
      enum: ['head', 'spouse', 'child', 'parent', 'relative', 'other'],
    }).notNull(),
    isPrimaryContact: integer('is_primary_contact', { mode: 'boolean' }).notNull().default(false),
    addedAt: text('added_at').notNull(),
  },
  (table) => [
    uniqueIndex('household_members_person_unique').on(table.personId),
    index('household_members_household_idx').on(table.householdId),
    index('household_members_church_idx').on(table.churchId),
  ],
);

/**
 * A person's own area. When absent the person belongs to their household's area; this row
 * overrides it (e.g. an adult child registered in another sektor).
 */
export const personAreas = sqliteTable(
  'person_areas',
  {
    personId: text('person_id')
      .primaryKey()
      .references(() => people.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    areaId: text('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'cascade' }),
    assignedAt: text('assigned_at').notNull(),
  },
  (table) => [index('person_areas_area_idx').on(table.areaId)],
);

export const personTags = sqliteTable(
  'person_tags',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('person_tags_church_name_unique').on(table.churchId, table.name)],
);

export const personTagAssignments = sqliteTable(
  'person_tag_assignments',
  {
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => personTags.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    assignedAt: text('assigned_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.personId, table.tagId] }),
    index('person_tag_assignments_tag_idx').on(table.tagId),
  ],
);

/** Church-defined extra fields on people. `options` lists the choices of a `select` field. */
export const customFieldDefinitions = sqliteTable(
  'custom_field_definitions',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    /** Stable machine key used in CSV import/export and filters. */
    key: text('key').notNull(),
    label: text('label').notNull(),
    type: text('type', { enum: ['text', 'number', 'date', 'select', 'checkbox'] }).notNull(),
    options: text('options', { mode: 'json' }).$type<string[]>().notNull().default([]),
    helpText: text('help_text'),
    isRequired: integer('is_required', { mode: 'boolean' }).notNull().default(false),
    /** Private fields are only shown to holders of `people.private.view`. */
    isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('custom_field_definitions_church_key_unique').on(table.churchId, table.key),
    index('custom_field_definitions_church_idx').on(table.churchId, table.sortOrder),
  ],
);

/**
 * One value per person and field, stored as text: numbers as decimal strings, dates as
 * YYYY-MM-DD, checkboxes as "true"/"false".
 */
export const customFieldValues = sqliteTable(
  'custom_field_values',
  {
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    fieldId: text('field_id')
      .notNull()
      .references(() => customFieldDefinitions.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.personId, table.fieldId] }),
    index('custom_field_values_field_value_idx').on(table.fieldId, table.value),
  ],
);

/**
 * What a person shows in the member directory. A missing row means the defaults in
 * `DEFAULT_PERSON_PRIVACY` (shared). Hidden fields are stripped by the API unless the caller
 * holds `people.private.view` or it is their own profile.
 */
export const personPrivacySettings = sqliteTable(
  'person_privacy_settings',
  {
    personId: text('person_id')
      .primaryKey()
      .references(() => people.id, { onDelete: 'cascade' }),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    showPhone: integer('show_phone', { mode: 'boolean' }).notNull().default(true),
    showEmail: integer('show_email', { mode: 'boolean' }).notNull().default(true),
    showAddress: integer('show_address', { mode: 'boolean' }).notNull().default(false),
    showBirthday: integer('show_birthday', { mode: 'boolean' }).notNull().default(true),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('person_privacy_settings_church_idx').on(table.churchId)],
);

/** A member asking to join a public group; leaders or `groups.manage` decide. */
export const groupJoinRequests = sqliteTable(
  'group_join_requests',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    requestedBy: text('requested_by').references(() => users.id, { onDelete: 'set null' }),
    message: text('message'),
    status: text('status', { enum: ['pending', 'approved', 'declined', 'cancelled'] })
      .notNull()
      .default('pending'),
    decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: text('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('group_join_requests_group_status_idx').on(table.groupId, table.status),
    index('group_join_requests_person_idx').on(table.personId),
    // At most one open request per person and group.
    uniqueIndex('group_join_requests_pending_unique')
      .on(table.groupId, table.personId)
      .where(sql`status = 'pending'`),
  ],
);

export type AreaRow = typeof areas.$inferSelect;
export type AreaCoordinatorRow = typeof areaCoordinators.$inferSelect;
export type HouseholdRow = typeof households.$inferSelect;
export type HouseholdMemberRow = typeof householdMembers.$inferSelect;
export type PersonAreaRow = typeof personAreas.$inferSelect;
export type PersonTagRow = typeof personTags.$inferSelect;
export type PersonTagAssignmentRow = typeof personTagAssignments.$inferSelect;
export type CustomFieldDefinitionRow = typeof customFieldDefinitions.$inferSelect;
export type CustomFieldValueRow = typeof customFieldValues.$inferSelect;
export type PersonPrivacySettingsRow = typeof personPrivacySettings.$inferSelect;
export type GroupJoinRequestRow = typeof groupJoinRequests.$inferSelect;
