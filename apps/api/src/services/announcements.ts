import {
  announcementStateOf,
  can,
  markdownExcerpt,
  type AccessLike,
  type Announcement,
  type AnnouncementDetails,
} from '@tatagereja/shared';
import { and, count, eq, gt, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Db, Queryable } from '../db/client';
import type { AnnouncementRow } from '../db/schema';
import {
  announcementAudienceRoles,
  announcementReads,
  announcements,
  churchMemberships,
  churchRoles,
  groupLeaders,
  groupMembers,
  groups,
  membershipRoles,
  people,
  users,
} from '../db/schema';
import { nowIso } from '../lib/time';
import { toAnnouncement } from '../serializers';
import { notify } from './notifications';

export function hydrateAnnouncements(db: Db, rows: AnnouncementRow[]): Announcement[] {
  if (rows.length === 0) return [];
  const groupIds = [...new Set(rows.map((row) => row.groupId).filter((id): id is string => !!id))];
  const authorIds = [...new Set(rows.map((row) => row.createdBy))];

  const groupNames = new Map<string, string>();
  if (groupIds.length > 0) {
    for (const row of db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(inArray(groups.id, groupIds))
      .all()) {
      groupNames.set(row.id, row.name);
    }
  }
  const authorNames = new Map<string, string>();
  for (const row of db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, authorIds))
    .all()) {
    authorNames.set(row.id, row.name);
  }
  return rows.map((row) =>
    toAnnouncement(
      row,
      row.groupId ? (groupNames.get(row.groupId) ?? null) : null,
      authorNames.get(row.createdBy) ?? 'Unknown',
    ),
  );
}

/** Role ids each announcement targets, keyed by announcement id. */
export function audienceRolesOf(db: Queryable, announcementIds: string[]): Map<string, string[]> {
  const byAnnouncement = new Map<string, string[]>();
  if (announcementIds.length === 0) return byAnnouncement;
  for (const row of db
    .select({
      announcementId: announcementAudienceRoles.announcementId,
      roleId: announcementAudienceRoles.roleId,
    })
    .from(announcementAudienceRoles)
    .where(inArray(announcementAudienceRoles.announcementId, announcementIds))
    .all()) {
    const list = byAnnouncement.get(row.announcementId) ?? [];
    list.push(row.roleId);
    byAnnouncement.set(row.announcementId, list);
  }
  return byAnnouncement;
}

/**
 * Adds audience roles, the derived state, the caller's read receipt and, for people who can
 * manage the post, how many members opened it.
 */
export function hydrateAnnouncementDetails(
  db: Db,
  rows: AnnouncementRow[],
  access: AccessLike,
  now = Date.now(),
): AnnouncementDetails[] {
  if (rows.length === 0) return [];
  const base = hydrateAnnouncements(db, rows);
  const ids = rows.map((row) => row.id);
  const roles = audienceRolesOf(db, ids);
  const roleIds = [...new Set([...roles.values()].flat())];
  const roleNames = new Map(
    roleIds.length > 0
      ? db
          .select({ id: churchRoles.id, name: churchRoles.name })
          .from(churchRoles)
          .where(inArray(churchRoles.id, roleIds))
          .all()
          .map((row) => [row.id, row.name])
      : [],
  );
  const readByMe = new Set(
    db
      .select({ id: announcementReads.announcementId })
      .from(announcementReads)
      .where(
        and(
          inArray(announcementReads.announcementId, ids),
          eq(announcementReads.userId, access.userId),
        ),
      )
      .all()
      .map((row) => row.id),
  );
  const manageable = new Set(
    rows.filter((row) => can.manageAnnouncement(access, row)).map((row) => row.id),
  );
  const seen = new Map(
    manageable.size > 0
      ? db
          .select({ id: announcementReads.announcementId, value: count() })
          .from(announcementReads)
          .where(inArray(announcementReads.announcementId, [...manageable]))
          .groupBy(announcementReads.announcementId)
          .all()
          .map((row) => [row.id, row.value])
      : [],
  );
  return rows.map((row, index) => {
    const targetRoleIds = roles.get(row.id) ?? [];
    const announcement = base[index] as Announcement;
    return {
      ...announcement,
      audience: row.audience,
      roleIds: targetRoleIds,
      roleNames: targetRoleIds.map((id) => roleNames.get(id) ?? '').filter(Boolean),
      publishAt: row.publishAt,
      expiresAt: row.expiresAt,
      pinned: row.pinnedAt !== null,
      coverImageUrl: row.coverImageUrl,
      state: announcementStateOf(row, now),
      seenCount: manageable.has(row.id) ? (seen.get(row.id) ?? 0) : null,
      readByMe: readByMe.has(row.id),
      visibleFrom: row.status === 'published' ? (row.publishAt ?? row.publishedAt) : null,
    };
  });
}

/** Groups the person belongs to as a member. */
export function memberGroupIdsOf(
  db: Queryable,
  churchId: string,
  personId: string | null,
): string[] {
  if (!personId) return [];
  return db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(and(eq(groupMembers.churchId, churchId), eq(groupMembers.personId, personId)))
    .all()
    .map((row) => row.groupId);
}

/** Published and inside its publish window: what members can read. */
export const liveAnnouncement = (now: string): SQL =>
  and(
    eq(announcements.status, 'published'),
    or(isNull(announcements.publishAt), lte(announcements.publishAt, now)),
    or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
  ) as SQL;

/**
 * Which announcements the caller may read, or undefined with `announcements.manage` (all of
 * them). Leaders also see every post of the groups they lead, drafts and schedules included.
 */
export function announcementVisibility(
  db: Queryable,
  churchId: string,
  access: AccessLike & { roleIds?: readonly string[] },
  now: string,
): SQL | undefined {
  if (can.viewAllAnnouncementDrafts(access)) return undefined;
  const groupIds = [
    ...new Set([...memberGroupIdsOf(db, churchId, access.personId), ...access.leaderGroupIds]),
  ];
  const roleIds = access.roleIds ?? [];
  const inAudience = or(
    eq(announcements.audience, 'church'),
    groupIds.length > 0
      ? and(eq(announcements.audience, 'group'), inArray(announcements.groupId, groupIds))
      : undefined,
    roleIds.length > 0
      ? and(
          eq(announcements.audience, 'roles'),
          sql`exists (select 1 from ${announcementAudienceRoles} where ${announcementAudienceRoles.announcementId} = ${announcements.id} and ${inArray(announcementAudienceRoles.roleId, [...roleIds])})`,
        )
      : undefined,
  );
  const readable = and(liveAnnouncement(now), inAudience) as SQL;
  return access.leaderGroupIds.length > 0
    ? (or(readable, inArray(announcements.groupId, [...access.leaderGroupIds])) as SQL)
    : readable;
}

/** Active members an announcement is meant for (its audience). */
export function announcementAudienceUserIds(
  db: Queryable,
  row: Pick<AnnouncementRow, 'id' | 'churchId' | 'audience' | 'groupId'>,
): string[] {
  const active = and(
    eq(churchMemberships.churchId, row.churchId),
    eq(churchMemberships.status, 'active'),
  );
  if (row.audience === 'church') {
    return db
      .select({ userId: churchMemberships.userId })
      .from(churchMemberships)
      .where(active)
      .all()
      .map((item) => item.userId);
  }
  let candidates: string[] = [];
  if (row.audience === 'group' && row.groupId) {
    const linked = db
      .select({ userId: people.userId })
      .from(groupMembers)
      .innerJoin(people, eq(people.id, groupMembers.personId))
      .where(and(eq(groupMembers.groupId, row.groupId), eq(groupMembers.churchId, row.churchId)))
      .all()
      .flatMap((item) => (item.userId ? [item.userId] : []));
    const leaders = db
      .select({ userId: groupLeaders.userId })
      .from(groupLeaders)
      .where(and(eq(groupLeaders.groupId, row.groupId), eq(groupLeaders.churchId, row.churchId)))
      .all()
      .map((item) => item.userId);
    candidates = [...linked, ...leaders];
  } else if (row.audience === 'roles') {
    const roleIds = audienceRolesOf(db, [row.id]).get(row.id) ?? [];
    if (roleIds.length === 0) return [];
    candidates = db
      .select({ userId: churchMemberships.userId })
      .from(membershipRoles)
      .innerJoin(churchMemberships, eq(churchMemberships.id, membershipRoles.membershipId))
      .where(
        and(inArray(membershipRoles.roleId, roleIds), eq(membershipRoles.churchId, row.churchId)),
      )
      .all()
      .map((item) => item.userId);
  }
  const unique = [...new Set(candidates)];
  if (unique.length === 0) return [];
  return db
    .select({ userId: churchMemberships.userId })
    .from(churchMemberships)
    .where(and(active, inArray(churchMemberships.userId, unique)))
    .all()
    .map((item) => item.userId);
}

/**
 * Notifies the audience of a live announcement exactly once: `notified_at` is claimed in the
 * same statement, so a scheduled post released by two requests at once notifies once.
 */
export function notifyAnnouncementOnce(
  tx: Queryable,
  row: AnnouncementRow,
  actorUserId: string | null,
  now = nowIso(),
): number {
  const claimed = tx
    .update(announcements)
    .set({ notifiedAt: now })
    .where(
      and(eq(announcements.id, row.id), isNull(announcements.notifiedAt), liveAnnouncement(now)),
    )
    .returning({ id: announcements.id })
    .get();
  if (!claimed) return 0;
  return notify(tx, {
    churchId: row.churchId,
    userIds: announcementAudienceUserIds(tx, row),
    excludeUserIds: actorUserId ? [actorUserId] : [],
    type: 'announcement.published',
    title: row.title,
    body: markdownExcerpt(row.body, 200),
    link: `/c/${row.churchId}/announcements/${row.id}`,
    entityType: 'announcement',
    entityId: row.id,
  });
}

/**
 * Releases scheduled announcements whose publish time has passed: their audience hears about
 * them now. Called from reads (lists and the unread count the bell polls), so no timer is needed.
 */
export function releaseDueAnnouncements(db: Db, churchIds?: readonly string[]): number {
  if (churchIds && churchIds.length === 0) return 0;
  const now = nowIso();
  const due = db
    .select()
    .from(announcements)
    .where(
      and(
        isNull(announcements.notifiedAt),
        liveAnnouncement(now),
        churchIds ? inArray(announcements.churchId, [...churchIds]) : undefined,
      ),
    )
    .limit(50)
    .all();
  let sent = 0;
  for (const row of due) {
    sent += db.transaction((tx) => notifyAnnouncementOnce(tx, row, row.createdBy, now));
  }
  return sent;
}
