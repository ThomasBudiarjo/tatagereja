import {
  LIMITS,
  has,
  notificationTypeDefinition,
  type LocalizedText,
  type NotificationType,
  type Permission,
} from '@tatagereja/shared';
import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import type { Queryable } from '../db/client';
import {
  churchMemberships,
  groupLeaders,
  groupMembers,
  membershipRoles,
  notificationPreferences,
  notifications,
  people,
} from '../db/schema';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { permissionsByUser } from './access';

/** Who receives a church notification. Only active members of the church ever receive it. */
export type NotifyAudience =
  | { kind: 'church' }
  | { kind: 'group'; groupId: string }
  | { kind: 'permission'; permission: Permission }
  | { kind: 'role'; roleId: string };

/**
 * Notification text in both interface languages. A plain string (a service title, a person's
 * own words) is the same in both.
 */
export type NotifyText = string | LocalizedText;

export type NotifyInput = {
  /** Null only for account-level notices (then `userIds` is required). */
  churchId: string | null;
  type: NotificationType;
  title: NotifyText;
  body?: NotifyText | null;
  /** In-app path, e.g. `/c/${churchId}/events/${id}`. Never an external URL. */
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Usually the actor, who does not need to hear about their own change. */
  excludeUserIds?: readonly string[];
} & (
  { userIds: readonly string[]; audience?: never } | { audience: NotifyAudience; userIds?: never }
);

const activeMembers = (db: Queryable, churchId: string, userIds?: readonly string[]): string[] => {
  if (userIds && userIds.length === 0) return [];
  const conditions = [
    eq(churchMemberships.churchId, churchId),
    eq(churchMemberships.status, 'active'),
  ];
  if (userIds) conditions.push(inArray(churchMemberships.userId, [...userIds]));
  return db
    .select({ userId: churchMemberships.userId })
    .from(churchMemberships)
    .where(and(...conditions))
    .all()
    .map((row) => row.userId);
};

const audienceUserIds = (db: Queryable, churchId: string, audience: NotifyAudience): string[] => {
  switch (audience.kind) {
    case 'church':
      return activeMembers(db, churchId);
    case 'group': {
      const linked = db
        .select({ userId: people.userId })
        .from(groupMembers)
        .innerJoin(people, eq(people.id, groupMembers.personId))
        .where(and(eq(groupMembers.groupId, audience.groupId), eq(groupMembers.churchId, churchId)))
        .all()
        .flatMap((row) => (row.userId ? [row.userId] : []));
      const leaders = db
        .select({ userId: groupLeaders.userId })
        .from(groupLeaders)
        .where(and(eq(groupLeaders.groupId, audience.groupId), eq(groupLeaders.churchId, churchId)))
        .all()
        .map((row) => row.userId);
      return activeMembers(db, churchId, [...new Set([...linked, ...leaders])]);
    }
    case 'permission':
      return [...permissionsByUser(db, churchId)]
        .filter(([, permissions]) => has({ permissions }, audience.permission))
        .map(([userId]) => userId);
    case 'role':
      return db
        .select({ userId: churchMemberships.userId })
        .from(membershipRoles)
        .innerJoin(churchMemberships, eq(churchMemberships.id, membershipRoles.membershipId))
        .where(
          and(
            eq(membershipRoles.roleId, audience.roleId),
            eq(membershipRoles.churchId, churchId),
            eq(churchMemberships.status, 'active'),
          ),
        )
        .all()
        .map((row) => row.userId);
  }
};

/** Indonesian for the main column; English only when it differs, read back by `localizedTitle`. */
const textOf = (text: NotifyText, max: number) => {
  const id = (typeof text === 'string' ? text : text.id).slice(0, max);
  const en = typeof text === 'string' ? null : text.en.slice(0, max);
  return { id, en: en === id ? null : en };
};

/** Recipients who turned this type off (or never turned an off-by-default type on). */
const mutedUserIds = (db: Queryable, type: NotificationType, userIds: string[]): Set<string> => {
  const definition = notificationTypeDefinition(type);
  if (definition.mandatory || userIds.length === 0) return new Set();
  const choices = new Map(
    db
      .select({ userId: notificationPreferences.userId, inApp: notificationPreferences.inApp })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.type, type),
          inArray(notificationPreferences.userId, userIds),
        ),
      )
      .all()
      .map((row) => [row.userId, row.inApp]),
  );
  const fallback = definition.defaultInApp ?? true;
  return new Set(userIds.filter((userId) => !(choices.get(userId) ?? fallback)));
};

/**
 * An identical unread notice (same type, item, title and body) within this many minutes is not sent
 * again: toggling something back and forth (join and cancel, RSVP, "I prayed") cannot flood an
 * inbox. Mandatory security notices are always sent.
 */
export const NOTIFY_REPEAT_MINUTES = 10;

/** Recipients who already hold an identical unread notice from the last few minutes. */
const repeatedUserIds = (
  db: Queryable,
  input: NotifyInput,
  text: { title: string; body: string | null },
  userIds: string[],
): Set<string> => {
  if (!input.entityId || userIds.length === 0) return new Set();
  if (notificationTypeDefinition(input.type).mandatory) return new Set();
  const since = new Date(Date.now() - NOTIFY_REPEAT_MINUTES * 60_000).toISOString();
  return new Set(
    db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          inArray(notifications.userId, userIds),
          eq(notifications.type, input.type),
          eq(notifications.entityId, input.entityId),
          eq(notifications.title, text.title),
          text.body === null ? isNull(notifications.body) : eq(notifications.body, text.body),
          isNull(notifications.readAt),
          gte(notifications.createdAt, since),
        ),
      )
      .all()
      .map((row) => row.userId),
  );
};

/**
 * Creates one in-app notification per recipient, respecting each person's preferences.
 * Pass the transaction handle when it belongs to a change, so both commit together.
 * Never put confidential text (care notes, amounts) into the title or body. An identical
 * unread notice sent minutes ago is not repeated (`NOTIFY_REPEAT_MINUTES`).
 * Returns the number of notifications created.
 */
export function notify(db: Queryable, input: NotifyInput): number {
  const candidates = input.audience
    ? input.churchId
      ? audienceUserIds(db, input.churchId, input.audience)
      : []
    : input.churchId
      ? activeMembers(db, input.churchId, [...new Set(input.userIds)])
      : [...new Set(input.userIds)];
  const excluded = new Set(input.excludeUserIds ?? []);
  const recipients = [...new Set(candidates)].filter((userId) => !excluded.has(userId));
  const muted = mutedUserIds(db, input.type, recipients);
  const title = textOf(input.title, LIMITS.notificationTitleMax);
  const body = input.body ? textOf(input.body, LIMITS.notificationBodyMax) : null;
  const unmuted = recipients.filter((userId) => !muted.has(userId));
  const repeated = repeatedUserIds(db, input, { title: title.id, body: body?.id ?? null }, unmuted);
  const deliver = unmuted.filter((userId) => !repeated.has(userId));
  if (deliver.length === 0) return 0;
  const now = nowIso();
  const link =
    input.link && input.link.startsWith('/') && !input.link.startsWith('//') ? input.link : null;
  const rows = deliver.map((userId) => ({
    id: newId(),
    churchId: input.churchId,
    userId,
    type: input.type,
    title: title.id,
    titleEn: title.en,
    body: body?.id ?? null,
    bodyEn: body?.en ?? null,
    link: link ? link.slice(0, LIMITS.urlMax) : null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    readAt: null,
    createdAt: now,
  }));
  // SQLite limits bound parameters per statement; insert in chunks.
  for (let index = 0; index < rows.length; index += 500) {
    db.insert(notifications)
      .values(rows.slice(index, index + 500))
      .run();
  }
  return rows.length;
}
