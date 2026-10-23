import {
  GUARDIAN_RELATIONSHIPS,
  INSIGHTS_LIMITS,
  attendanceStreakOf,
  availableHomeWidgets,
  can,
  canViewAbsences,
  churchParamsSchema,
  dashboardPreferencesInputSchema,
  isCareTaskOverdue,
  orderHomeWidgets,
  type Access,
  type DashboardPreferences,
  type HomeWidget,
} from '@tatagereja/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { ChurchRow } from '../db/schema';
import {
  announcementAudienceRoles,
  announcements,
  attendanceSessions,
  careTasks,
  checkinSessions,
  checkins,
  churchMemberships,
  dashboardPreferences,
  events,
  groupLeaders,
  groupMembers,
  groups,
  householdMembers,
  notifications,
  people,
  rosterAssignments,
  worshipServices,
} from '../db/schema';
import type { Deps } from '../deps';
import { nowIso } from '../lib/time';
import { authPlugin } from '../plugins/auth';
import { hydrateAnnouncements } from '../services/announcements';
import { hydrateSessions, listAbsences, marksOf } from '../services/attendance';
import { hydrateCheckins } from '../services/checkin';
import { hydrateEvents } from '../services/events';
import { todayIn } from '../services/people';
import { peopleStats } from '../services/people-stats';
import { hydrateTasks } from './care/serializers';
import { upcomingCondition } from './worship/services';
import { scheduleItems } from './worship/volunteers';

const LIST_MAX = 5;

/** The day before a `YYYY-MM-DD` date. */
const dayBefore = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
};

export const dashboardModule = (deps: Deps) => {
  const { db } = deps;

  const preferencesOf = (churchId: string, userId: string): DashboardPreferences => {
    const row = db
      .select()
      .from(dashboardPreferences)
      .where(
        and(eq(dashboardPreferences.churchId, churchId), eq(dashboardPreferences.userId, userId)),
      )
      .get();
    // Stored lists are re-validated: a widget removed from the catalog is dropped.
    const parsed = dashboardPreferencesInputSchema.safeParse({
      hiddenWidgets: row?.hiddenWidgets ?? [],
      widgetOrder: row?.widgetOrder ?? [],
    });
    return parsed.success ? parsed.data : { hiddenWidgets: [], widgetOrder: [] };
  };

  /** Groups the caller belongs to or leads. */
  const myGroupIdsOf = (churchId: string, access: Access) => {
    const memberGroupIds = access.personId
      ? db
          .select({ groupId: groupMembers.groupId })
          .from(groupMembers)
          .where(
            and(eq(groupMembers.churchId, churchId), eq(groupMembers.personId, access.personId)),
          )
          .all()
          .map((row) => row.groupId)
      : [];
    const leaderGroupIds = db
      .select({ groupId: groupLeaders.groupId })
      .from(groupLeaders)
      .where(and(eq(groupLeaders.churchId, churchId), eq(groupLeaders.userId, access.userId)))
      .all()
      .map((row) => row.groupId);
    return { memberGroupIds, leaderGroupIds };
  };

  /**
   * Published announcements inside their publish window that are meant for the caller: the whole
   * church, a group they belong to or lead, or a role they hold.
   */
  const readableAnnouncements = (churchId: string, access: Access, groupIds: string[]): SQL => {
    const now = nowIso();
    const audience = or(
      eq(announcements.audience, 'church'),
      groupIds.length > 0
        ? and(eq(announcements.audience, 'group'), inArray(announcements.groupId, groupIds))
        : undefined,
      access.roleIds.length > 0
        ? and(
            eq(announcements.audience, 'roles'),
            sql`exists (select 1 from ${announcementAudienceRoles} where ${announcementAudienceRoles.announcementId} = ${announcements.id} and ${inArray(announcementAudienceRoles.roleId, access.roleIds)})`,
          )
        : undefined,
    );
    return and(
      eq(announcements.churchId, churchId),
      eq(announcements.status, 'published'),
      or(isNull(announcements.publishAt), lte(announcements.publishAt, now)),
      or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
      audience,
    ) as SQL;
  };

  const announcementsFor = (churchId: string, access: Access, groupIds: string[]) => {
    const readable = readableAnnouncements(churchId, access, groupIds);
    const newest = desc(sql`coalesce(${announcements.publishAt}, ${announcements.publishedAt}, ${announcements.createdAt})`);
    return {
      pinned: hydrateAnnouncements(
        db,
        db
          .select()
          .from(announcements)
          .where(and(readable, isNotNull(announcements.pinnedAt)))
          .orderBy(desc(announcements.pinnedAt))
          .limit(3)
          .all(),
      ),
      latest: hydrateAnnouncements(
        db,
        db
          .select()
          .from(announcements)
          .where(and(readable, isNull(announcements.pinnedAt)))
          .orderBy(newest)
          .limit(LIST_MAX)
          .all(),
      ),
    };
  };

  const myTasksOf = (church: ChurchRow, access: Access) => {
    const today = todayIn(church);
    const open = and(
      eq(careTasks.churchId, church.id),
      eq(careTasks.assignedUserId, access.userId),
      eq(careTasks.status, 'open'),
    );
    const rows = db
      .select()
      .from(careTasks)
      .where(open)
      .orderBy(sql`${careTasks.dueDate} is null`, asc(careTasks.dueDate), asc(careTasks.createdAt))
      .limit(LIST_MAX)
      .all();
    const openCount = db.select({ value: count() }).from(careTasks).where(open).get()?.value ?? 0;
    const overdueCount =
      db
        .select({ value: count() })
        .from(careTasks)
        .where(and(open, isNotNull(careTasks.dueDate), sql`${careTasks.dueDate} < ${today}`))
        .get()?.value ?? 0;
    const items = hydrateTasks(db, church.id, access, today, rows);
    return {
      items: items.map((task) => ({ ...task, isOverdue: isCareTaskOverdue(task, today) })),
      openCount,
      overdueCount,
    };
  };

  /** Children of the caller's household who are in class right now (today or yesterday). */
  const myKidsOf = (church: ChurchRow, access: Access) => {
    if (!access.personId) return [];
    const link = db
      .select({
        householdId: householdMembers.householdId,
        relationship: householdMembers.relationship,
      })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.churchId, church.id),
          eq(householdMembers.personId, access.personId),
        ),
      )
      .get();
    const childIds =
      link && (GUARDIAN_RELATIONSHIPS as readonly string[]).includes(link.relationship)
        ? db
            .select({ personId: householdMembers.personId })
            .from(householdMembers)
            .where(
              and(
                eq(householdMembers.churchId, church.id),
                eq(householdMembers.householdId, link.householdId),
                eq(householdMembers.relationship, 'child'),
              ),
            )
            .all()
            .map((row) => row.personId)
        : [];
    const whose = [
      ...(childIds.length > 0 ? [inArray(checkins.childPersonId, childIds)] : []),
      eq(checkins.guardianPersonId, access.personId),
    ];
    const rows = db
      .select({ checkin: checkins })
      .from(checkins)
      .innerJoin(checkinSessions, eq(checkinSessions.id, checkins.sessionId))
      .where(
        and(
          eq(checkins.churchId, church.id),
          eq(checkins.status, 'checked_in'),
          gte(checkinSessions.date, dayBefore(todayIn(church))),
          or(...whose),
        ),
      )
      .orderBy(asc(checkins.checkedInAt))
      .all()
      .map((row) => row.checkin);
    // The guardian holds the tag, so the security code is theirs to see.
    return hydrateCheckins(db, church.id, rows, () => true);
  };

  const attendanceOf = (church: ChurchRow, access: Access) => {
    const mine = access.personId
      ? attendanceStreakOf(marksOf(db, church.id, { personIds: [access.personId] }))
      : null;
    let recent = null;
    if (can.viewAttendanceOverview(access)) {
      const scoped = can.viewAllAttendance(access)
        ? eq(attendanceSessions.churchId, church.id)
        : and(
            eq(attendanceSessions.churchId, church.id),
            inArray(attendanceSessions.groupId, access.leaderGroupIds),
          );
      recent = hydrateSessions(
        db,
        db
          .select()
          .from(attendanceSessions)
          .where(and(scoped, lte(attendanceSessions.sessionAt, nowIso())))
          .orderBy(desc(attendanceSessions.sessionAt))
          .limit(6)
          .all(),
      ).map((session) => ({
        id: session.id,
        title: session.title,
        sessionAt: session.sessionAt,
        groupName: session.groupName,
        attendeeCount: session.attendeeCount,
      }));
    }
    const openAbsences = canViewAbsences(access)
      ? listAbsences(db, church.id, access, {
          threshold: INSIGHTS_LIMITS.absentStreakDefault,
          includeResolved: false,
        }).length
      : null;
    return { mine, recent, openAbsences };
  };

  const notificationsOf = (churchId: string, userId: string) => {
    const unread = and(
      eq(notifications.churchId, churchId),
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
    );
    return {
      unreadCount:
        db.select({ value: count() }).from(notifications).where(unread).get()?.value ?? 0,
      items: db
        .select({
          id: notifications.id,
          type: notifications.type,
          title: notifications.title,
          body: notifications.body,
          link: notifications.link,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(unread)
        .orderBy(desc(notifications.createdAt))
        .limit(LIST_MAX)
        .all(),
    };
  };

  return new Elysia({ prefix: '/churches/:churchId/dashboard' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access }) => {
        const now = nowIso();
        const countOf = (value: number | undefined) => value ?? 0;
        const preferences = preferencesOf(church.id, access.userId);
        const availableWidgets = availableHomeWidgets(access, church.enabledModules);
        const shows = (widget: HomeWidget) => availableWidgets.includes(widget);

        const peopleCount = countOf(
          db.select({ value: count() }).from(people).where(eq(people.churchId, church.id)).get()
            ?.value,
        );
        const activeGroups = countOf(
          db
            .select({ value: count() })
            .from(groups)
            .where(and(eq(groups.churchId, church.id), eq(groups.isActive, true)))
            .get()?.value,
        );
        const upcomingWhere = and(
          eq(events.churchId, church.id),
          isNull(events.cancelledAt),
          or(gte(events.startsAt, now), gte(events.endsAt, now)),
        );
        const upcomingCount = countOf(
          db.select({ value: count() }).from(events).where(upcomingWhere).get()?.value,
        );
        const members = countOf(
          db
            .select({ value: count() })
            .from(churchMemberships)
            .where(
              and(
                eq(churchMemberships.churchId, church.id),
                eq(churchMemberships.status, 'active'),
              ),
            )
            .get()?.value,
        );

        const { memberGroupIds, leaderGroupIds } = myGroupIdsOf(church.id, access);
        const myGroupIds = [...new Set([...memberGroupIds, ...leaderGroupIds])];
        const myGroups =
          myGroupIds.length > 0
            ? db
                .select({ id: groups.id, name: groups.name, type: groups.type })
                .from(groups)
                .where(and(eq(groups.churchId, church.id), inArray(groups.id, myGroupIds)))
                .orderBy(asc(groups.name))
                .all()
                .map((group) => ({ ...group, isLeader: leaderGroupIds.includes(group.id) }))
            : [];

        return {
          stats: { people: peopleCount, activeGroups, upcomingEvents: upcomingCount, members },
          widgets: orderHomeWidgets(availableWidgets, preferences),
          availableWidgets,
          preferences,
          mySchedule: shows('my_schedule')
            ? access.personId
              ? scheduleItems(
                  db,
                  church,
                  and(
                    eq(rosterAssignments.personId, access.personId),
                    ne(rosterAssignments.status, 'declined'),
                    ne(worshipServices.status, 'cancelled'),
                    upcomingCondition(Date.now()),
                  )!,
                  'asc',
                  LIST_MAX,
                )
              : []
            : null,
          myTasks: shows('my_tasks') ? myTasksOf(church, access) : null,
          myKids: shows('my_kids') ? myKidsOf(church, access) : null,
          upcomingEvents: shows('upcoming_events')
            ? hydrateEvents(
                db,
                db
                  .select()
                  .from(events)
                  .where(upcomingWhere)
                  .orderBy(asc(events.startsAt))
                  .limit(LIST_MAX)
                  .all(),
              )
            : null,
          announcements: shows('announcements')
            ? announcementsFor(church.id, access, myGroupIds)
            : null,
          celebrations: shows('birthdays')
            ? peopleStats(db, access, church.id, todayIn(church)).celebrations
            : null,
          notifications: notificationsOf(church.id, access.userId),
          attendance: attendanceOf(church, access),
          myGroups,
        };
      },
      { church: true, params: churchParamsSchema },
    )
    .get(
      '/preferences',
      ({ church, access }) => ({ preferences: preferencesOf(church.id, access.userId) }),
      { church: true, params: churchParamsSchema },
    )
    .put(
      '/preferences',
      ({ church, access, body }) => {
        const now = nowIso();
        db.insert(dashboardPreferences)
          .values({ userId: access.userId, churchId: church.id, ...body, updatedAt: now })
          .onConflictDoUpdate({
            target: [dashboardPreferences.userId, dashboardPreferences.churchId],
            set: { ...body, updatedAt: now },
          })
          .run();
        return { preferences: preferencesOf(church.id, access.userId) };
      },
      { church: true, params: churchParamsSchema, body: dashboardPreferencesInputSchema },
    );
};
