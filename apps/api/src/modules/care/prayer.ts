import {
  CARE_TEAM_PERMISSIONS,
  PRAYER_REPEAT_SECONDS,
  answerPrayerRequestBodySchema,
  canManagePrayerRequest,
  canModeratePrayer,
  canViewPrayerRequest,
  churchIdParamsSchema,
  churchParamsSchema,
  has,
  hasAny,
  isCareTeam,
  moderatePrayerRequestBodySchema,
  prayerRequestInputSchema,
  prayerRequestListQuerySchema,
  type AccessLike,
  type Permission,
  type PrayerModerationStatus,
  type PrayerVisibility,
} from '@tatagereja/shared';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow, PrayerRequestRow } from '../../db/schema';
import { prayerRequestPrayers, prayerRequests } from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { enforceRateLimit } from '../../lib/rate-limit';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit, redact } from '../../services/audit';
import { permissionsByUser } from '../../services/access';
import { redactedChanges, sendDueCareReminders } from '../../services/care';
import { notify } from '../../services/notifications';
import { hydratePrayerRequests } from './serializers';

/** Request text never reaches the audit log; only what changed about it. */
const SECRET_FIELDS = ['title', 'body', 'moderationNote', 'testimony'];

const auditable = (row: PrayerRequestRow) => ({
  title: row.title,
  body: row.body,
  visibility: row.visibility,
  isAnonymous: row.isAnonymous,
  moderationStatus: row.moderationStatus,
  moderationNote: row.moderationNote,
  answeredAt: row.answeredAt,
  testimony: row.testimony,
});

/** The visibilities whose requests the caller may see, besides their own. Mirrors the shared rule. */
const visibleLevels = (access: AccessLike): PrayerVisibility[] => {
  const levels: PrayerVisibility[] = ['church'];
  if (hasAny(access, [...CARE_TEAM_PERMISSIONS, 'prayer.moderate'])) levels.push('care_team');
  if (has(access, 'care.confidential')) levels.push('pastors');
  return levels;
};

/** Requests other people see: approved church requests and private levels the caller reaches. */
const visibleCondition = (access: AccessLike): SQL | undefined => {
  const levels = visibleLevels(access).filter((level) => level !== 'church');
  return or(
    and(eq(prayerRequests.visibility, 'church'), eq(prayerRequests.moderationStatus, 'approved')),
    levels.length > 0 ? inArray(prayerRequests.visibility, levels) : undefined,
    eq(prayerRequests.submittedBy, access.userId),
  );
};

/** Requests for the whole church wait for review unless a moderator wrote them. */
const initialStatus = (access: AccessLike, visibility: PrayerVisibility): PrayerModerationStatus =>
  visibility !== 'church' || canModeratePrayer(access) ? 'approved' : 'pending';

export const prayerRouter = (deps: Deps) => {
  const { db } = deps;

  const loadVisible = (churchId: string, access: AccessLike, id: string) => {
    const row = db
      .select()
      .from(prayerRequests)
      .where(and(eq(prayerRequests.id, id), eq(prayerRequests.churchId, churchId)))
      .get();
    if (!row || !canViewPrayerRequest(access, row)) throw notFound('Prayer request');
    return row;
  };

  const hydrateOne = (churchId: string, access: AccessLike, row: PrayerRequestRow) => {
    const [request] = hydratePrayerRequests(db, churchId, access, [row]);
    if (!request) throw notFound('Prayer request');
    return request;
  };

  const usersHolding = (
    churchId: string,
    test: (access: { permissions: Permission[] }) => boolean,
  ) =>
    [...permissionsByUser(db, churchId)]
      .filter(([, permissions]) => test({ permissions }))
      .map(([userId]) => userId);

  /** Tells the people who should look at a new or changed request, without its text when private. */
  const notifyReviewers = (tx: Queryable, church: ChurchRow, row: PrayerRequestRow) => {
    const link = `/c/${church.id}/care/prayer/${row.id}`;
    const base = {
      churchId: church.id,
      excludeUserIds: row.submittedBy ? [row.submittedBy] : [],
      type: 'prayer.submitted' as const,
      link,
      entityType: 'prayer_request',
      entityId: row.id,
    };
    if (row.visibility === 'church') {
      if (row.moderationStatus !== 'pending') return;
      notify(tx, {
        ...base,
        userIds: usersHolding(church.id, canModeratePrayer),
        title: { id: 'Pokok doa menunggu ditinjau', en: 'A prayer request is waiting for review' },
        body: row.title,
      });
    } else if (row.visibility === 'care_team') {
      notify(tx, {
        ...base,
        userIds: usersHolding(church.id, isCareTeam),
        title: {
          id: 'Pokok doa baru untuk tim pastoral',
          en: 'A new prayer request for the care team',
        },
        body: row.title,
      });
    } else {
      notify(tx, {
        ...base,
        audience: { kind: 'permission', permission: 'care.confidential' },
        title: { id: 'Pokok doa baru untuk pendeta', en: 'A new prayer request for the pastors' },
      });
    }
  };

  return new Elysia({ prefix: '/churches/:churchId/care/prayer-requests' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        // The prayer wall is the care screen members open most, so reminders go out from here too.
        sendDueCareReminders(db, church);
        const conditions: SQL[] = [eq(prayerRequests.churchId, church.id)];
        let order: SQL[] = [desc(prayerRequests.createdAt)];
        switch (query.scope) {
          case 'wall': {
            const visible = visibleCondition(access);
            if (visible) conditions.push(visible);
            conditions.push(
              eq(prayerRequests.moderationStatus, 'approved'),
              isNull(prayerRequests.answeredAt),
              isNull(prayerRequests.closedAt),
            );
            break;
          }
          case 'answered': {
            const visible = visibleCondition(access);
            if (visible) conditions.push(visible);
            conditions.push(
              eq(prayerRequests.moderationStatus, 'approved'),
              isNotNull(prayerRequests.answeredAt),
            );
            order = [desc(prayerRequests.answeredAt)];
            break;
          }
          case 'mine':
            conditions.push(eq(prayerRequests.submittedBy, access.userId));
            break;
          case 'moderation':
            if (!canModeratePrayer(access)) {
              throw forbidden('You cannot review prayer requests');
            }
            conditions.push(
              eq(prayerRequests.visibility, 'church'),
              eq(prayerRequests.moderationStatus, query.status ?? 'pending'),
            );
            order = [sql`${prayerRequests.createdAt} asc`];
            break;
        }
        if (query.status && query.scope !== 'moderation') {
          conditions.push(eq(prayerRequests.moderationStatus, query.status));
        }
        if (query.visibility) conditions.push(eq(prayerRequests.visibility, query.visibility));
        if (query.q) {
          const pattern = likePattern(query.q);
          const match = or(like(prayerRequests.title, pattern), like(prayerRequests.body, pattern));
          if (match) conditions.push(match);
        }
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(prayerRequests).where(where).get()?.value ?? 0;
        const rows = db
          .select()
          .from(prayerRequests)
          .where(where)
          .orderBy(...order)
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return {
          items: hydratePrayerRequests(db, church.id, access, rows),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      { church: 'care', params: churchParamsSchema, query: prayerRequestListQuerySchema },
    )
    .post(
      '/',
      ({ church, access, auth, audit, body, set }) => {
        enforceRateLimit(deps.limiters, 'care.prayer_submit', `${church.id}:${auth.user.id}`, {
          windowMs: 60 * 60_000,
          max: 20,
        });
        const now = nowIso();
        const created = db.transaction((tx) => {
          const row = tx
            .insert(prayerRequests)
            .values({
              id: newId(),
              churchId: church.id,
              personId: access.personId,
              submittedBy: auth.user.id,
              title: body.title,
              body: body.body,
              visibility: body.visibility,
              isAnonymous: body.isAnonymous,
              moderationStatus: initialStatus(access, body.visibility),
              moderatedBy:
                body.visibility === 'church' && canModeratePrayer(access) ? auth.user.id : null,
              moderatedAt: body.visibility === 'church' && canModeratePrayer(access) ? now : null,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'care',
            action: 'prayer_request.create',
            entityType: 'prayer_request',
            entityId: row.id,
            summary: 'Submitted a prayer request',
            after: redact(auditable(row), SECRET_FIELDS),
          });
          notifyReviewers(tx, church, row);
          return row;
        });
        set.status = 201;
        return { request: hydrateOne(church.id, access, created) };
      },
      {
        church: { module: 'care', permission: 'prayer.submit' },
        params: churchParamsSchema,
        body: prayerRequestInputSchema,
      },
    )
    .get(
      '/:id',
      ({ church, access, params }) => ({
        request: hydrateOne(church.id, access, loadVisible(church.id, access, params.id)),
      }),
      { church: 'care', params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, auth, audit, params, body }) => {
        const row = loadVisible(church.id, access, params.id);
        if (row.submittedBy !== auth.user.id) {
          throw forbidden('Only the person who asked for prayer can edit it');
        }
        const textChanged = row.title !== body.title || row.body !== body.body;
        // Edited requests for the whole church are reviewed again.
        const status =
          body.visibility !== 'church' || canModeratePrayer(access)
            ? 'approved'
            : row.visibility === 'church' && !textChanged
              ? row.moderationStatus
              : 'pending';
        const now = nowIso();
        const updated = db.transaction((tx) => {
          const next = tx
            .update(prayerRequests)
            .set({
              title: body.title,
              body: body.body,
              visibility: body.visibility,
              isAnonymous: body.isAnonymous,
              moderationStatus: status,
              moderationNote: status === 'pending' ? null : row.moderationNote,
              updatedAt: now,
            })
            .where(eq(prayerRequests.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Prayer request');
          recordAudit(tx, audit, {
            module: 'care',
            action: 'prayer_request.update',
            entityType: 'prayer_request',
            entityId: row.id,
            summary: 'Edited a prayer request',
            ...redactedChanges(auditable(row), auditable(next), SECRET_FIELDS),
          });
          if (
            next.moderationStatus !== row.moderationStatus ||
            next.visibility !== row.visibility
          ) {
            notifyReviewers(tx, church, next);
          }
          return next;
        });
        return { request: hydrateOne(church.id, access, updated) };
      },
      { church: 'care', params: churchIdParamsSchema, body: prayerRequestInputSchema },
    )
    .post(
      '/:id/moderate',
      ({ church, access, auth, audit, params, body }) => {
        if (!canModeratePrayer(access)) throw forbidden('You cannot review prayer requests');
        const row = loadVisible(church.id, access, params.id);
        if (row.visibility !== 'church') {
          throw conflict('Only requests for the whole church are reviewed');
        }
        const now = nowIso();
        const updated = db.transaction((tx) => {
          const next = tx
            .update(prayerRequests)
            .set({
              moderationStatus: body.decision,
              moderationNote: body.note,
              moderatedBy: auth.user.id,
              moderatedAt: now,
              updatedAt: now,
            })
            .where(eq(prayerRequests.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Prayer request');
          recordAudit(tx, audit, {
            module: 'care',
            action:
              body.decision === 'approved' ? 'prayer_request.approve' : 'prayer_request.reject',
            entityType: 'prayer_request',
            entityId: row.id,
            summary:
              body.decision === 'approved'
                ? 'Shared a prayer request with the church'
                : 'Declined to share a prayer request',
            ...redactedChanges(auditable(row), auditable(next), SECRET_FIELDS),
          });
          if (row.submittedBy && row.moderationStatus !== body.decision) {
            notify(tx, {
              churchId: church.id,
              userIds: [row.submittedBy],
              excludeUserIds: [auth.user.id],
              type: 'prayer.moderated',
              title:
                body.decision === 'approved'
                  ? {
                      id: 'Pokok doa Anda dibagikan kepada jemaat',
                      en: 'Your prayer request was shared with the church',
                    }
                  : {
                      id: 'Pokok doa Anda tidak dibagikan',
                      en: 'Your prayer request was not shared',
                    },
              body: row.title,
              link: `/c/${church.id}/care/prayer/${row.id}`,
              entityType: 'prayer_request',
              entityId: row.id,
            });
          }
          return next;
        });
        return { request: hydrateOne(church.id, access, updated) };
      },
      { church: 'care', params: churchIdParamsSchema, body: moderatePrayerRequestBodySchema },
    )
    .post(
      '/:id/pray',
      ({ church, access, auth, params }) => {
        const row = loadVisible(church.id, access, params.id);
        if (row.moderationStatus !== 'approved') {
          throw conflict('This prayer request is not shared yet');
        }
        if (row.answeredAt) throw conflict('This prayer has already been answered');
        const now = nowIso();
        const result = db.transaction((tx) => {
          const existing = tx
            .select()
            .from(prayerRequestPrayers)
            .where(
              and(
                eq(prayerRequestPrayers.requestId, row.id),
                eq(prayerRequestPrayers.userId, auth.user.id),
              ),
            )
            .get();
          // A double tap within the repeat window counts once.
          if (
            existing &&
            Date.now() - new Date(existing.lastPrayedAt).getTime() < PRAYER_REPEAT_SECONDS * 1000
          ) {
            return row.prayedCount;
          }
          if (existing) {
            tx.update(prayerRequestPrayers)
              .set({ count: existing.count + 1, lastPrayedAt: now })
              .where(
                and(
                  eq(prayerRequestPrayers.requestId, row.id),
                  eq(prayerRequestPrayers.userId, auth.user.id),
                ),
              )
              .run();
          } else {
            tx.insert(prayerRequestPrayers)
              .values({
                requestId: row.id,
                userId: auth.user.id,
                churchId: church.id,
                count: 1,
                lastPrayedAt: now,
              })
              .run();
          }
          const next = tx
            .update(prayerRequests)
            .set({ prayedCount: sql`${prayerRequests.prayedCount} + 1` })
            .where(eq(prayerRequests.id, row.id))
            .returning({ prayedCount: prayerRequests.prayedCount })
            .get();
          return next?.prayedCount ?? row.prayedCount + 1;
        });
        return { prayedCount: result, prayedByMe: true };
      },
      { church: 'care', params: churchIdParamsSchema },
    )
    .post(
      '/:id/answer',
      ({ church, access, auth, audit, params, body }) => {
        const row = loadVisible(church.id, access, params.id);
        if (!canManagePrayerRequest(access, row)) {
          throw forbidden('You cannot mark this prayer request answered');
        }
        const now = nowIso();
        // A new testimony is new text for the whole church, so it is reviewed like an edit.
        const review =
          row.visibility === 'church' &&
          !!body.testimony &&
          body.testimony !== row.testimony &&
          !canModeratePrayer(access);
        const updated = db.transaction((tx) => {
          const next = tx
            .update(prayerRequests)
            .set({
              answeredAt: row.answeredAt ?? now,
              testimony: body.testimony,
              ...(review ? { moderationStatus: 'pending' as const, moderationNote: null } : {}),
              updatedAt: now,
            })
            .where(eq(prayerRequests.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Prayer request');
          recordAudit(tx, audit, {
            module: 'care',
            action: 'prayer_request.answer',
            entityType: 'prayer_request',
            entityId: row.id,
            summary: 'Marked a prayer request answered',
            ...redactedChanges(auditable(row), auditable(next), SECRET_FIELDS),
          });
          if (review) notifyReviewers(tx, church, next);
          // Only shared requests were prayed for, and their title is already public.
          if (!row.answeredAt && row.moderationStatus === 'approved') {
            const prayed = tx
              .select({ userId: prayerRequestPrayers.userId })
              .from(prayerRequestPrayers)
              .where(
                and(
                  eq(prayerRequestPrayers.requestId, row.id),
                  ne(prayerRequestPrayers.userId, auth.user.id),
                ),
              )
              .all()
              .map((entry) => entry.userId);
            notify(tx, {
              churchId: church.id,
              userIds: prayed,
              type: 'prayer.answered',
              title: {
                id: 'Doa yang Anda doakan telah dijawab',
                en: 'A prayer you prayed for was answered',
              },
              body: next.visibility === 'pastors' ? null : next.title,
              link: `/c/${church.id}/care/prayer/${row.id}`,
              entityType: 'prayer_request',
              entityId: row.id,
            });
          }
          return next;
        });
        return { request: hydrateOne(church.id, access, updated) };
      },
      { church: 'care', params: churchIdParamsSchema, body: answerPrayerRequestBodySchema },
    )
    .delete(
      '/:id/answer',
      ({ church, access, audit, params }) => {
        const row = loadVisible(church.id, access, params.id);
        if (!canManagePrayerRequest(access, row)) {
          throw forbidden('You cannot change this prayer request');
        }
        const updated = db.transaction((tx) => {
          const next = tx
            .update(prayerRequests)
            .set({ answeredAt: null, testimony: null, updatedAt: nowIso() })
            .where(eq(prayerRequests.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Prayer request');
          recordAudit(tx, audit, {
            module: 'care',
            action: 'prayer_request.reopen',
            entityType: 'prayer_request',
            entityId: row.id,
            summary: 'Marked a prayer request as still being prayed for',
            ...redactedChanges(auditable(row), auditable(next), SECRET_FIELDS),
          });
          return next;
        });
        return { request: hydrateOne(church.id, access, updated) };
      },
      { church: 'care', params: churchIdParamsSchema },
    )
    .delete(
      '/:id',
      ({ church, access, audit, auth, params }) => {
        const row = loadVisible(church.id, access, params.id);
        if (!canManagePrayerRequest(access, row)) {
          throw forbidden('You cannot delete this prayer request');
        }
        db.transaction((tx) => {
          tx.delete(prayerRequests).where(eq(prayerRequests.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'care',
            action: 'prayer_request.delete',
            entityType: 'prayer_request',
            entityId: row.id,
            summary:
              row.submittedBy === auth.user.id
                ? 'Withdrew their prayer request'
                : 'Deleted a prayer request',
            before: redact(auditable(row), SECRET_FIELDS),
          });
        });
        return { ok: true as const };
      },
      { church: 'care', params: churchIdParamsSchema },
    );
};
