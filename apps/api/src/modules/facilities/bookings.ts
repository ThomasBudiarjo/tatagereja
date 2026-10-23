import {
  bookingAvailabilityBodySchema,
  bookingOccurrences,
  canCancelBooking,
  canEditBooking,
  canManageFacilities,
  cancelBookingBodySchema,
  churchIdParamsSchema,
  churchParamsSchema,
  decideBookingBodySchema,
  facilityBookingInputSchema,
  facilityBookingListQuerySchema,
  facilityScheduleQuerySchema,
  occurrenceDateOf,
  type AccessLike,
  type FacilityBookingInput,
  type ValidationIssue,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, inArray, like, not, or, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow, FacilityBookingRow, FacilityResourceRow } from '../../db/schema';
import { facilityBookingExceptions, facilityBookings, facilityResources } from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso, toUtcIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit, type AuditContext } from '../../services/audit';
import {
  bookingSpan,
  conflictMessage,
  describeRange,
  expandOccurrences,
  findOverlaps,
  hydrateBookings,
  hydrateResources,
  intersectsWindow,
} from '../../services/facilities';
import { notify } from '../../services/notifications';
import { BookingConflictError } from './errors';
import { assertEventInChurch, loadBooking, loadGroup, loadResource } from './load';
import { FACILITIES_VIEW } from './resources';

const REQUEST = ['facilities.book', 'facilities.manage'] as const;
/** A start this far in the past still counts as "now" (clock drift, slow forms). */
const PAST_GRACE_MS = 5 * 60_000;
const OCCURRENCES_SHOWN = 26;
const FAR_FUTURE = '9999-12-31T00:00:00.000Z';

type Times = Pick<
  FacilityBookingInput,
  'resourceId' | 'startsAt' | 'endsAt' | 'recurrence' | 'recurrenceUntil'
>;

/** Stored form of the requested times: UTC instants, and no end date for one-off bookings. */
const normalizeTimes = (body: Times) => ({
  resourceId: body.resourceId,
  startsAt: toUtcIso(body.startsAt),
  endsAt: toUtcIso(body.endsAt),
  recurrence: body.recurrence,
  recurrenceUntil: body.recurrence === 'weekly' ? body.recurrenceUntil : null,
});

/** Managers see every booking; others see approved ones and their own. */
const canSeeBooking = (
  access: Pick<AccessLike, 'permissions' | 'userId'>,
  row: Pick<FacilityBookingRow, 'status' | 'requestedBy'>,
) => canManageFacilities(access) || row.status === 'approved' || row.requestedBy === access.userId;

const snapshot = (row: FacilityBookingRow) => ({
  resourceId: row.resourceId,
  title: row.title,
  purpose: row.purpose,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  recurrence: row.recurrence,
  recurrenceUntil: row.recurrenceUntil,
  status: row.status,
  expectedAttendees: row.expectedAttendees,
  groupId: row.groupId,
  eventId: row.eventId,
});

/** The booking page, as an in-app link for notifications. */
const bookingLink = (churchId: string, id: string) => `/c/${churchId}/facilities/bookings/${id}`;

/**
 * Bookings: requests (`facilities.book`), approval (`facilities.manage`, whose own bookings are
 * approved at once), cancellation of a booking or one date of a weekly one, the availability
 * check used while filling the form, and the schedule of every resource.
 */
export const bookingsRouter = (deps: Deps) => {
  const { db } = deps;

  const hydrateOne = (
    row: FacilityBookingRow,
    access: Pick<AccessLike, 'permissions' | 'userId'>,
  ) => {
    const [booking] = hydrateBookings(db, [row], access);
    if (!booking) throw notFound('Booking');
    return booking;
  };

  /** A resource people can book: inactive ones are hidden from requesters and refused for managers. */
  const bookableResource = (
    churchId: string,
    access: Pick<AccessLike, 'permissions'>,
    id: string,
  ): FacilityResourceRow => {
    const resource = loadResource(db, churchId, id);
    if (!resource.isActive) {
      if (!canManageFacilities(access)) throw notFound('Resource');
      throw conflict(`${resource.name} is not available for booking at the moment`);
    }
    return resource;
  };

  /** Rules that need the church: linked rows, capacity, and no requests in the past. */
  const validateRequest = (
    church: ChurchRow,
    access: Pick<AccessLike, 'permissions'>,
    resource: FacilityResourceRow,
    body: FacilityBookingInput,
    checkStart: boolean,
  ) => {
    if (body.groupId) loadGroup(db, church.id, body.groupId);
    assertEventInChurch(db, church.id, body.eventId);
    const issues: ValidationIssue[] = [];
    if (
      checkStart &&
      !canManageFacilities(access) &&
      new Date(body.startsAt).getTime() < Date.now() - PAST_GRACE_MS
    ) {
      issues.push({ path: 'startsAt', message: 'Choose a start time in the future' });
    }
    if (resource.capacity && body.expectedAttendees && body.expectedAttendees > resource.capacity) {
      issues.push({
        path: 'expectedAttendees',
        message: `${resource.name} holds at most ${resource.capacity} people`,
      });
    }
    if (issues.length > 0) throw validationError('Check the booking details', issues);
  };

  /** Throws 409 SCHEDULING_CONFLICT when an approved booking overlaps any occurrence. */
  const assertFree = (
    tx: Queryable,
    church: ChurchRow,
    resource: FacilityResourceRow,
    times: ReturnType<typeof normalizeTimes> & { skippedDates?: string[] },
    excludeBookingId?: string,
  ) => {
    const found = findOverlaps(tx, church.id, times, {
      statuses: ['approved'],
      excludeBookingId,
    });
    if (found.total > 0) {
      throw new BookingConflictError(
        conflictMessage(resource.name, found.conflicts, found.total, church.timezone),
        found.conflicts,
      );
    }
  };

  const notifyManagers = (
    tx: Queryable,
    church: ChurchRow,
    row: FacilityBookingRow,
    resource: FacilityResourceRow,
    actor: { userId: string; name: string },
    changed: boolean,
  ) =>
    notify(tx, {
      churchId: church.id,
      audience: { kind: 'permission', permission: 'facilities.manage' },
      excludeUserIds: [actor.userId],
      type: 'booking.requested',
      title: changed
        ? `${actor.name} changed a booking of ${resource.name}`
        : `${actor.name} requests ${resource.name}`,
      body: `${row.title} · ${describeRange(row.startsAt, row.endsAt, church.timezone)}${row.recurrence === 'weekly' ? ' · weekly' : ''}`,
      link: bookingLink(church.id, row.id),
      entityType: 'facility_booking',
      entityId: row.id,
    });

  const auditEntry = (
    tx: Queryable,
    audit: AuditContext,
    action: string,
    row: FacilityBookingRow,
    summary: string,
    extra: { before?: unknown; after?: unknown } = {},
  ) =>
    recordAudit(tx, audit, {
      module: 'facilities',
      action,
      entityType: 'facility_booking',
      entityId: row.id,
      summary,
      ...extra,
    });

  return new Elysia({ prefix: '/churches/:churchId/facilities' })
    .use(authPlugin(deps))
    .get(
      '/bookings',
      ({ church, access, query }) => {
        const conditions: SQL[] = [eq(facilityBookings.churchId, church.id)];
        if (!canManageFacilities(access)) {
          const visible = or(
            eq(facilityBookings.status, 'approved'),
            eq(facilityBookings.requestedBy, access.userId),
          );
          if (visible) conditions.push(visible);
        }
        if (query.mine) conditions.push(eq(facilityBookings.requestedBy, access.userId));
        if (query.resourceId) conditions.push(eq(facilityBookings.resourceId, query.resourceId));
        if (query.status) conditions.push(eq(facilityBookings.status, query.status));
        if (query.q) conditions.push(like(facilityBookings.title, likePattern(query.q)));
        const upcoming = intersectsWindow(nowIso(), FAR_FUTURE);
        if (query.scope === 'upcoming') conditions.push(upcoming);
        if (query.scope === 'past') conditions.push(not(upcoming));
        if (query.from || query.to) {
          conditions.push(
            intersectsWindow(
              query.from ? toUtcIso(query.from) : '0000',
              query.to ? toUtcIso(query.to) : FAR_FUTURE,
            ),
          );
        }
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(facilityBookings).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(facilityBookings)
          .where(where)
          .orderBy(
            query.scope === 'upcoming'
              ? asc(facilityBookings.startsAt)
              : desc(facilityBookings.startsAt),
            asc(facilityBookings.id),
          )
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: hydrateBookings(db, rows, access),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      {
        church: { module: 'facilities', permission: FACILITIES_VIEW },
        params: churchParamsSchema,
        query: facilityBookingListQuerySchema,
      },
    )
    .post(
      '/bookings/check',
      ({ church, access, body }) => {
        const resource = loadResource(db, church.id, body.resourceId);
        if (!resource.isActive && !canManageFacilities(access)) throw notFound('Resource');
        const times = normalizeTimes(body);
        const exclude = body.excludeBookingId ?? undefined;
        const approved = findOverlaps(db, church.id, times, {
          statuses: ['approved'],
          excludeBookingId: exclude,
        });
        const pending = findOverlaps(db, church.id, times, {
          statuses: ['pending'],
          excludeBookingId: exclude,
        });
        const span = bookingSpan(times);
        return {
          available: approved.total === 0,
          conflicts: approved.conflicts,
          pendingOverlaps: pending.total,
          occurrenceCount: bookingOccurrences(times, span.from, span.to).length,
          autoApproved: canManageFacilities(access) || !resource.requiresApproval,
        };
      },
      {
        church: { module: 'facilities', permission: REQUEST },
        params: churchParamsSchema,
        body: bookingAvailabilityBodySchema,
      },
    )
    .post(
      '/bookings',
      ({ church, access, auth, audit, body, set }) => {
        const resource = bookableResource(church.id, access, body.resourceId);
        validateRequest(church, access, resource, body, true);
        const times = normalizeTimes(body);
        const autoApproved = canManageFacilities(access) || !resource.requiresApproval;
        const now = nowIso();
        const row = db.transaction((tx) => {
          // Checked inside the transaction: SQLite serialises writers, so two requests for the
          // same slot cannot both pass.
          assertFree(tx, church, resource, times);
          const created = tx
            .insert(facilityBookings)
            .values({
              id: newId(),
              churchId: church.id,
              ...times,
              title: body.title,
              purpose: body.purpose,
              expectedAttendees: body.expectedAttendees,
              groupId: body.groupId,
              eventId: body.eventId,
              notes: body.notes,
              status: autoApproved ? 'approved' : 'pending',
              requestedBy: auth.user.id,
              decidedBy: autoApproved ? auth.user.id : null,
              decidedAt: autoApproved ? now : null,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          auditEntry(
            tx,
            audit,
            'booking.create',
            created,
            `${autoApproved ? 'Booked' : 'Requested'} ${resource.name} for ${created.title}`,
            { after: snapshot(created) },
          );
          if (!autoApproved) {
            notifyManagers(
              tx,
              church,
              created,
              resource,
              { userId: auth.user.id, name: auth.user.name },
              false,
            );
          }
          return created;
        });
        set.status = 201;
        return { booking: hydrateOne(row, access) };
      },
      {
        church: { module: 'facilities', permission: REQUEST },
        params: churchParamsSchema,
        body: facilityBookingInputSchema,
      },
    )
    .get(
      '/bookings/:id',
      ({ church, access, params }) => {
        const row = loadBooking(db, church.id, params.id);
        if (!canSeeBooking(access, row)) throw notFound('Booking');
        const booking = hydrateOne(row, access);
        const conflicts =
          row.status === 'pending'
            ? findOverlaps(
                db,
                church.id,
                { ...row, skippedDates: booking.skippedDates },
                { statuses: ['approved'], excludeBookingId: row.id },
              ).conflicts
            : [];
        const live = row.status === 'pending' || row.status === 'approved';
        const upcoming = live
          ? bookingOccurrences(row, nowIso(), FAR_FUTURE, booking.skippedDates).slice(
              0,
              OCCURRENCES_SHOWN,
            )
          : [];
        return {
          booking,
          conflicts,
          occurrences:
            upcoming.length > 0 || row.recurrence === 'weekly'
              ? upcoming
              : [{ startsAt: row.startsAt, endsAt: row.endsAt }],
        };
      },
      {
        church: { module: 'facilities', permission: FACILITIES_VIEW },
        params: churchIdParamsSchema,
      },
    )
    .patch(
      '/bookings/:id',
      ({ church, access, auth, audit, params, body }) => {
        const row = loadBooking(db, church.id, params.id);
        if (!canSeeBooking(access, row)) throw notFound('Booking');
        if (!canEditBooking(access, row)) throw forbidden('You cannot change this booking');
        const resource = bookableResource(church.id, access, body.resourceId);
        const times = normalizeTimes(body);
        const timesChanged =
          times.resourceId !== row.resourceId ||
          times.startsAt !== row.startsAt ||
          times.endsAt !== row.endsAt ||
          times.recurrence !== row.recurrence ||
          times.recurrenceUntil !== row.recurrenceUntil;
        validateRequest(church, access, resource, body, times.startsAt !== row.startsAt);
        const manager = canManageFacilities(access);
        // A requester's new times go back for approval when the resource needs it.
        const status =
          manager || !timesChanged
            ? row.status
            : resource.requiresApproval
              ? 'pending'
              : 'approved';
        const updated = db.transaction((tx) => {
          if (timesChanged) assertFree(tx, church, resource, times, row.id);
          if (times.startsAt !== row.startsAt || times.recurrence !== 'weekly') {
            // Skipped dates belong to the old start; they no longer match.
            tx.delete(facilityBookingExceptions)
              .where(eq(facilityBookingExceptions.bookingId, row.id))
              .run();
          }
          const next = tx
            .update(facilityBookings)
            .set({
              ...times,
              title: body.title,
              purpose: body.purpose,
              expectedAttendees: body.expectedAttendees,
              groupId: body.groupId,
              eventId: body.eventId,
              notes: body.notes,
              status,
              ...(status !== row.status
                ? status === 'pending'
                  ? { decidedBy: null, decidedAt: null, decisionNote: null }
                  : { decidedBy: auth.user.id, decidedAt: nowIso() }
                : {}),
              updatedAt: nowIso(),
            })
            .where(eq(facilityBookings.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Booking');
          auditEntry(tx, audit, 'booking.update', next, `Changed the booking ${next.title}`, {
            ...changes(snapshot(row), snapshot(next)),
          });
          if (status === 'pending' && timesChanged) {
            notifyManagers(
              tx,
              church,
              next,
              resource,
              { userId: auth.user.id, name: auth.user.name },
              true,
            );
          }
          return next;
        });
        return { booking: hydrateOne(updated, access) };
      },
      {
        church: { module: 'facilities', permission: REQUEST },
        params: churchIdParamsSchema,
        body: facilityBookingInputSchema,
      },
    )
    .post(
      '/bookings/:id/decision',
      ({ church, access, auth, audit, params, body }) => {
        const row = loadBooking(db, church.id, params.id);
        if (row.status !== 'pending') {
          throw conflict('Only bookings waiting for approval can be approved or rejected');
        }
        const resource = loadResource(db, church.id, row.resourceId);
        const approve = body.decision === 'approved';
        const updated = db.transaction((tx) => {
          if (approve) {
            const skipped = tx
              .select({ date: facilityBookingExceptions.occurrenceDate })
              .from(facilityBookingExceptions)
              .where(eq(facilityBookingExceptions.bookingId, row.id))
              .all()
              .map((item) => item.date);
            assertFree(tx, church, resource, { ...row, skippedDates: skipped }, row.id);
          }
          const next = tx
            .update(facilityBookings)
            .set({
              status: body.decision,
              decidedBy: auth.user.id,
              decidedAt: nowIso(),
              decisionNote: body.note,
              updatedAt: nowIso(),
            })
            .where(and(eq(facilityBookings.id, row.id), eq(facilityBookings.status, 'pending')))
            .returning()
            .get();
          if (!next) throw conflict('This booking was decided in the meantime');
          auditEntry(
            tx,
            audit,
            approve ? 'booking.approve' : 'booking.reject',
            next,
            `${approve ? 'Approved' : 'Rejected'} the booking ${next.title} of ${resource.name}`,
            { before: { status: row.status }, after: { status: next.status } },
          );
          if (next.requestedBy) {
            notify(tx, {
              churchId: church.id,
              userIds: [next.requestedBy],
              excludeUserIds: [access.userId],
              type: 'booking.decided',
              title: approve
                ? `Your booking of ${resource.name} is approved`
                : `Your booking of ${resource.name} was not approved`,
              body: `${next.title} · ${describeRange(next.startsAt, next.endsAt, church.timezone)}${body.note ? ` · ${body.note}` : ''}`,
              link: bookingLink(church.id, next.id),
              entityType: 'facility_booking',
              entityId: next.id,
            });
          }
          return next;
        });
        return { booking: hydrateOne(updated, access) };
      },
      {
        church: { module: 'facilities', permission: 'facilities.manage' },
        params: churchIdParamsSchema,
        body: decideBookingBodySchema,
      },
    )
    .post(
      '/bookings/:id/cancel',
      ({ church, access, auth, audit, params, body }) => {
        const row = loadBooking(db, church.id, params.id);
        if (!canSeeBooking(access, row)) throw notFound('Booking');
        if (!canCancelBooking(access, row)) throw forbidden('You cannot cancel this booking');
        if (row.status !== 'pending' && row.status !== 'approved') {
          throw conflict('This booking is no longer active');
        }
        const resource = loadResource(db, church.id, row.resourceId);
        const occurrenceDate = body.occurrenceDate;
        if (occurrenceDate) {
          if (row.recurrence !== 'weekly') {
            throw validationError('Only weekly bookings have single dates to cancel', [
              { path: 'occurrenceDate', message: 'This booking does not repeat' },
            ]);
          }
          const takesPlace = bookingOccurrences(row, row.startsAt, FAR_FUTURE).some(
            (item) => occurrenceDateOf(item.startsAt) === occurrenceDate,
          );
          if (!takesPlace) {
            throw validationError('This booking does not take place on that date', [
              { path: 'occurrenceDate', message: 'This booking does not take place on that date' },
            ]);
          }
        }
        const updated = db.transaction((tx) => {
          let next = row;
          if (occurrenceDate) {
            tx.insert(facilityBookingExceptions)
              .values({
                bookingId: row.id,
                occurrenceDate,
                churchId: church.id,
                createdAt: nowIso(),
              })
              .onConflictDoNothing()
              .run();
            auditEntry(
              tx,
              audit,
              'booking.cancel_occurrence',
              row,
              `Cancelled ${row.title} on ${occurrenceDate}`,
              { after: { occurrenceDate, reason: body.reason } },
            );
          } else {
            const changed = tx
              .update(facilityBookings)
              .set({
                status: 'cancelled',
                cancelledAt: nowIso(),
                cancelledBy: auth.user.id,
                decisionNote: body.reason ?? row.decisionNote,
                updatedAt: nowIso(),
              })
              .where(eq(facilityBookings.id, row.id))
              .returning()
              .get();
            if (!changed) throw notFound('Booking');
            next = changed;
            auditEntry(tx, audit, 'booking.cancel', next, `Cancelled the booking ${next.title}`, {
              before: { status: row.status },
              after: { status: next.status, reason: body.reason },
            });
          }
          if (row.requestedBy && row.requestedBy !== access.userId) {
            notify(tx, {
              churchId: church.id,
              userIds: [row.requestedBy],
              type: 'booking.cancelled',
              title: occurrenceDate
                ? `One date of your booking of ${resource.name} was cancelled`
                : `Your booking of ${resource.name} was cancelled`,
              body: `${row.title}${occurrenceDate ? ` · ${occurrenceDate}` : ''}${body.reason ? ` · ${body.reason}` : ''}`,
              link: bookingLink(church.id, row.id),
              entityType: 'facility_booking',
              entityId: row.id,
            });
          }
          return next;
        });
        return { booking: hydrateOne(updated, access) };
      },
      {
        church: { module: 'facilities', permission: REQUEST },
        params: churchIdParamsSchema,
        body: cancelBookingBodySchema,
      },
    )
    .get(
      '/schedule',
      ({ church, access, query }) => {
        const manager = canManageFacilities(access);
        const conditions: SQL[] = [eq(facilityResources.churchId, church.id)];
        if (query.resourceId) {
          const resource = loadResource(db, church.id, query.resourceId);
          if (!resource.isActive && !manager) throw notFound('Resource');
          conditions.push(eq(facilityResources.id, resource.id));
        } else {
          conditions.push(eq(facilityResources.isActive, true));
        }
        const resources = db
          .select()
          .from(facilityResources)
          .where(and(...conditions))
          .orderBy(asc(facilityResources.name))
          .all();
        if (resources.length === 0) return { items: [] };
        const from = toUtcIso(query.from);
        const to = toUtcIso(query.to);
        const statuses = query.includePending
          ? (['approved', 'pending'] as const)
          : (['approved'] as const);
        const rows = db
          .select()
          .from(facilityBookings)
          .where(
            and(
              eq(facilityBookings.churchId, church.id),
              inArray(
                facilityBookings.resourceId,
                resources.map((resource) => resource.id),
              ),
              inArray(facilityBookings.status, [...statuses]),
              intersectsWindow(from, to),
            ),
          )
          .all()
          .filter(
            (row) => row.status === 'approved' || manager || row.requestedBy === access.userId,
          );
        const occurrences = expandOccurrences(db, rows, from, to);
        return {
          items: hydrateResources(db, church.id, resources).map((resource) => ({
            resource,
            occurrences: occurrences.filter((item) => item.resourceId === resource.id),
          })),
        };
      },
      {
        church: { module: 'facilities', permission: FACILITIES_VIEW },
        params: churchParamsSchema,
        query: facilityScheduleQuerySchema,
      },
    );
};
