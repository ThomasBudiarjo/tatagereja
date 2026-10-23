import {
  invitationStatusOf,
  isRoleTemplateKey,
  normalizePermissions,
  type Announcement,
  type AttendanceSession,
  type AuditLog,
  type Church,
  type CustomRole,
  type Event,
  type Group,
  type GroupLeader,
  type Invitation,
  type Locale,
  type Membership,
  type Notification,
  type Person,
  type PersonPrivateDetails,
  type PersonSummary,
  type User,
  type UserSummary,
} from '@tatagereja/shared';
import type {
  AnnouncementRow,
  AttendanceSessionRow,
  AuditLogRow,
  ChurchRoleRow,
  ChurchRow,
  EventRow,
  GroupRow,
  InvitationRow,
  MembershipRow,
  NotificationRow,
  PersonPrivateDetailsRow,
  PersonRow,
  UserRow,
} from './db/schema';
import { enabledModulesOf } from './services/modules';

export const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  avatarUrl: row.avatarUrl,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toUserSummary = (
  row: Pick<UserRow, 'id' | 'name' | 'email' | 'avatarUrl'>,
): UserSummary => ({
  id: row.id,
  name: row.name,
  email: row.email,
  avatarUrl: row.avatarUrl,
});

export const toChurch = (row: ChurchRow): Church => ({
  id: row.id,
  name: row.name,
  description: row.description,
  address: row.address,
  city: row.city,
  phone: row.phone,
  email: row.email,
  website: row.website,
  logoUrl: row.logoUrl,
  brandColor: row.brandColor,
  currency: row.currency,
  timezone: row.timezone,
  enabledModules: enabledModulesOf(row),
  ownerUserId: row.ownerUserId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toMembership = (
  row: MembershipRow,
  user: Pick<UserRow, 'id' | 'name' | 'email' | 'avatarUrl'>,
  roleIds: string[] = [],
): Membership => ({
  id: row.id,
  churchId: row.churchId,
  userId: row.userId,
  role: row.role,
  status: row.status,
  roleIds,
  joinedAt: row.joinedAt,
  user: toUserSummary(user),
});

export const invitationUrl = (appUrl: string, token: string): string =>
  `${appUrl}/join/${encodeURIComponent(token)}`;

/**
 * `token` is the plain link token, known only right after the link was made or regenerated;
 * everywhere else the invitation is listed without it.
 */
export const toInvitation = (
  row: InvitationRow,
  createdByName: string,
  appUrl: string,
  token: string | null = null,
): Invitation => ({
  id: row.id,
  churchId: row.churchId,
  token,
  role: row.role,
  label: row.label,
  expiresAt: row.expiresAt,
  maxUses: row.maxUses,
  useCount: row.useCount,
  revokedAt: row.revokedAt,
  status: invitationStatusOf(row),
  createdBy: row.createdBy,
  createdByName,
  createdAt: row.createdAt,
  url: token ? invitationUrl(appUrl, token) : null,
});

export const toPerson = (row: PersonRow): Person => ({
  id: row.id,
  churchId: row.churchId,
  firstName: row.firstName,
  lastName: row.lastName,
  gender: row.gender,
  birthDate: row.birthDate,
  email: row.email,
  phone: row.phone,
  address: row.address,
  photoUrl: row.photoUrl,
  membershipStatus: row.membershipStatus,
  joinedAt: row.joinedAt,
  notes: row.notes,
  userId: row.userId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toPersonSummary = (
  row: Pick<PersonRow, 'id' | 'firstName' | 'lastName' | 'photoUrl' | 'membershipStatus'>,
): PersonSummary => ({
  id: row.id,
  firstName: row.firstName,
  lastName: row.lastName,
  photoUrl: row.photoUrl,
  membershipStatus: row.membershipStatus,
});

export const toPrivateDetails = (row: PersonPrivateDetailsRow): PersonPrivateDetails => ({
  personId: row.personId,
  nationalId: row.nationalId,
  maritalStatus: row.maritalStatus,
  baptismDate: row.baptismDate,
  emergencyContactName: row.emergencyContactName,
  emergencyContactPhone: row.emergencyContactPhone,
  medicalNotes: row.medicalNotes,
  privateNotes: row.privateNotes,
  updatedAt: row.updatedAt,
});

export const toGroup = (row: GroupRow, memberCount: number, leaders: GroupLeader[]): Group => ({
  id: row.id,
  churchId: row.churchId,
  name: row.name,
  description: row.description,
  type: row.type,
  meetingSchedule: row.meetingSchedule,
  isActive: row.isActive,
  memberCount,
  leaders,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toEvent = (
  row: EventRow,
  groupName: string | null,
  participantCount: number,
): Event => ({
  id: row.id,
  churchId: row.churchId,
  groupId: row.groupId,
  groupName,
  title: row.title,
  description: row.description,
  location: row.location,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  isAllDay: row.isAllDay,
  participantCount,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export type AttendanceCounts = {
  presentCount: number;
  absentCount: number;
  excusedCount: number;
  totalCount: number;
};

export const toAttendanceSession = (
  row: AttendanceSessionRow,
  extras: { eventTitle: string | null; groupName: string | null } & AttendanceCounts,
): AttendanceSession => ({
  id: row.id,
  churchId: row.churchId,
  eventId: row.eventId,
  eventTitle: extras.eventTitle,
  groupId: row.groupId,
  groupName: extras.groupName,
  title: row.title,
  sessionAt: row.sessionAt,
  notes: row.notes,
  presentCount: extras.presentCount,
  absentCount: extras.absentCount,
  excusedCount: extras.excusedCount,
  totalCount: extras.totalCount,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toAnnouncement = (
  row: AnnouncementRow,
  groupName: string | null,
  authorName: string,
): Announcement => ({
  id: row.id,
  churchId: row.churchId,
  groupId: row.groupId,
  groupName,
  title: row.title,
  body: row.body,
  status: row.status,
  publishedAt: row.publishedAt,
  createdBy: row.createdBy,
  authorName,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toCustomRole = (row: ChurchRoleRow, memberCount: number): CustomRole => ({
  id: row.id,
  churchId: row.churchId,
  name: row.name,
  description: row.description,
  permissions: normalizePermissions(Array.isArray(row.permissions) ? row.permissions : []),
  isTemplate: row.isTemplate,
  templateKey: isRoleTemplateKey(row.templateKey) ? row.templateKey : null,
  memberCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toAuditLog = (row: AuditLogRow, actorName: string | null): AuditLog => ({
  id: row.id,
  churchId: row.churchId,
  actorUserId: row.actorUserId,
  actorName,
  module: row.module,
  action: row.action,
  entityType: row.entityType,
  entityId: row.entityId,
  summary: row.summary,
  before: row.before ?? null,
  after: row.after ?? null,
  ip: row.ip,
  userAgent: row.userAgent,
  createdAt: row.createdAt,
});

/** The title and body in the caller's language: English when it was stored, else Indonesian. */
export const localizedNotificationText = (
  row: Pick<NotificationRow, 'title' | 'titleEn' | 'body' | 'bodyEn'>,
  locale: Locale,
) => ({
  title: locale === 'en' ? (row.titleEn ?? row.title) : row.title,
  body: locale === 'en' && row.body !== null ? (row.bodyEn ?? row.body) : row.body,
});

export const toNotification = (row: NotificationRow, locale: Locale): Notification => ({
  id: row.id,
  churchId: row.churchId,
  type: row.type,
  ...localizedNotificationText(row, locale),
  link: row.link,
  entityType: row.entityType,
  entityId: row.entityId,
  readAt: row.readAt,
  createdAt: row.createdAt,
});
