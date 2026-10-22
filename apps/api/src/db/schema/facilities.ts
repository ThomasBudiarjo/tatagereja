// Tables owned by the facilities module. Every church-owned table carries `church_id` with
// `onDelete: 'cascade'`; see docs/ARCHITECTURE-MODULES.md. Export row types next to the tables.
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { churches, events, groups, people, users } from './core';

/** Rooms and bookable resources: sanctuary, halls, classrooms, vehicles, projectors. */
export const facilityResources = sqliteTable(
  'facility_resources',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', {
      enum: ['sanctuary', 'hall', 'classroom', 'room', 'vehicle', 'equipment', 'other'],
    })
      .notNull()
      .default('room'),
    description: text('description'),
    location: text('location'),
    capacity: integer('capacity'),
    features: text('features', { mode: 'json' }).$type<string[]>().notNull().default([]),
    photoUrl: text('photo_url'),
    color: text('color'),
    /** When false, bookings by `facilities.book` holders are approved at once. */
    requiresApproval: integer('requires_approval', { mode: 'boolean' }).notNull().default(true),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('facility_resources_church_name_unique').on(table.churchId, table.name)],
);

/**
 * A booking, optionally repeating weekly until `recurrence_until`. Conflicts are detected by the
 * API against approved bookings of the same resource, expanding recurrences.
 */
export const facilityBookings = sqliteTable(
  'facility_bookings',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => facilityResources.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    purpose: text('purpose'),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    recurrence: text('recurrence', { enum: ['none', 'weekly'] })
      .notNull()
      .default('none'),
    /** Last date (YYYY-MM-DD) a weekly booking repeats on. */
    recurrenceUntil: text('recurrence_until'),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'cancelled'] })
      .notNull()
      .default('pending'),
    expectedAttendees: integer('expected_attendees'),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),
    eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
    requestedBy: text('requested_by').references(() => users.id, { onDelete: 'set null' }),
    decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: text('decided_at'),
    decisionNote: text('decision_note'),
    cancelledAt: text('cancelled_at'),
    cancelledBy: text('cancelled_by').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('facility_bookings_resource_starts_idx').on(table.resourceId, table.startsAt),
    index('facility_bookings_church_status_idx').on(table.churchId, table.status, table.startsAt),
    index('facility_bookings_requester_idx').on(table.requestedBy),
  ],
);

/** A single skipped occurrence of a weekly booking. */
export const facilityBookingExceptions = sqliteTable(
  'facility_booking_exceptions',
  {
    bookingId: text('booking_id')
      .notNull()
      .references(() => facilityBookings.id, { onDelete: 'cascade' }),
    occurrenceDate: text('occurrence_date').notNull(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.bookingId, table.occurrenceDate] })],
);

/** Inventaris. `code` is generated per church (e.g. "INV-0042") and printed on the QR label. */
export const inventoryAssets = sqliteTable(
  'inventory_assets',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    category: text('category'),
    description: text('description'),
    resourceId: text('resource_id').references(() => facilityResources.id, {
      onDelete: 'set null',
    }),
    location: text('location'),
    condition: text('condition', { enum: ['new', 'good', 'fair', 'poor', 'broken'] })
      .notNull()
      .default('good'),
    status: text('status', { enum: ['available', 'on_loan', 'maintenance', 'retired', 'lost'] })
      .notNull()
      .default('available'),
    acquisitionDate: text('acquisition_date'),
    acquisitionValue: integer('acquisition_value'),
    custodianPersonId: text('custodian_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    serialNumber: text('serial_number'),
    photoUrl: text('photo_url'),
    notes: text('notes'),
    retiredAt: text('retired_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('inventory_assets_church_code_unique').on(table.churchId, table.code),
    index('inventory_assets_church_category_idx').on(table.churchId, table.category),
    index('inventory_assets_custodian_idx').on(table.custodianPersonId),
  ],
);

/** Check-out and return of an asset. At most one open loan per asset. */
export const assetLoans = sqliteTable(
  'asset_loans',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => inventoryAssets.id, { onDelete: 'cascade' }),
    borrowerPersonId: text('borrower_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    borrowerName: text('borrower_name').notNull(),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),
    checkedOutAt: text('checked_out_at').notNull(),
    dueDate: text('due_date'),
    returnedAt: text('returned_at'),
    conditionOut: text('condition_out', { enum: ['new', 'good', 'fair', 'poor', 'broken'] }),
    conditionIn: text('condition_in', { enum: ['new', 'good', 'fair', 'poor', 'broken'] }),
    notes: text('notes'),
    checkedOutBy: text('checked_out_by').references(() => users.id, { onDelete: 'set null' }),
    returnedTo: text('returned_to').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('asset_loans_asset_idx').on(table.assetId, table.checkedOutAt),
    index('asset_loans_church_open_idx').on(table.churchId, table.returnedAt, table.dueDate),
    uniqueIndex('asset_loans_open_unique')
      .on(table.assetId)
      .where(sql`returned_at is null`),
  ],
);

export const assetMaintenance = sqliteTable(
  'asset_maintenance',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => inventoryAssets.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    kind: text('kind', { enum: ['inspection', 'repair', 'service', 'cleaning', 'other'] })
      .notNull()
      .default('service'),
    description: text('description').notNull(),
    cost: integer('cost'),
    performedBy: text('performed_by'),
    nextDueDate: text('next_due_date'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('asset_maintenance_asset_date_idx').on(table.assetId, table.date)],
);

export type FacilityResourceRow = typeof facilityResources.$inferSelect;
export type FacilityBookingRow = typeof facilityBookings.$inferSelect;
export type FacilityBookingExceptionRow = typeof facilityBookingExceptions.$inferSelect;
export type InventoryAssetRow = typeof inventoryAssets.$inferSelect;
export type AssetLoanRow = typeof assetLoans.$inferSelect;
export type AssetMaintenanceRow = typeof assetMaintenance.$inferSelect;
