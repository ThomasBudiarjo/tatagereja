import {
  CHECKIN_LIMITS,
  canManageCheckin,
  canOperateCheckin,
  canOverrideCheckout,
  checkOutBodySchema,
  churchIdParamsSchema,
  churchParamsSchema,
  fullName,
  labelsBodySchema,
  overrideCheckOutBodySchema,
  type AccessLike,
} from '@tatagereja/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { CheckinRow } from '../../db/schema';
import { checkinAuthorizedPickups, checkins, checkinSessions, people } from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { enforceRateLimit } from '../../lib/rate-limit';
import { nowIso } from '../../lib/time';
import { safeEqual } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit, type AuditContext } from '../../services/audit';
import {
  guardiansOf,
  guardianUserIds,
  hydrateCheckins,
  isGuardianOf,
  loadCheckinRow,
  loadPerson,
  loadSessionRow,
  toPickup,
} from '../../services/checkin';
import { notify } from '../../services/notifications';

const operate = { module: 'checkin', permission: ['checkin.operate', 'checkin.manage'] } as const;
const manage = { module: 'checkin', permission: 'checkin.manage' } as const;

/** The guardian who checked the child in, or one of the household's guardians. */
const isChildGuardian = (db: Queryable, churchId: string, access: AccessLike, row: CheckinRow) =>
  !!access.personId &&
  (row.guardianPersonId === access.personId ||
    isGuardianOf(db, churchId, access.personId, row.childPersonId));

const pickupsOf = (db: Queryable, churchId: string, childPersonId: string) =>
  db
    .select()
    .from(checkinAuthorizedPickups)
    .where(
      and(
        eq(checkinAuthorizedPickups.churchId, churchId),
        eq(checkinAuthorizedPickups.childPersonId, childPersonId),
      ),
    )
    .all();

/**
 * Check-out with the code from the guardian tag (rate limited and audited when wrong), the
 * coordinator override with a reason, labels and the check-out dialog's pick-up list.
 */
export const checkinCheckinsRouter = (deps: Deps) => {
  const { db } = deps;

  const childName = (churchId: string, personId: string) => {
    const person = db
      .select({ firstName: people.firstName, lastName: people.lastName })
      .from(people)
      .where(and(eq(people.id, personId), eq(people.churchId, churchId)))
      .get();
    return person ? fullName(person) : 'a child';
  };

  /**
   * Who collects the child. A chosen person must be a guardian, the person who brought the
   * child, or on the authorized pick-up list, unless a coordinator overrides.
   */
  const resolvePickup = (
    churchId: string,
    row: CheckinRow,
    input: { pickupPersonId: string | null; pickupName: string | null },
    enforceList: boolean,
  ) => {
    if (input.pickupPersonId) {
      const person = loadPerson(db, churchId, input.pickupPersonId);
      const allowed =
        row.guardianPersonId === person.id ||
        isGuardianOf(db, churchId, person.id, row.childPersonId) ||
        pickupsOf(db, churchId, row.childPersonId).some(
          (item) => item.pickupPersonId === person.id,
        );
      if (enforceList && !allowed) {
        throw forbidden(`${fullName(person)} is not on the pick-up list for this child`);
      }
      return { pickupPersonId: person.id, pickupName: fullName(person) };
    }
    if (input.pickupName) return { pickupPersonId: null, pickupName: input.pickupName };
    if (row.guardianPersonId) {
      const guardian = db
        .select({ firstName: people.firstName, lastName: people.lastName })
        .from(people)
        .where(and(eq(people.id, row.guardianPersonId), eq(people.churchId, churchId)))
        .get();
      if (guardian) return { pickupPersonId: row.guardianPersonId, pickupName: fullName(guardian) };
    }
    return { pickupPersonId: null, pickupName: null };
  };

  const checkOut = (
    churchId: string,
    access: AccessLike,
    audit: AuditContext,
    row: CheckinRow,
    pickup: { pickupPersonId: string | null; pickupName: string | null },
    reason: string | null,
  ) => {
    const name = childName(churchId, row.childPersonId);
    return db.transaction((tx) => {
      const now = nowIso();
      const updated = tx
        .update(checkins)
        .set({
          status: 'checked_out',
          checkedOutAt: now,
          checkedOutBy: access.userId,
          pickupPersonId: pickup.pickupPersonId,
          pickupName: pickup.pickupName,
          overrideReason: reason,
          updatedAt: now,
        })
        .where(and(eq(checkins.id, row.id), eq(checkins.status, 'checked_in')))
        .returning()
        .get();
      if (!updated) throw conflict(`${name} was already picked up`);
      if (reason) {
        recordAudit(tx, audit, {
          module: 'checkin',
          action: 'checkin.checkout_override',
          entityType: 'checkin',
          entityId: row.id,
          summary: `Checked ${name} out without the pick-up code`,
          before: { status: 'checked_in' },
          after: { status: 'checked_out', reason, pickupName: pickup.pickupName },
        });
      }
      notify(tx, {
        churchId,
        userIds: guardianUserIds(tx, churchId, row.childPersonId),
        excludeUserIds: [access.userId],
        type: 'checkin.child_picked_up',
        title: `${name} sudah dijemput`,
        body: pickup.pickupName ? `Dijemput oleh ${pickup.pickupName}` : null,
        link: `/c/${churchId}/checkin/me`,
        entityType: 'checkin',
        entityId: row.id,
      });
      return updated;
    });
  };

  return new Elysia({ prefix: '/churches/:churchId/checkin/checkins' })
    .use(authPlugin(deps))
    .post(
      '/labels',
      ({ church, access, audit, body }) => {
        const ids = [...new Set(body.ids)];
        const rows = db
          .select()
          .from(checkins)
          .where(and(eq(checkins.churchId, church.id), inArray(checkins.id, ids)))
          .all();
        if (rows.length !== ids.length) throw notFound('Check-in');
        if (
          !canOperateCheckin(access) &&
          !rows.every((row) => isChildGuardian(db, church.id, access, row))
        ) {
          throw notFound('Check-in');
        }
        const reprinted = rows.filter((row) => row.labelPrintedAt !== null);
        const now = nowIso();
        db.transaction((tx) => {
          tx.update(checkins)
            .set({ labelPrintedAt: now })
            .where(and(inArray(checkins.id, ids), isNull(checkins.labelPrintedAt)))
            .run();
          if (reprinted.length > 0) {
            recordAudit(tx, audit, {
              module: 'checkin',
              action: 'checkin.label_reprint',
              entityType: 'checkin',
              entityId: reprinted.length === 1 ? reprinted[0]!.id : null,
              summary: `Reprinted ${reprinted.length} check-in label${reprinted.length === 1 ? '' : 's'}`,
            });
          }
        });
        const sessions = new Map(
          db
            .select({
              id: checkinSessions.id,
              name: checkinSessions.name,
              date: checkinSessions.date,
            })
            .from(checkinSessions)
            .where(
              and(
                eq(checkinSessions.churchId, church.id),
                inArray(checkinSessions.id, [...new Set(rows.map((row) => row.sessionId))]),
              ),
            )
            .all()
            .map((row) => [row.id, row]),
        );
        const birthDates = new Map(
          db
            .select({ id: people.id, birthDate: people.birthDate })
            .from(people)
            .where(
              and(
                eq(people.churchId, church.id),
                inArray(
                  people.id,
                  rows.map((row) => row.childPersonId),
                ),
              ),
            )
            .all()
            .map((row) => [row.id, row.birthDate]),
        );
        const order = new Map(ids.map((id, index) => [id, index]));
        const fresh = db
          .select()
          .from(checkins)
          .where(inArray(checkins.id, ids))
          .all()
          .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        return {
          items: hydrateCheckins(db, church.id, fresh, () => true).map((item) => ({
            ...item,
            sessionName: sessions.get(item.sessionId)?.name ?? '',
            sessionDate: sessions.get(item.sessionId)?.date ?? '',
            birthDate: birthDates.get(item.child.id) ?? null,
          })),
        };
      },
      { church: 'checkin', params: churchParamsSchema, body: labelsBodySchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const row = loadCheckinRow(db, church.id, params.id);
        const guardian = isChildGuardian(db, church.id, access, row);
        if (!canOperateCheckin(access) && !guardian) throw notFound('Check-in');
        const session = loadSessionRow(db, church.id, row.sessionId);
        const reveal = guardian || canManageCheckin(access);
        return {
          checkin: hydrateCheckins(db, church.id, [row], () => reveal)[0]!,
          session: { id: session.id, name: session.name, date: session.date },
          guardians: guardiansOf(db, church.id, row.childPersonId).map(
            ({ userId: _userId, ...person }) => person,
          ),
          pickups: pickupsOf(db, church.id, row.childPersonId).map(toPickup),
          canOverride: canOverrideCheckout(access),
        };
      },
      { church: 'checkin', params: churchIdParamsSchema },
    )
    .post(
      '/:id/checkout',
      ({ church, access, audit, params, body }) => {
        const row = loadCheckinRow(db, church.id, params.id);
        if (row.status === 'checked_out') {
          throw conflict(`${childName(church.id, row.childPersonId)} was already picked up`);
        }
        // Every attempt on one check-in counts, so a code cannot be guessed by trying them all.
        enforceRateLimit(deps.limiters, 'checkin.checkout', `${church.id}:${row.id}`, {
          windowMs: CHECKIN_LIMITS.checkoutWindowMinutes * 60_000,
          max: CHECKIN_LIMITS.checkoutAttemptsMax,
        });
        if (!safeEqual(body.securityCode, row.securityCode)) {
          recordAudit(db, audit, {
            module: 'checkin',
            action: 'checkin.checkout_failed',
            entityType: 'checkin',
            entityId: row.id,
            summary: `A wrong pick-up code was entered for ${childName(church.id, row.childPersonId)}`,
          });
          throw validationError('The code does not match the guardian tag', [
            { path: 'securityCode', message: 'The code does not match the guardian tag' },
          ]);
        }
        const pickup = resolvePickup(church.id, row, body, true);
        const updated = checkOut(church.id, access, audit, row, pickup, null);
        return { checkin: hydrateCheckins(db, church.id, [updated], () => false)[0]! };
      },
      { church: operate, params: churchIdParamsSchema, body: checkOutBodySchema },
    )
    .post(
      '/:id/override',
      ({ church, access, audit, params, body }) => {
        const row = loadCheckinRow(db, church.id, params.id);
        if (row.status === 'checked_out') {
          throw conflict(`${childName(church.id, row.childPersonId)} was already picked up`);
        }
        const pickup = resolvePickup(church.id, row, body, false);
        const updated = checkOut(church.id, access, audit, row, pickup, body.reason);
        return { checkin: hydrateCheckins(db, church.id, [updated], () => true)[0]! };
      },
      { church: manage, params: churchIdParamsSchema, body: overrideCheckOutBodySchema },
    )
    .delete(
      '/:id',
      ({ church, audit, params }) => {
        const row = loadCheckinRow(db, church.id, params.id);
        const name = childName(church.id, row.childPersonId);
        db.transaction((tx) => {
          tx.delete(checkins).where(eq(checkins.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'checkin',
            action: 'checkin.delete',
            entityType: 'checkin',
            entityId: row.id,
            summary: `Removed a check-in of ${name} made by mistake`,
            before: { status: row.status, classId: row.classId, sessionId: row.sessionId },
          });
        });
        return { ok: true as const };
      },
      { church: manage, params: churchIdParamsSchema },
    );
};
