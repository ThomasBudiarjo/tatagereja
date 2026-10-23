import {
  FACILITIES_LIMITS,
  bookingOccurrences,
  canSeeBookingNotes,
  dateTimeFormat,
  isLoanOverdue,
  type AccessLike,
  type AssetLoan,
  type BookingConflict,
  type BookingOccurrence,
  type BookingRecurrence,
  type BookingStatus,
  type FacilityBooking,
  type FacilityResource,
  type InventoryAsset,
  type Locale,
} from '@tatagereja/shared';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';
import type { Queryable } from '../db/client';
import type {
  AssetLoanRow,
  FacilityBookingRow,
  FacilityResourceRow,
  InventoryAssetRow,
} from '../db/schema';
import {
  assetLoans,
  assetMaintenance,
  facilityBookingExceptions,
  facilityBookings,
  facilityResources,
  groups,
  inventoryAssets,
  people,
  users,
} from '../db/schema';
import {
  toAssetLoan,
  toFacilityBooking,
  toFacilityResource,
  toInventoryAsset,
} from '../modules/facilities/serializers';

const DAY_MS = 86_400_000;
/** How far ahead resource cards look for the next booking. */
const NEXT_BOOKING_DAYS = 60;
/** Conflicts listed in one answer. */
export const CONFLICTS_MAX = 10;

/** `YYYY-MM-DD` of an instant in the church time zone. */
export function dateIn(timeZone: string, at: Date = new Date()): string {
  try {
    return dateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** "Sun 25 Oct 2026, 10:00–12:00" in the church time zone, for English server messages. */
export function describeRange(
  startsAt: string,
  endsAt: string,
  timeZone: string,
  locale: Locale = 'en',
): string {
  const tag = locale === 'id' ? 'id-ID' : 'en-GB';
  const options = (extra: Intl.DateTimeFormatOptions) => {
    try {
      return dateTimeFormat(tag, { timeZone, ...extra });
    } catch {
      return dateTimeFormat(tag, { timeZone: 'UTC', ...extra });
    }
  };
  const day = options({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = options({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const sameDay = day.format(start) === day.format(end);
  return sameDay
    ? `${day.format(start)}, ${time.format(start)}–${time.format(end)}`
    : `${day.format(start)}, ${time.format(start)} – ${day.format(end)}, ${time.format(end)}`;
}

/** Skipped occurrence dates of weekly bookings, keyed by booking id. */
export function skippedDatesOf(
  db: Queryable,
  bookingIds: readonly string[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (bookingIds.length === 0) return map;
  for (const row of db
    .select({
      bookingId: facilityBookingExceptions.bookingId,
      date: facilityBookingExceptions.occurrenceDate,
    })
    .from(facilityBookingExceptions)
    .where(inArray(facilityBookingExceptions.bookingId, [...bookingIds]))
    .orderBy(asc(facilityBookingExceptions.occurrenceDate))
    .all()) {
    const list = map.get(row.bookingId) ?? [];
    list.push(row.date);
    map.set(row.bookingId, list);
  }
  return map;
}

/**
 * SQL for bookings that may have an occurrence intersecting `[from, to)`. Weekly bookings are
 * kept while their last repeat could still reach `from`; callers expand them exactly with
 * `bookingOccurrences`.
 */
export function intersectsWindow(from: string, to: string): SQL {
  const earliestStart = new Date(
    new Date(from).getTime() - FACILITIES_LIMITS.bookingHoursMax * 3_600_000,
  )
    .toISOString()
    .slice(0, 10);
  return and(
    lt(facilityBookings.startsAt, to),
    or(
      gt(facilityBookings.endsAt, from),
      and(
        eq(facilityBookings.recurrence, 'weekly'),
        isNotNull(facilityBookings.recurrenceUntil),
        gt(facilityBookings.recurrenceUntil, earliestStart),
      ),
    ),
  ) as SQL;
}

type Candidate = {
  resourceId: string;
  startsAt: string;
  endsAt: string;
  recurrence: BookingRecurrence;
  recurrenceUntil: string | null;
};

/** The first and last instant a booking (all its occurrences) covers. */
export function bookingSpan(candidate: Candidate): { from: string; to: string } {
  const all = bookingOccurrences(
    candidate,
    candidate.startsAt,
    new Date(new Date(candidate.startsAt).getTime() + 800 * DAY_MS).toISOString(),
  );
  return {
    from: candidate.startsAt,
    to: all.at(-1)?.endsAt ?? candidate.endsAt,
  };
}

/** Requester names of bookings, keyed by user id. */
function userNames(db: Queryable, ids: readonly (string | null)[]): Map<string, string> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  const map = new Map<string, string>();
  if (wanted.length === 0) return map;
  for (const row of db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, wanted))
    .all()) {
    map.set(row.id, row.name);
  }
  return map;
}

function groupNames(db: Queryable, ids: readonly (string | null)[]): Map<string, string> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  const map = new Map<string, string>();
  if (wanted.length === 0) return map;
  for (const row of db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(inArray(groups.id, wanted))
    .all()) {
    map.set(row.id, row.name);
  }
  return map;
}

/**
 * Bookings of the resource with the given statuses that overlap any occurrence of `candidate`,
 * as one entry per overlapping occurrence (earliest first, at most `CONFLICTS_MAX`).
 */
export function findOverlaps(
  db: Queryable,
  churchId: string,
  candidate: Candidate & { skippedDates?: readonly string[] },
  options: { statuses: readonly BookingStatus[]; excludeBookingId?: string | null },
): { conflicts: BookingConflict[]; total: number } {
  const span = bookingSpan(candidate);
  const conditions: SQL[] = [
    eq(facilityBookings.churchId, churchId),
    eq(facilityBookings.resourceId, candidate.resourceId),
    inArray(facilityBookings.status, [...options.statuses]),
    intersectsWindow(span.from, span.to),
  ];
  if (options.excludeBookingId) {
    conditions.push(ne(facilityBookings.id, options.excludeBookingId));
  }
  const rows = db
    .select()
    .from(facilityBookings)
    .where(and(...conditions))
    .all();
  if (rows.length === 0) return { conflicts: [], total: 0 };
  const skips = skippedDatesOf(
    db,
    rows.map((row) => row.id),
  );
  const mine = bookingOccurrences(candidate, span.from, span.to, candidate.skippedDates ?? []);
  const names = userNames(
    db,
    rows.map((row) => row.requestedBy),
  );
  const found: BookingConflict[] = [];
  for (const row of rows) {
    const theirs = bookingOccurrences(row, span.from, span.to, skips.get(row.id) ?? []);
    for (const occurrence of theirs) {
      const start = new Date(occurrence.startsAt).getTime();
      const end = new Date(occurrence.endsAt).getTime();
      if (
        mine.some(
          (own) => new Date(own.startsAt).getTime() < end && start < new Date(own.endsAt).getTime(),
        )
      ) {
        found.push({
          bookingId: row.id,
          title: row.title,
          startsAt: occurrence.startsAt,
          endsAt: occurrence.endsAt,
          requesterName: row.requestedBy ? (names.get(row.requestedBy) ?? null) : null,
        });
      }
    }
  }
  found.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { conflicts: found.slice(0, CONFLICTS_MAX), total: found.length };
}

/** A plain English explanation of the first conflicts, used as the 409 message. */
export function conflictMessage(
  resourceName: string,
  conflicts: readonly BookingConflict[],
  total: number,
  timeZone: string,
): string {
  const first = conflicts[0];
  if (!first) return `${resourceName} is already booked at that time`;
  const who = first.requesterName ? ` (booked by ${first.requesterName})` : '';
  const more = total > 1 ? ` and ${total - 1} more time${total - 1 === 1 ? '' : 's'}` : '';
  return `${resourceName} is already booked for "${first.title}" on ${describeRange(first.startsAt, first.endsAt, timeZone)}${who}${more}. Choose another time or resource.`;
}

/** The next occurrence that has not ended yet. */
function nextOccurrenceOf(
  row: FacilityBookingRow,
  skipped: readonly string[],
  now: number,
): { startsAt: string; endsAt: string } | null {
  const nowIso = new Date(now).toISOString();
  const [next] = bookingOccurrences(
    row,
    nowIso,
    new Date(now + (FACILITIES_LIMITS.recurrenceWeeksMax + 2) * 7 * DAY_MS).toISOString(),
    skipped,
  );
  return next ?? null;
}

/** Adds resource, group and people names, skipped dates and the next occurrence. */
export function hydrateBookings(
  db: Queryable,
  rows: FacilityBookingRow[],
  access: Pick<AccessLike, 'permissions' | 'userId'>,
  now = Date.now(),
): FacilityBooking[] {
  if (rows.length === 0) return [];
  const resourceIds = [...new Set(rows.map((row) => row.resourceId))];
  const resources = new Map(
    db
      .select({
        id: facilityResources.id,
        name: facilityResources.name,
        color: facilityResources.color,
      })
      .from(facilityResources)
      .where(inArray(facilityResources.id, resourceIds))
      .all()
      .map((row) => [row.id, row]),
  );
  const names = userNames(db, [
    ...rows.map((row) => row.requestedBy),
    ...rows.map((row) => row.decidedBy),
  ]);
  const groupsById = groupNames(
    db,
    rows.map((row) => row.groupId),
  );
  const skips = skippedDatesOf(
    db,
    rows.filter((row) => row.recurrence === 'weekly').map((row) => row.id),
  );
  return rows.map((row) => {
    const skipped = skips.get(row.id) ?? [];
    return toFacilityBooking(row, {
      resourceName: resources.get(row.resourceId)?.name ?? '',
      resourceColor: resources.get(row.resourceId)?.color ?? null,
      groupName: row.groupId ? (groupsById.get(row.groupId) ?? null) : null,
      requesterName: row.requestedBy ? (names.get(row.requestedBy) ?? null) : null,
      deciderName: row.decidedBy ? (names.get(row.decidedBy) ?? null) : null,
      skippedDates: skipped,
      nextOccurrence:
        row.status === 'cancelled' || row.status === 'rejected'
          ? null
          : nextOccurrenceOf(row, skipped, now),
      showNotes: canSeeBookingNotes(access, row),
    });
  });
}

/**
 * Occurrences of the given bookings intersecting `[from, to)`, earliest first, with requester
 * and group names.
 */
export function expandOccurrences(
  db: Queryable,
  rows: FacilityBookingRow[],
  from: string,
  to: string,
): BookingOccurrence[] {
  if (rows.length === 0) return [];
  const skips = skippedDatesOf(
    db,
    rows.filter((row) => row.recurrence === 'weekly').map((row) => row.id),
  );
  const names = userNames(
    db,
    rows.map((row) => row.requestedBy),
  );
  const groupsById = groupNames(
    db,
    rows.map((row) => row.groupId),
  );
  const items: BookingOccurrence[] = [];
  for (const row of rows) {
    for (const occurrence of bookingOccurrences(row, from, to, skips.get(row.id) ?? [])) {
      items.push({
        bookingId: row.id,
        resourceId: row.resourceId,
        title: row.title,
        status: row.status,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        recurrence: row.recurrence,
        requestedBy: row.requestedBy,
        requesterName: row.requestedBy ? (names.get(row.requestedBy) ?? null) : null,
        groupName: row.groupId ? (groupsById.get(row.groupId) ?? null) : null,
      });
    }
  }
  return items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Resources with "available now", the current and the next approved booking. */
export function hydrateResources(
  db: Queryable,
  churchId: string,
  rows: FacilityResourceRow[],
  now = Date.now(),
): FacilityResource[] {
  if (rows.length === 0) return [];
  const from = new Date(now).toISOString();
  const to = new Date(now + NEXT_BOOKING_DAYS * DAY_MS).toISOString();
  const bookings = db
    .select()
    .from(facilityBookings)
    .where(
      and(
        eq(facilityBookings.churchId, churchId),
        inArray(
          facilityBookings.resourceId,
          rows.map((row) => row.id),
        ),
        eq(facilityBookings.status, 'approved'),
        intersectsWindow(from, to),
      ),
    )
    .all();
  const occurrences = expandOccurrences(db, bookings, from, to);
  return rows.map((row) => {
    const own = occurrences.filter((item) => item.resourceId === row.id);
    const current = own.find((item) => new Date(item.startsAt).getTime() <= now);
    const next = own.find((item) => new Date(item.startsAt).getTime() > now);
    return toFacilityResource(row, {
      currentBooking: current
        ? { bookingId: current.bookingId, title: current.title, endsAt: current.endsAt }
        : null,
      nextBooking: next
        ? { bookingId: next.bookingId, title: next.title, startsAt: next.startsAt }
        : null,
    });
  });
}

/** Loans with borrower summaries, asset and group names and the overdue flag. */
export function hydrateLoans(db: Queryable, rows: AssetLoanRow[], today: string): AssetLoan[] {
  if (rows.length === 0) return [];
  const assetIds = [...new Set(rows.map((row) => row.assetId))];
  const assets = new Map(
    db
      .select({ id: inventoryAssets.id, name: inventoryAssets.name, code: inventoryAssets.code })
      .from(inventoryAssets)
      .where(inArray(inventoryAssets.id, assetIds))
      .all()
      .map((row) => [row.id, row]),
  );
  const personIds = [
    ...new Set(rows.map((row) => row.borrowerPersonId).filter((id): id is string => !!id)),
  ];
  const persons = new Map(
    personIds.length > 0
      ? db
          .select()
          .from(people)
          .where(inArray(people.id, personIds))
          .all()
          .map((row) => [row.id, row])
      : [],
  );
  const groupsById = groupNames(
    db,
    rows.map((row) => row.groupId),
  );
  return rows.map((row) =>
    toAssetLoan(row, {
      assetName: assets.get(row.assetId)?.name ?? '',
      assetCode: assets.get(row.assetId)?.code ?? '',
      borrower: row.borrowerPersonId ? (persons.get(row.borrowerPersonId) ?? null) : null,
      groupName: row.groupId ? (groupsById.get(row.groupId) ?? null) : null,
      isOverdue: isLoanOverdue(row, today),
    }),
  );
}

/** Assets with custodian, resource name, the open loan and the next maintenance date. */
export function hydrateAssets(
  db: Queryable,
  rows: InventoryAssetRow[],
  today: string,
): InventoryAsset[] {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const custodianIds = [
    ...new Set(rows.map((row) => row.custodianPersonId).filter((id): id is string => !!id)),
  ];
  const custodians = new Map(
    custodianIds.length > 0
      ? db
          .select()
          .from(people)
          .where(inArray(people.id, custodianIds))
          .all()
          .map((row) => [row.id, row])
      : [],
  );
  const resourceIds = [
    ...new Set(rows.map((row) => row.resourceId).filter((id): id is string => !!id)),
  ];
  const resources = new Map(
    resourceIds.length > 0
      ? db
          .select({ id: facilityResources.id, name: facilityResources.name })
          .from(facilityResources)
          .where(inArray(facilityResources.id, resourceIds))
          .all()
          .map((row) => [row.id, row.name])
      : [],
  );
  const openLoans = new Map(
    db
      .select()
      .from(assetLoans)
      .where(and(inArray(assetLoans.assetId, ids), isNull(assetLoans.returnedAt)))
      .all()
      .map((row) => [row.assetId, row]),
  );
  const nextMaintenance = nextMaintenanceDates(db, ids);
  return rows.map((row) => {
    const loan = openLoans.get(row.id);
    return toInventoryAsset(row, {
      custodian: row.custodianPersonId ? (custodians.get(row.custodianPersonId) ?? null) : null,
      resourceName: row.resourceId ? (resources.get(row.resourceId) ?? null) : null,
      currentLoan: loan
        ? {
            id: loan.id,
            borrowerName: loan.borrowerName,
            dueDate: loan.dueDate,
            isOverdue: isLoanOverdue(loan, today),
          }
        : null,
      nextMaintenanceDate: nextMaintenance.get(row.id) ?? null,
    });
  });
}

/**
 * When each asset is next due for maintenance: the `nextDueDate` of its latest log entry (a
 * newer service replaces the date an older one planned).
 */
export function nextMaintenanceDates(
  db: Queryable,
  assetIds: readonly string[] | null,
  churchId?: string,
): Map<string, string> {
  const map = new Map<string, string>();
  if (assetIds && assetIds.length === 0) return map;
  const seen = new Set<string>();
  const conditions: SQL[] = [];
  if (assetIds) conditions.push(inArray(assetMaintenance.assetId, [...assetIds]));
  if (churchId) conditions.push(eq(assetMaintenance.churchId, churchId));
  for (const row of db
    .select({
      assetId: assetMaintenance.assetId,
      nextDueDate: assetMaintenance.nextDueDate,
    })
    .from(assetMaintenance)
    .where(and(...conditions))
    .orderBy(desc(assetMaintenance.date), desc(assetMaintenance.createdAt))
    .all()) {
    if (seen.has(row.assetId)) continue;
    seen.add(row.assetId);
    if (row.nextDueDate) map.set(row.assetId, row.nextDueDate);
  }
  return map;
}

/** Start of the current day in the church time zone, as a UTC instant. */
export function startOfDayIn(timeZone: string, at: Date = new Date()): Date {
  let offset = 0;
  try {
    const parts = Object.fromEntries(
      dateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      })
        .formatToParts(at)
        .map((part) => [part.type, part.value]),
    );
    const local = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    offset = Math.round((local - at.getTime()) / 60_000) * 60_000;
  } catch {
    // Unknown time zone: treat it as UTC.
  }
  const [year, month, day] = dateIn(timeZone, at).split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) - offset);
}
