import { and, eq } from 'drizzle-orm';
import type { Queryable } from '../../db/client';
import type {
  AssetLoanRow,
  AssetMaintenanceRow,
  FacilityBookingRow,
  FacilityResourceRow,
  GroupRow,
  InventoryAssetRow,
  PersonRow,
} from '../../db/schema';
import {
  assetLoans,
  assetMaintenance,
  events,
  facilityBookings,
  facilityResources,
  groups,
  inventoryAssets,
  people,
} from '../../db/schema';
import { notFound } from '../../lib/errors';

/*
 * Loaders for rows named by id in a request. Every one is scoped to the church and answers 404
 * otherwise, so an id from another church never reaches a write (no cross-church IDOR).
 */

export function loadResource(db: Queryable, churchId: string, id: string): FacilityResourceRow {
  const row = db
    .select()
    .from(facilityResources)
    .where(and(eq(facilityResources.id, id), eq(facilityResources.churchId, churchId)))
    .get();
  if (!row) throw notFound('Resource');
  return row;
}

export function loadBooking(db: Queryable, churchId: string, id: string): FacilityBookingRow {
  const row = db
    .select()
    .from(facilityBookings)
    .where(and(eq(facilityBookings.id, id), eq(facilityBookings.churchId, churchId)))
    .get();
  if (!row) throw notFound('Booking');
  return row;
}

export function loadAsset(db: Queryable, churchId: string, id: string): InventoryAssetRow {
  const row = db
    .select()
    .from(inventoryAssets)
    .where(and(eq(inventoryAssets.id, id), eq(inventoryAssets.churchId, churchId)))
    .get();
  if (!row) throw notFound('Asset');
  return row;
}

export function loadLoan(db: Queryable, churchId: string, id: string): AssetLoanRow {
  const row = db
    .select()
    .from(assetLoans)
    .where(and(eq(assetLoans.id, id), eq(assetLoans.churchId, churchId)))
    .get();
  if (!row) throw notFound('Loan');
  return row;
}

export function loadMaintenance(db: Queryable, churchId: string, id: string): AssetMaintenanceRow {
  const row = db
    .select()
    .from(assetMaintenance)
    .where(and(eq(assetMaintenance.id, id), eq(assetMaintenance.churchId, churchId)))
    .get();
  if (!row) throw notFound('Maintenance entry');
  return row;
}

export function loadPerson(db: Queryable, churchId: string, id: string): PersonRow {
  const row = db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.churchId, churchId)))
    .get();
  if (!row) throw notFound('Person');
  return row;
}

export function loadGroup(db: Queryable, churchId: string, id: string): GroupRow {
  const row = db
    .select()
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.churchId, churchId)))
    .get();
  if (!row) throw notFound('Group');
  return row;
}

export function assertEventInChurch(db: Queryable, churchId: string, id: string | null): void {
  if (!id) return;
  const row = db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, id), eq(events.churchId, churchId)))
    .get();
  if (!row) throw notFound('Event');
}
