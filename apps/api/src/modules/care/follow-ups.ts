import {
  FOLLOW_UP_ACTIVE_STAGES,
  FOLLOW_UP_STAGES,
  PERSON_MEMBERSHIP_STATUS_LABELS,
  canAddVisitorPerson,
  canApplyStatusSuggestion,
  canManageFollowUp,
  followUpStatusSuggestion,
  churchIdParamsSchema,
  churchParamsSchema,
  fullName,
  has,
  isCareTeam,
  moveFollowUpBodySchema,
  visitorFollowUpInputSchema,
  visitorFollowUpListQuerySchema,
  visitorFollowUpUpdateSchema,
  type AccessLike,
  type FollowUpStage,
  type PersonMembershipStatus,
} from '@tatagereja/shared';
import { and, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow, PersonRow, VisitorFollowUpRow } from '../../db/schema';
import { people, visitorFollowUps } from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { likePattern } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit, redact, type AuditContext } from '../../services/audit';
import {
  assertActiveMembers,
  followUpOnBoardCondition,
  loadPersonInChurch,
  redactedChanges,
  todayIn,
} from '../../services/care';
import { notify } from '../../services/notifications';
import { onVisibleContact } from '../../services/people';
import { hydrateFollowUps } from './serializers';

const SECRET_FIELDS = ['notes'];

const auditable = (row: VisitorFollowUpRow) => ({
  personId: row.personId,
  stage: row.stage,
  source: row.source,
  firstVisitDate: row.firstVisitDate,
  assignedUserId: row.assignedUserId,
  notes: row.notes,
  closedReason: row.closedReason,
});

export const followUpsRouter = (deps: Deps) => {
  const { db } = deps;

  /** Care team members see every follow-up; others only the ones assigned to them. */
  const visibleCondition = (access: AccessLike): SQL | undefined =>
    isCareTeam(access) ? undefined : eq(visitorFollowUps.assignedUserId, access.userId);

  const loadVisible = (churchId: string, access: AccessLike, id: string) => {
    const row = db
      .select()
      .from(visitorFollowUps)
      .where(and(eq(visitorFollowUps.id, id), eq(visitorFollowUps.churchId, churchId)))
      .get();
    if (!row || (!isCareTeam(access) && row.assignedUserId !== access.userId)) {
      throw notFound('Follow-up');
    }
    return row;
  };

  const loadManageable = (churchId: string, access: AccessLike, id: string) => {
    const row = loadVisible(churchId, access, id);
    if (!canManageFollowUp(access, row)) throw forbidden('You cannot change this follow-up');
    return row;
  };

  const hydrateOne = (church: ChurchRow, access: AccessLike, row: VisitorFollowUpRow) => {
    const [followUp] = hydrateFollowUps(db, church.id, access, todayIn(church.timezone), [row]);
    if (!followUp) throw notFound('Follow-up');
    return followUp;
  };

  const personName = (personId: string) => {
    const person = db
      .select({ firstName: people.firstName, lastName: people.lastName })
      .from(people)
      .where(eq(people.id, personId))
      .get();
    return person ? fullName(person) : 'a visitor';
  };

  const notifyAssignee = (
    tx: Queryable,
    church: ChurchRow,
    row: VisitorFollowUpRow,
    actorId: string,
  ) => {
    if (!row.assignedUserId) return;
    notify(tx, {
      churchId: church.id,
      userIds: [row.assignedUserId],
      excludeUserIds: [actorId],
      type: 'care.follow_up_assigned',
      title: {
        id: 'Tamu baru untuk Anda tindak lanjuti',
        en: 'A new visitor for you to follow up',
      },
      body: personName(row.personId),
      link: `/c/${church.id}/care/follow-ups/${row.id}`,
      entityType: 'visitor_follow_up',
      entityId: row.id,
    });
  };

  const assertNoActiveFollowUp = (churchId: string, personId: string, exceptId?: string) => {
    const active = db
      .select({ id: visitorFollowUps.id })
      .from(visitorFollowUps)
      .where(
        and(
          eq(visitorFollowUps.churchId, churchId),
          eq(visitorFollowUps.personId, personId),
          inArray(visitorFollowUps.stage, [...FOLLOW_UP_ACTIVE_STAGES]),
        ),
      )
      .all()
      .filter((row) => row.id !== exceptId);
    if (active.length > 0) throw conflict('This person is already being followed up');
  };

  /** Sets the person's new directory status, audited in the people module. */
  const applyStatus = (
    tx: Queryable,
    audit: AuditContext,
    person: PersonRow,
    status: PersonMembershipStatus,
  ) => {
    tx.update(people)
      .set({ membershipStatus: status, updatedAt: nowIso() })
      .where(eq(people.id, person.id))
      .run();
    recordAudit(tx, audit, {
      module: 'people',
      action: 'person.status_change',
      entityType: 'person',
      entityId: person.id,
      summary: `Changed the status of ${fullName(person)} from ${PERSON_MEMBERSHIP_STATUS_LABELS[person.membershipStatus].toLowerCase()} to ${PERSON_MEMBERSHIP_STATUS_LABELS[status].toLowerCase()} after their follow-up`,
      params: { person: fullName(person), status },
      before: { membershipStatus: person.membershipStatus },
      after: { membershipStatus: status },
    });
  };

  const suggestStatus = (
    tx: Queryable,
    church: ChurchRow,
    access: AccessLike,
    audit: AuditContext,
    row: VisitorFollowUpRow,
  ) => {
    const person = tx.select().from(people).where(eq(people.id, row.personId)).get();
    if (!person) return;
    const status = followUpStatusSuggestion(row.stage, person.membershipStatus);
    if (!status) return;
    if (canApplyStatusSuggestion(access)) {
      applyStatus(tx, audit, person, status);
      return;
    }
    notify(tx, {
      churchId: church.id,
      audience: { kind: 'permission', permission: 'people.edit' },
      excludeUserIds: [access.userId],
      type: 'care.status_suggested',
      title: {
        id: `${fullName(person)} sudah bergabung: ubah statusnya menjadi simpatisan?`,
        en: `${fullName(person)} joined: change their status to regular attendee?`,
      },
      link: `/c/${church.id}/care/follow-ups/${row.id}`,
      entityType: 'visitor_follow_up',
      entityId: row.id,
    });
  };

  return new Elysia({ prefix: '/churches/:churchId/care/follow-ups' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const base: SQL[] = [eq(visitorFollowUps.churchId, church.id)];
        const visible = visibleCondition(access);
        if (visible) base.push(visible);
        if (query.mine) base.push(eq(visitorFollowUps.assignedUserId, access.userId));
        if (query.assignedUserId) {
          base.push(eq(visitorFollowUps.assignedUserId, query.assignedUserId));
        }
        if (query.q) {
          const pattern = likePattern(query.q);
          const match = or(
            like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
            onVisibleContact(access, 'show_phone', like(people.phone, pattern)),
            like(visitorFollowUps.source, pattern),
          );
          if (match) base.push(match);
        }
        // Joined and closed follow-ups leave the board after a while unless asked for.
        const recent = followUpOnBoardCondition();
        const counted = and(...base, ...(recent ? [recent] : []));
        const counts = Object.fromEntries(FOLLOW_UP_STAGES.map((stage) => [stage, 0])) as Record<
          FollowUpStage,
          number
        >;
        for (const row of db
          .select({ stage: visitorFollowUps.stage, value: count() })
          .from(visitorFollowUps)
          .innerJoin(people, eq(people.id, visitorFollowUps.personId))
          .where(counted)
          .groupBy(visitorFollowUps.stage)
          .all()) {
          counts[row.stage] = row.value;
        }
        const conditions = [...base];
        if (query.stage) conditions.push(eq(visitorFollowUps.stage, query.stage));
        else if (recent) conditions.push(recent);
        const rows = db
          .select({ row: visitorFollowUps })
          .from(visitorFollowUps)
          .innerJoin(people, eq(people.id, visitorFollowUps.personId))
          .where(and(...conditions))
          .orderBy(desc(visitorFollowUps.stageChangedAt), desc(visitorFollowUps.createdAt))
          .limit(500)
          .all()
          .map((entry) => entry.row);
        return {
          items: hydrateFollowUps(db, church.id, access, todayIn(church.timezone), rows),
          counts,
        };
      },
      { church: 'care', params: churchParamsSchema, query: visitorFollowUpListQuerySchema },
    )
    .post(
      '/',
      ({ church, auth, access, audit, body, set }) => {
        if (body.newVisitor && !canAddVisitorPerson(access)) {
          throw forbidden(
            'Adding a new person to the directory needs permission to add people; choose someone who is already in it',
          );
        }
        let person: PersonRow | null = body.personId
          ? loadPersonInChurch(db, church.id, body.personId)
          : null;
        if (person) assertNoActiveFollowUp(church.id, person.id);
        if (body.assignedUserId) assertActiveMembers(db, church.id, [body.assignedUserId]);
        const now = nowIso();
        const created = db.transaction((tx) => {
          if (!person && body.newVisitor) {
            // First-time guests are added to the directory as visitors.
            person = tx
              .insert(people)
              .values({
                id: newId(),
                churchId: church.id,
                firstName: body.newVisitor.firstName,
                lastName: body.newVisitor.lastName,
                phone: body.newVisitor.phone,
                email: body.newVisitor.email,
                membershipStatus: 'visitor',
                joinedAt: null,
                createdAt: now,
                updatedAt: now,
              })
              .returning()
              .get();
          }
          if (!person) throw notFound('Person');
          const row = tx
            .insert(visitorFollowUps)
            .values({
              id: newId(),
              churchId: church.id,
              personId: person.id,
              stage: body.stage,
              source: body.source,
              firstVisitDate: body.firstVisitDate,
              assignedUserId: body.assignedUserId,
              notes: body.notes,
              stageChangedAt: now,
              createdBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'care',
            action: 'visitor_follow_up.create',
            entityType: 'visitor_follow_up',
            entityId: row.id,
            summary: body.newVisitor
              ? `Added the visitor ${fullName(person)} and started their follow-up`
              : `Started the follow-up of ${fullName(person)}`,
            after: redact(auditable(row), SECRET_FIELDS),
          });
          notifyAssignee(tx, church, row, auth.user.id);
          return row;
        });
        set.status = 201;
        return { followUp: hydrateOne(church, access, created) };
      },
      {
        church: { module: 'care', permission: 'care.manage' },
        params: churchParamsSchema,
        body: visitorFollowUpInputSchema,
      },
    )
    .get(
      '/:id',
      ({ church, access, params }) => ({
        followUp: hydrateOne(church, access, loadVisible(church.id, access, params.id)),
      }),
      { church: 'care', params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, auth, audit, params, body }) => {
        const row = loadManageable(church.id, access, params.id);
        if (body.assignedUserId !== row.assignedUserId) {
          if (!has(access, 'care.manage')) {
            throw forbidden('Only care managers can reassign a follow-up');
          }
          if (body.assignedUserId) assertActiveMembers(db, church.id, [body.assignedUserId]);
        }
        const updated = db.transaction((tx) => {
          const next = tx
            .update(visitorFollowUps)
            .set({ ...body, updatedAt: nowIso() })
            .where(eq(visitorFollowUps.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Follow-up');
          recordAudit(tx, audit, {
            module: 'care',
            action: 'visitor_follow_up.update',
            entityType: 'visitor_follow_up',
            entityId: row.id,
            summary: `Updated the follow-up of ${personName(row.personId)}`,
            ...redactedChanges(auditable(row), auditable(next), SECRET_FIELDS),
          });
          if (next.assignedUserId !== row.assignedUserId) {
            notifyAssignee(tx, church, next, auth.user.id);
          }
          return next;
        });
        return { followUp: hydrateOne(church, access, updated) };
      },
      { church: 'care', params: churchIdParamsSchema, body: visitorFollowUpUpdateSchema },
    )
    .post(
      '/:id/stage',
      ({ church, access, audit, params, body }) => {
        const row = loadManageable(church.id, access, params.id);
        if (
          row.stage !== body.stage &&
          (FOLLOW_UP_ACTIVE_STAGES as readonly string[]).includes(body.stage)
        ) {
          assertNoActiveFollowUp(church.id, row.personId, row.id);
        }
        const now = nowIso();
        const updated = db.transaction((tx) => {
          const next = tx
            .update(visitorFollowUps)
            .set({
              stage: body.stage,
              closedReason: body.stage === 'closed' ? body.closedReason : null,
              stageChangedAt: row.stage === body.stage ? row.stageChangedAt : now,
              updatedAt: now,
            })
            .where(eq(visitorFollowUps.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Follow-up');
          recordAudit(tx, audit, {
            module: 'care',
            action: 'visitor_follow_up.stage',
            entityType: 'visitor_follow_up',
            entityId: row.id,
            summary: `Moved the follow-up of ${personName(row.personId)} to ${body.stage}`,
            params: { person: personName(row.personId), stage: body.stage },
            ...redactedChanges(auditable(row), auditable(next), SECRET_FIELDS),
          });
          // A visitor who joined becomes a regular attendee (simpatisan) in the directory: done
          // at once by someone who may edit people, otherwise suggested to those who may.
          if (row.stage !== 'joined') suggestStatus(tx, church, access, audit, next);
          return next;
        });
        return { followUp: hydrateOne(church, access, updated) };
      },
      { church: 'care', params: churchIdParamsSchema, body: moveFollowUpBodySchema },
    )
    .post(
      '/:id/apply-status',
      ({ church, access, audit, params }) => {
        const row = loadVisible(church.id, access, params.id);
        if (!canApplyStatusSuggestion(access)) {
          throw forbidden('Changing a membership status needs permission to edit people');
        }
        const person = loadPersonInChurch(db, church.id, row.personId);
        const status = followUpStatusSuggestion(row.stage, person.membershipStatus);
        if (!status) throw conflict('There is no status change to make for this follow-up');
        db.transaction((tx) => applyStatus(tx, audit, person, status));
        return { followUp: hydrateOne(church, access, row) };
      },
      {
        church: { module: 'care', permission: 'people.edit' },
        params: churchIdParamsSchema,
      },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        const row = loadVisible(church.id, access, params.id);
        if (!has(access, 'care.manage')) throw forbidden('You cannot delete this follow-up');
        db.transaction((tx) => {
          tx.delete(visitorFollowUps).where(eq(visitorFollowUps.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'care',
            action: 'visitor_follow_up.delete',
            entityType: 'visitor_follow_up',
            entityId: row.id,
            summary: `Deleted the follow-up of ${personName(row.personId)}`,
            before: redact(auditable(row), SECRET_FIELDS),
          });
        });
        return { ok: true as const };
      },
      { church: 'care', params: churchIdParamsSchema },
    );
};
