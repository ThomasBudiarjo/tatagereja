import type { Announcement } from '@tatagereja/shared';
import { inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { AnnouncementRow } from '../db/schema';
import { groups, users } from '../db/schema';
import { toAnnouncement } from '../serializers';

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
