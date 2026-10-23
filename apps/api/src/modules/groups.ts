import {
  DEFAULT_PERSON_PRIVACY,
  LIMITS,
  addGroupMembersBodySchema,
  applyPersonPrivacy,
  can,
  canAddGroupMember,
  canDecideJoinRequests,
  canRequestToJoinGroup,
  canSeeGroup,
  churchIdParamsSchema,
  churchParamsSchema,
  decideGroupJoinRequestBodySchema,
  fullName,
  groupDetailsInputSchema,
  groupDetailsListQuerySchema,
  groupDetailsPatchSchema,
  groupJoinRequestInputSchema,
  groupLeaderBodySchema,
  has,
  idSchema,
  type AccessLike,
  type GroupDetails,
  type GroupJoinRequest,
  type GroupLeader,
  type GroupMemberState,
  type GroupPage,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, like, sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';
import type { Queryable } from '../db/client';
import type { GroupJoinRequestRow, GroupRow } from '../db/schema';
import {
  announcements,
  attendanceRecords,
  attendanceSessions,
  churchMemberships,
  events,
  groupJoinRequests,
  groupLeaders,
  groupMembers,
  groups,
  people,
  users,
} from '../db/schema';
import type { Deps } from '../deps';
import { conflict, forbidden, notFound } from '../lib/errors';
import { likePattern } from '../lib/query';
import { enforceRateLimit } from '../lib/rate-limit';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toPersonSummary } from '../serializers';
import { announcementVisibility } from '../services/announcements';
import { changes, recordAudit } from '../services/audit';
import { notify } from '../services/notifications';
import { groupIdsOfPerson, privacyByPerson, privacyOf, sendCsv, toCsv } from '../services/people';

const memberParamsSchema = churchIdParamsSchema.extend({ personId: idSchema });
const leaderParamsSchema = churchIdParamsSchema.extend({ userId: idSchema });
const requestParamsSchema = churchIdParamsSchema.extend({ requestId: idSchema });
const requestListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'declined', 'cancelled']).default('pending'),
});

/** The last attendance sessions summarised on a group page. */
const ATTENDANCE_SESSIONS = 8;

export const groupsModule = (deps: Deps) => {
  const { db } = deps;

  const loadGroup = (churchId: string, id: string): GroupRow => {
    const group = db
      .select()
      .from(groups)
      .where(and(eq(groups.id, id), eq(groups.churchId, churchId)))
      .get();
    if (!group) throw notFound('Group');
    return group;
  };

  const myGroupIds = (access: AccessLike) =>
    new Set(access.personId ? groupIdsOfPerson(db, access.personId) : []);

  /** Loads a group the caller may see; private groups answer 404 to outsiders. */
  const loadVisibleGroup = (churchId: string, id: string, access: AccessLike): GroupRow => {
    const group = loadGroup(churchId, id);
    if (!canSeeGroup(access, group, myGroupIds(access).has(group.id))) throw notFound('Group');
    return group;
  };

  const memberCountOf = (tx: Queryable, groupId: string) =>
    tx.select({ value: count() }).from(groupMembers).where(eq(groupMembers.groupId, groupId)).get()
      ?.value ?? 0;

  const hydrate = (access: AccessLike, rows: GroupRow[]): GroupDetails[] => {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const counts = new Map<string, number>();
    for (const row of db
      .select({ groupId: groupMembers.groupId, value: count() })
      .from(groupMembers)
      .where(inArray(groupMembers.groupId, ids))
      .groupBy(groupMembers.groupId)
      .all()) {
      counts.set(row.groupId, row.value);
    }
    const leaders = new Map<string, GroupLeader[]>();
    // A leader's account e-mail follows the e-mail choice on their person record.
    const leaderPeople = db
      .select({ id: people.id, userId: people.userId })
      .from(groupLeaders)
      .innerJoin(
        people,
        and(eq(people.userId, groupLeaders.userId), eq(people.churchId, groupLeaders.churchId)),
      )
      .where(inArray(groupLeaders.groupId, ids))
      .all();
    const leaderPrivacy = privacyByPerson(
      db,
      leaderPeople.map((row) => row.id),
    );
    const personOfLeader = new Map(leaderPeople.map((row) => [row.userId, row.id]));
    const showsEmail = (userId: string) => {
      if (userId === access.userId || has(access, 'people.private.view')) return true;
      const personId = personOfLeader.get(userId);
      return personId
        ? privacyOf(leaderPrivacy, personId).showEmail
        : DEFAULT_PERSON_PRIVACY.showEmail;
    };
    for (const row of db
      .select({
        groupId: groupLeaders.groupId,
        userId: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(groupLeaders)
      .innerJoin(users, eq(users.id, groupLeaders.userId))
      .where(inArray(groupLeaders.groupId, ids))
      .orderBy(asc(users.name))
      .all()) {
      const list = leaders.get(row.groupId) ?? [];
      list.push({
        userId: row.userId,
        name: row.name,
        email: showsEmail(row.userId) ? row.email : '',
        avatarUrl: row.avatarUrl,
      });
      leaders.set(row.groupId, list);
    }
    const pending = new Map<string, number>();
    for (const row of db
      .select({ groupId: groupJoinRequests.groupId, value: count() })
      .from(groupJoinRequests)
      .where(and(inArray(groupJoinRequests.groupId, ids), eq(groupJoinRequests.status, 'pending')))
      .groupBy(groupJoinRequests.groupId)
      .all()) {
      pending.set(row.groupId, row.value);
    }
    const mine = myGroupIds(access);
    const myPending = new Set(
      access.personId
        ? db
            .select({ groupId: groupJoinRequests.groupId })
            .from(groupJoinRequests)
            .where(
              and(
                eq(groupJoinRequests.personId, access.personId),
                eq(groupJoinRequests.status, 'pending'),
              ),
            )
            .all()
            .map((row) => row.groupId)
        : [],
    );
    return rows.map((row) => {
      const myState: GroupMemberState = access.leaderGroupIds.includes(row.id)
        ? 'leader'
        : mine.has(row.id)
          ? 'member'
          : myPending.has(row.id)
            ? 'pending'
            : 'none';
      return {
        id: row.id,
        churchId: row.churchId,
        name: row.name,
        description: row.description,
        type: row.type,
        meetingSchedule: row.meetingSchedule,
        isActive: row.isActive,
        memberCount: counts.get(row.id) ?? 0,
        leaders: leaders.get(row.id) ?? [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        meetingDay: row.meetingDay,
        meetingTime: row.meetingTime,
        meetingFrequency: row.meetingFrequency,
        location: row.location,
        capacity: row.capacity,
        coverColor: row.coverColor,
        visibility: row.visibility,
        joinPolicy: row.joinPolicy,
        myState,
        pendingRequestCount: canDecideJoinRequests(access, row.id) ? (pending.get(row.id) ?? 0) : 0,
      };
    });
  };

  const hydrateOne = (access: AccessLike, row: GroupRow) => {
    const [group] = hydrate(access, [row]);
    if (!group) throw notFound('Group');
    return group;
  };

  const toJoinRequests = (rows: GroupJoinRequestRow[]): GroupJoinRequest[] => {
    if (rows.length === 0) return [];
    const persons = new Map(
      db
        .select()
        .from(people)
        .where(
          inArray(
            people.id,
            rows.map((row) => row.personId),
          ),
        )
        .all()
        .map((row) => [row.id, row]),
    );
    const names = new Map(
      db
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(
          inArray(
            groups.id,
            rows.map((row) => row.groupId),
          ),
        )
        .all()
        .map((row) => [row.id, row.name]),
    );
    return rows.flatMap((row) => {
      const person = persons.get(row.personId);
      if (!person) return [];
      return [
        {
          id: row.id,
          groupId: row.groupId,
          groupName: names.get(row.groupId) ?? '',
          person: toPersonSummary(person),
          message: row.message,
          status: row.status,
          decidedAt: row.decidedAt,
          decisionNote: row.decisionNote,
          createdAt: row.createdAt,
        },
      ];
    });
  };

  /** Leaders hear about a join request; groups without leaders fall back to `groups.manage`. */
  const leaderUserIds = (tx: Queryable, groupId: string): string[] =>
    tx
      .select({ userId: groupLeaders.userId })
      .from(groupLeaders)
      .where(eq(groupLeaders.groupId, groupId))
      .all()
      .map((row) => row.userId);

  /**
   * Adds people to a group, approving their pending requests and telling them (unless the
   * caller sends its own message, as the join request decision does).
   */
  const addMembers = (
    tx: Queryable,
    access: AccessLike,
    group: GroupRow,
    personIds: string[],
    { notifyAdded = true } = {},
  ): string[] => {
    const existing = new Set(
      tx
        .select({ personId: groupMembers.personId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, group.id))
        .all()
        .map((row) => row.personId),
    );
    const added = personIds.filter((id) => !existing.has(id));
    if (added.length === 0) return [];
    if (group.capacity !== null && existing.size + added.length > group.capacity) {
      throw conflict(`This group is full (${group.capacity} places)`);
    }
    const now = nowIso();
    tx.insert(groupMembers)
      .values(
        added.map((personId) => ({
          id: newId(),
          groupId: group.id,
          personId,
          churchId: group.churchId,
          addedAt: now,
        })),
      )
      .onConflictDoNothing()
      .run();
    tx.update(groupJoinRequests)
      .set({ status: 'approved', decidedBy: access.userId, decidedAt: now, updatedAt: now })
      .where(
        and(
          eq(groupJoinRequests.groupId, group.id),
          eq(groupJoinRequests.status, 'pending'),
          inArray(groupJoinRequests.personId, added),
        ),
      )
      .run();
    const userIds = tx
      .select({ userId: people.userId })
      .from(people)
      .where(and(inArray(people.id, added), isNotNull(people.userId)))
      .all()
      .flatMap((row) => (row.userId ? [row.userId] : []));
    if (notifyAdded && userIds.length > 0) {
      notify(tx, {
        churchId: group.churchId,
        userIds,
        excludeUserIds: [access.userId],
        type: 'group.member_added',
        title: { id: `Anda ditambahkan ke ${group.name}`, en: `You were added to ${group.name}` },
        link: `/c/${group.churchId}/groups/${group.id}`,
        entityType: 'group',
        entityId: group.id,
      });
    }
    return added;
  };

  const pageOf = (access: AccessLike, group: GroupRow): GroupPage => {
    const details = hydrateOne(access, group);
    const leaderUserIds = new Set(details.leaders.map((leader) => leader.userId));
    const rows = db
      .select({ person: people, addedAt: groupMembers.addedAt })
      .from(groupMembers)
      .innerJoin(people, eq(people.id, groupMembers.personId))
      .where(eq(groupMembers.groupId, group.id))
      .orderBy(asc(sql`${people.firstName} collate nocase`), asc(people.lastName))
      .all();
    const privacy = privacyByPerson(
      db,
      rows.map((row) => row.person.id),
    );
    const members = rows.map(({ person, addedAt }) => {
      const visible = applyPersonPrivacy(access, person, privacyOf(privacy, person.id));
      return {
        ...toPersonSummary(person),
        joinedAt: person.joinedAt,
        addedAt,
        phone: visible.phone,
        email: visible.email,
        isLeader: !!person.userId && leaderUserIds.has(person.userId),
      };
    });
    const canManage = can.manageGroup(access, group.id);
    const canDecide = canDecideJoinRequests(access, group.id);
    const myRequestRow = access.personId
      ? db
          .select()
          .from(groupJoinRequests)
          .where(
            and(
              eq(groupJoinRequests.groupId, group.id),
              eq(groupJoinRequests.personId, access.personId),
            ),
          )
          .orderBy(desc(groupJoinRequests.createdAt))
          .limit(1)
          .get()
      : undefined;
    const joinRequests = canDecide
      ? toJoinRequests(
          db
            .select()
            .from(groupJoinRequests)
            .where(
              and(eq(groupJoinRequests.groupId, group.id), eq(groupJoinRequests.status, 'pending')),
            )
            .orderBy(asc(groupJoinRequests.createdAt))
            .all(),
        )
      : [];
    const now = nowIso();
    const upcomingEvents = has(access, 'events.view')
      ? db
          .select({ id: events.id, title: events.title, startsAt: events.startsAt })
          .from(events)
          .where(
            and(
              eq(events.groupId, group.id),
              gte(events.startsAt, now),
              sql`${events.cancelledAt} is null`,
            ),
          )
          .orderBy(asc(events.startsAt))
          .limit(3)
          .all()
      : [];
    const eventCount = has(access, 'events.view')
      ? (db.select({ value: count() }).from(events).where(eq(events.groupId, group.id)).get()
          ?.value ?? 0)
      : 0;
    let attendance: GroupPage['stats']['attendance'] = null;
    if (can.viewAttendanceSession(access, { groupId: group.id })) {
      const sessions = db
        .select({ id: attendanceSessions.id, sessionAt: attendanceSessions.sessionAt })
        .from(attendanceSessions)
        .where(eq(attendanceSessions.groupId, group.id))
        .orderBy(desc(attendanceSessions.sessionAt))
        .limit(ATTENDANCE_SESSIONS)
        .all();
      const totals =
        sessions.length > 0
          ? db
              .select({
                total: count(),
                present: sql<number>`sum(case when ${attendanceRecords.status} = 'present' then 1 else 0 end)`,
              })
              .from(attendanceRecords)
              .where(
                inArray(
                  attendanceRecords.sessionId,
                  sessions.map((session) => session.id),
                ),
              )
              .get()
          : undefined;
      attendance = {
        sessions:
          db
            .select({ value: count() })
            .from(attendanceSessions)
            .where(eq(attendanceSessions.groupId, group.id))
            .get()?.value ?? 0,
        rate: totals && totals.total > 0 ? Number(totals.present ?? 0) / totals.total : null,
        lastSessionAt: sessions[0]?.sessionAt ?? null,
      };
    }
    const recentAnnouncements = has(access, 'announcements.view')
      ? db
          .select({
            id: announcements.id,
            title: announcements.title,
            publishedAt: announcements.publishedAt,
          })
          .from(announcements)
          .where(
            and(
              eq(announcements.groupId, group.id),
              announcementVisibility(db, group.churchId, access, now),
            ),
          )
          .orderBy(desc(announcements.publishedAt))
          .limit(3)
          .all()
      : [];
    return {
      group: details,
      members,
      myRequest: myRequestRow ? (toJoinRequests([myRequestRow])[0] ?? null) : null,
      joinRequests,
      stats: { upcomingEvents, eventCount, attendance, recentAnnouncements },
      canManage,
      canDelete: can.deleteGroup(access),
      canAssignLeaders: can.assignGroupLeaders(access),
      canRequestToJoin: canRequestToJoinGroup(access, group, details.myState),
      canLeave: !!access.personId && members.some((member) => member.id === access.personId),
      canExport: canManage,
    };
  };

  return new Elysia({ prefix: '/churches/:churchId/groups' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const conditions = [eq(groups.churchId, church.id)];
        if (!query.includeInactive) conditions.push(eq(groups.isActive, true));
        if (query.q) conditions.push(like(groups.name, likePattern(query.q)));
        if (query.type) conditions.push(eq(groups.type, query.type));
        const mine = myGroupIds(access);
        const rows = db
          .select()
          .from(groups)
          .where(and(...conditions))
          .orderBy(asc(sql`${groups.name} collate nocase`))
          .all()
          .filter((row) => canSeeGroup(access, row, mine.has(row.id)))
          .filter(
            (row) => !query.mine || mine.has(row.id) || access.leaderGroupIds.includes(row.id),
          )
          .slice(0, LIMITS.listMax);
        return { items: hydrate(access, rows) };
      },
      {
        church: { module: 'people', permission: 'groups.view' },
        params: churchParamsSchema,
        query: groupDetailsListQuerySchema,
      },
    )
    .get(
      '/join-requests',
      ({ church, access }) => {
        const groupIds = has(access, 'groups.manage')
          ? db
              .select({ id: groups.id })
              .from(groups)
              .where(eq(groups.churchId, church.id))
              .all()
              .map((row) => row.id)
          : access.leaderGroupIds;
        if (groupIds.length === 0) return { items: [] };
        return {
          items: toJoinRequests(
            db
              .select()
              .from(groupJoinRequests)
              .where(
                and(
                  eq(groupJoinRequests.churchId, church.id),
                  eq(groupJoinRequests.status, 'pending'),
                  inArray(groupJoinRequests.groupId, [...groupIds]),
                ),
              )
              .orderBy(asc(groupJoinRequests.createdAt))
              .all(),
          ),
        };
      },
      { church: { module: 'people', permission: 'groups.view' }, params: churchParamsSchema },
    )
    .post(
      '/',
      ({ church, access, audit, body, set }) => {
        if (!can.createGroup(access)) throw forbidden('Only administrators can create groups');
        const now = nowIso();
        const row = db.transaction((tx) => {
          const group = tx
            .insert(groups)
            .values({ id: newId(), churchId: church.id, ...body, createdAt: now, updatedAt: now })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'people',
            action: 'group.create',
            entityType: 'group',
            entityId: group.id,
            summary: `Created the group ${group.name}`,
            after: { name: group.name, type: group.type, visibility: group.visibility },
          });
          return group;
        });
        set.status = 201;
        return { group: hydrateOne(access, row) };
      },
      { church: 'people', params: churchParamsSchema, body: groupDetailsInputSchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) =>
        pageOf(access, loadVisibleGroup(church.id, params.id, access)),
      {
        church: { module: 'people', permission: 'groups.view' },
        params: churchIdParamsSchema,
      },
    )
    .patch(
      '/:id',
      ({ church, access, audit, params, body }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.manageGroup(access, group.id)) throw forbidden('You cannot edit this group');
        if (body.capacity !== undefined && body.capacity !== null) {
          const members = memberCountOf(db, group.id);
          if (body.capacity < members) {
            throw conflict(`The group already has ${members} members`);
          }
        }
        const patch = Object.fromEntries(
          Object.entries(body).filter(([, value]) => value !== undefined),
        );
        const updated = db.transaction((tx) => {
          const row = tx
            .update(groups)
            .set({ ...patch, updatedAt: nowIso() })
            .where(eq(groups.id, group.id))
            .returning()
            .get();
          if (!row) throw notFound('Group');
          // Who can see and join the group is audited; schedule details are not.
          const pick = (value: GroupRow) => ({
            name: value.name,
            type: value.type,
            isActive: value.isActive,
            visibility: value.visibility,
            joinPolicy: value.joinPolicy,
            capacity: value.capacity,
          });
          const diff = changes(pick(group), pick(row));
          if (diff.after) {
            recordAudit(tx, audit, {
              module: 'people',
              action: 'group.update',
              entityType: 'group',
              entityId: row.id,
              summary: `Updated the group ${row.name}`,
              ...diff,
            });
          }
          return row;
        });
        return { group: hydrateOne(access, updated) };
      },
      { church: 'people', params: churchIdParamsSchema, body: groupDetailsPatchSchema },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.deleteGroup(access)) throw forbidden('Only administrators can delete groups');
        db.transaction((tx) => {
          recordAudit(tx, audit, {
            module: 'people',
            action: 'group.delete',
            entityType: 'group',
            entityId: group.id,
            summary: `Deleted the group ${group.name}`,
            before: { name: group.name, type: group.type },
          });
          tx.delete(groups).where(eq(groups.id, group.id)).run();
        });
        return { ok: true as const };
      },
      { church: 'people', params: churchIdParamsSchema },
    )
    .post(
      '/:id/members',
      ({ church, access, audit, params, body }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.manageGroup(access, group.id)) throw forbidden('You cannot manage this group');
        const personIds = [...new Set(body.personIds)];
        const found = db
          .select({ id: people.id, firstName: people.firstName, lastName: people.lastName })
          .from(people)
          .where(and(eq(people.churchId, church.id), inArray(people.id, personIds)))
          .all();
        if (found.length !== personIds.length) throw notFound('One or more people');
        const requested = new Set(
          db
            .select({ personId: groupJoinRequests.personId })
            .from(groupJoinRequests)
            .where(
              and(
                eq(groupJoinRequests.groupId, group.id),
                eq(groupJoinRequests.status, 'pending'),
                inArray(groupJoinRequests.personId, personIds),
              ),
            )
            .all()
            .map((row) => row.personId),
        );
        if (
          found.some(
            (person) =>
              !canAddGroupMember(access, group.id, { requestedToJoin: requested.has(person.id) }),
          )
        ) {
          throw forbidden('Leaders add people who asked to join or who are in the directory');
        }
        db.transaction((tx) => {
          const added = addMembers(tx, access, group, personIds);
          if (added.length === 0) return;
          const names = found.filter((person) => added.includes(person.id)).map(fullName);
          recordAudit(tx, audit, {
            module: 'people',
            action: 'group.members_add',
            entityType: 'group',
            entityId: group.id,
            summary: `Added ${names.join(', ')} to ${group.name}`.slice(0, LIMITS.auditSummaryMax),
            params: {
              name: group.name,
              members: names.slice(0, 10).join(', '),
              count: names.length,
              asLeader: !has(access, 'groups.manage'),
            },
            after: { personIds: added, requested: added.filter((id) => requested.has(id)) },
          });
        });
        return { group: hydrateOne(access, group) };
      },
      { church: 'people', params: churchIdParamsSchema, body: addGroupMembersBodySchema },
    )
    .delete(
      '/:id/members/:personId',
      ({ church, access, audit, params }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.manageGroup(access, group.id)) throw forbidden('You cannot manage this group');
        db.transaction((tx) => {
          const deleted = tx
            .delete(groupMembers)
            .where(
              and(eq(groupMembers.groupId, group.id), eq(groupMembers.personId, params.personId)),
            )
            .returning({ id: groupMembers.id })
            .get();
          if (!deleted) throw notFound('Group member');
          const person = tx.select().from(people).where(eq(people.id, params.personId)).get();
          const name = person ? fullName(person) : 'a member';
          recordAudit(tx, audit, {
            module: 'people',
            action: 'group.member_remove',
            entityType: 'group',
            entityId: group.id,
            summary: `Removed ${name} from ${group.name}`,
            params: { name: group.name, person: name, asLeader: !has(access, 'groups.manage') },
            before: { personId: params.personId },
          });
        });
        return { ok: true as const };
      },
      { church: 'people', params: memberParamsSchema },
    )
    .post(
      '/:id/leave',
      ({ church, access, params }) => {
        const group = loadVisibleGroup(church.id, params.id, access);
        if (!access.personId) throw notFound('Group member');
        const deleted = db
          .delete(groupMembers)
          .where(
            and(eq(groupMembers.groupId, group.id), eq(groupMembers.personId, access.personId)),
          )
          .returning({ id: groupMembers.id })
          .get();
        if (!deleted) throw notFound('Group member');
        return { ok: true as const };
      },
      { church: { module: 'people', permission: 'groups.view' }, params: churchIdParamsSchema },
    )
    .post(
      '/:id/join-requests',
      ({ church, access, auth, params, body, set }) => {
        const group = loadVisibleGroup(church.id, params.id, access);
        const [details] = hydrate(access, [group]);
        if (!details || !canRequestToJoinGroup(access, group, details.myState)) {
          throw forbidden('You cannot ask to join this group');
        }
        if (group.capacity !== null && details.memberCount >= group.capacity) {
          throw conflict('This group is full');
        }
        // Every request notifies the leaders; asking and cancelling in a loop must not spam them.
        enforceRateLimit(deps.limiters, 'groups.join_request', `${church.id}:${auth.user.id}`, {
          windowMs: 60 * 60_000,
          max: 20,
        });
        const personId = access.personId as string;
        const now = nowIso();
        const row = db.transaction((tx) => {
          const request = tx
            .insert(groupJoinRequests)
            .values({
              id: newId(),
              churchId: church.id,
              groupId: group.id,
              personId,
              requestedBy: auth.user.id,
              message: body.message,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning()
            .get();
          // A request sent twice at once meets the one-open-request index.
          if (!request) throw conflict('You already asked to join this group');
          const person = tx.select().from(people).where(eq(people.id, personId)).get();
          const name = person ? fullName(person) : auth.user.name;
          const link = `/c/${church.id}/groups/${group.id}?tab=requests`;
          const base = {
            churchId: church.id,
            excludeUserIds: [auth.user.id],
            type: 'group.join_requested' as const,
            title: {
              id: `${name} ingin bergabung dengan ${group.name}`,
              en: `${name} asked to join ${group.name}`,
            },
            body: body.message,
            link,
            entityType: 'group',
            entityId: group.id,
          };
          const leaders = leaderUserIds(tx, group.id);
          if (leaders.length > 0) notify(tx, { ...base, userIds: leaders });
          else
            notify(tx, { ...base, audience: { kind: 'permission', permission: 'groups.manage' } });
          return request;
        });
        set.status = 201;
        return { request: toJoinRequests([row])[0] };
      },
      {
        church: { module: 'people', permission: 'groups.view' },
        params: churchIdParamsSchema,
        body: groupJoinRequestInputSchema,
      },
    )
    .delete(
      '/:id/join-requests/mine',
      ({ church, access, params }) => {
        const group = loadVisibleGroup(church.id, params.id, access);
        if (!access.personId) throw notFound('Join request');
        const now = nowIso();
        const row = db
          .update(groupJoinRequests)
          .set({ status: 'cancelled', updatedAt: now })
          .where(
            and(
              eq(groupJoinRequests.groupId, group.id),
              eq(groupJoinRequests.personId, access.personId),
              eq(groupJoinRequests.status, 'pending'),
            ),
          )
          .returning()
          .get();
        if (!row) throw notFound('Join request');
        return { request: toJoinRequests([row])[0] };
      },
      { church: { module: 'people', permission: 'groups.view' }, params: churchIdParamsSchema },
    )
    .get(
      '/:id/join-requests',
      ({ church, access, params, query }) => {
        const group = loadGroup(church.id, params.id);
        if (!canDecideJoinRequests(access, group.id)) {
          throw forbidden('You cannot see the join requests of this group');
        }
        return {
          items: toJoinRequests(
            db
              .select()
              .from(groupJoinRequests)
              .where(
                and(
                  eq(groupJoinRequests.groupId, group.id),
                  eq(groupJoinRequests.status, query.status),
                ),
              )
              .orderBy(desc(groupJoinRequests.createdAt))
              .limit(200)
              .all(),
          ),
        };
      },
      { church: 'people', params: churchIdParamsSchema, query: requestListQuerySchema },
    )
    .post(
      '/:id/join-requests/:requestId/decision',
      ({ church, access, auth, params, body }) => {
        const group = loadGroup(church.id, params.id);
        if (!canDecideJoinRequests(access, group.id)) {
          throw forbidden('You cannot decide on join requests for this group');
        }
        const request = db
          .select()
          .from(groupJoinRequests)
          .where(
            and(
              eq(groupJoinRequests.id, params.requestId),
              eq(groupJoinRequests.groupId, group.id),
              eq(groupJoinRequests.churchId, church.id),
            ),
          )
          .get();
        if (!request) throw notFound('Join request');
        if (request.status !== 'pending') throw conflict('This request was already answered');
        const now = nowIso();
        const row = db.transaction((tx) => {
          if (body.decision === 'approved') {
            addMembers(tx, access, group, [request.personId], { notifyAdded: false });
          }
          const updated = tx
            .update(groupJoinRequests)
            .set({
              status: body.decision,
              decidedBy: auth.user.id,
              decidedAt: now,
              decisionNote: body.note,
              updatedAt: now,
            })
            .where(eq(groupJoinRequests.id, request.id))
            .returning()
            .get();
          const recipient =
            request.requestedBy ??
            tx
              .select({ userId: people.userId })
              .from(people)
              .where(eq(people.id, request.personId))
              .get()?.userId;
          const userIds = recipient ? [recipient] : [];
          if (userIds.length > 0) {
            notify(tx, {
              churchId: church.id,
              userIds,
              excludeUserIds: [auth.user.id],
              type: 'group.join_decided',
              title:
                body.decision === 'approved'
                  ? { id: `Selamat bergabung di ${group.name}`, en: `Welcome to ${group.name}` }
                  : {
                      id: `Permintaan bergabung dengan ${group.name} ditolak`,
                      en: `Your request to join ${group.name} was declined`,
                    },
              body: body.note,
              link: `/c/${church.id}/groups/${group.id}`,
              entityType: 'group',
              entityId: group.id,
            });
          }
          return updated;
        });
        if (!row) throw notFound('Join request');
        return { request: toJoinRequests([row])[0] };
      },
      {
        church: 'people',
        params: requestParamsSchema,
        body: decideGroupJoinRequestBodySchema,
      },
    )
    .get(
      '/:id/roster',
      ({ church, access, audit, params, set }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.manageGroup(access, group.id)) throw forbidden('You cannot export this roster');
        const page = pageOf(access, group);
        db.transaction((tx) =>
          recordAudit(tx, audit, {
            module: 'people',
            action: 'group.roster_export',
            entityType: 'group',
            entityId: group.id,
            summary: `Exported the roster of ${group.name} (${page.members.length} members)`,
          }),
        );
        return sendCsv(
          set,
          `${group.name}-roster.csv`,
          toCsv([
            ['firstName', 'lastName', 'phone', 'email', 'membershipStatus', 'role', 'addedAt'],
            ...page.members.map((member) => [
              member.firstName,
              member.lastName,
              member.phone,
              member.email,
              member.membershipStatus,
              member.isLeader ? 'leader' : 'member',
              member.addedAt.slice(0, 10),
            ]),
          ]),
        );
      },
      { church: 'people', params: churchIdParamsSchema },
    )
    .post(
      '/:id/leaders',
      ({ church, access, audit, auth, params, body }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.assignGroupLeaders(access))
          throw forbidden('Only administrators can assign leaders');
        const membership = db
          .select({ id: churchMemberships.id, name: users.name })
          .from(churchMemberships)
          .innerJoin(users, eq(users.id, churchMemberships.userId))
          .where(
            and(
              eq(churchMemberships.churchId, church.id),
              eq(churchMemberships.userId, body.userId),
            ),
          )
          .get();
        if (!membership) throw notFound('Church member');
        db.transaction((tx) => {
          const added = tx
            .insert(groupLeaders)
            .values({
              id: newId(),
              groupId: group.id,
              userId: body.userId,
              churchId: church.id,
              assignedAt: nowIso(),
            })
            .onConflictDoNothing()
            .returning({ id: groupLeaders.id })
            .get();
          if (added) {
            recordAudit(tx, audit, {
              module: 'people',
              action: 'group.leader_assign',
              entityType: 'group',
              entityId: group.id,
              summary: `Made ${membership.name} a leader of ${group.name}`,
              after: { userId: body.userId },
            });
            notify(tx, {
              churchId: church.id,
              userIds: [body.userId],
              excludeUserIds: [auth.user.id],
              type: 'group.leader_assigned',
              title: { id: `Anda kini memimpin ${group.name}`, en: `You now lead ${group.name}` },
              body: {
                id: 'Anda dapat mengelola anggota, kegiatan, kehadiran, dan pengumumannya.',
                en: 'You can manage its members, events, attendance and announcements.',
              },
              link: `/c/${church.id}/groups/${group.id}`,
              entityType: 'group',
              entityId: group.id,
            });
          }
        });
        return { group: hydrateOne(access, group) };
      },
      { church: 'people', params: churchIdParamsSchema, body: groupLeaderBodySchema },
    )
    .delete(
      '/:id/leaders/:userId',
      ({ church, access, audit, params }) => {
        const group = loadGroup(church.id, params.id);
        if (!can.assignGroupLeaders(access))
          throw forbidden('Only administrators can remove leaders');
        db.transaction((tx) => {
          const deleted = tx
            .delete(groupLeaders)
            .where(and(eq(groupLeaders.groupId, group.id), eq(groupLeaders.userId, params.userId)))
            .returning({ id: groupLeaders.id })
            .get();
          if (!deleted) throw notFound('Group leader');
          recordAudit(tx, audit, {
            module: 'people',
            action: 'group.leader_remove',
            entityType: 'group',
            entityId: group.id,
            summary: `Removed a leader from ${group.name}`,
            before: { userId: params.userId },
          });
        });
        return { group: hydrateOne(access, group) };
      },
      { church: 'people', params: leaderParamsSchema },
    );
};
