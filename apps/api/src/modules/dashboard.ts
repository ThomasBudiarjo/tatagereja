import { churchParamsSchema, fullName } from '@tatagereja/shared';
import { and, asc, count, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import {
  announcements,
  churchMemberships,
  events,
  groupLeaders,
  groupMembers,
  groups,
  people,
} from '../db/schema';
import type { Deps } from '../deps';
import { nowIso } from '../lib/time';
import { authPlugin } from '../plugins/auth';
import { hydrateAnnouncements } from '../services/announcements';
import { hydrateEvents } from '../services/events';

export const dashboardModule = (deps: Deps) => {
  const { db } = deps;

  return new Elysia({ prefix: '/churches/:churchId/dashboard' }).use(authPlugin(deps)).get(
    '/',
    ({ church, access }) => {
      const now = nowIso();
      const countOf = (value: number | undefined) => value ?? 0;

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
        or(gte(events.startsAt, now), gte(events.endsAt, now)),
      );
      const upcomingCount = countOf(
        db.select({ value: count() }).from(events).where(upcomingWhere).get()?.value,
      );
      const members = countOf(
        db
          .select({ value: count() })
          .from(churchMemberships)
          .where(eq(churchMemberships.churchId, church.id))
          .get()?.value,
      );

      const upcomingEvents = hydrateEvents(
        db,
        db.select().from(events).where(upcomingWhere).orderBy(asc(events.startsAt)).limit(5).all(),
      );

      const announcementVisibility =
        access.role === 'owner' || access.role === 'administrator'
          ? eq(announcements.churchId, church.id)
          : and(eq(announcements.churchId, church.id), eq(announcements.status, 'published'));
      const recentAnnouncements = hydrateAnnouncements(
        db,
        db
          .select()
          .from(announcements)
          .where(announcementVisibility)
          .orderBy(desc(sql`coalesce(${announcements.publishedAt}, ${announcements.createdAt})`))
          .limit(5)
          .all(),
      );

      const memberGroupIds = access.personId
        ? db
            .select({ groupId: groupMembers.groupId })
            .from(groupMembers)
            .where(eq(groupMembers.personId, access.personId))
            .all()
            .map((row) => row.groupId)
        : [];
      const leaderGroupIds = db
        .select({ groupId: groupLeaders.groupId })
        .from(groupLeaders)
        .where(and(eq(groupLeaders.churchId, church.id), eq(groupLeaders.userId, access.userId)))
        .all()
        .map((row) => row.groupId);
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

      const month = String(new Date().getUTCMonth() + 1).padStart(2, '0');
      const birthdaysThisMonth = db
        .select({
          id: people.id,
          firstName: people.firstName,
          lastName: people.lastName,
          birthDate: people.birthDate,
        })
        .from(people)
        .where(
          and(eq(people.churchId, church.id), sql`substr(${people.birthDate}, 6, 2) = ${month}`),
        )
        .orderBy(asc(sql`substr(${people.birthDate}, 9, 2)`))
        .limit(20)
        .all()
        .map((row) => ({ personId: row.id, name: fullName(row), birthDate: row.birthDate ?? '' }));

      return {
        stats: { people: peopleCount, activeGroups, upcomingEvents: upcomingCount, members },
        upcomingEvents,
        recentAnnouncements,
        myGroups,
        birthdaysThisMonth,
      };
    },
    { church: true, params: churchParamsSchema },
  );
};
