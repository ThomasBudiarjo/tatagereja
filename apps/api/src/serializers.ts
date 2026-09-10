import {
  invitationStatusOf,
  type Announcement,
  type AttendanceSession,
  type Church,
  type Event,
  type Group,
  type GroupLeader,
  type Invitation,
  type Membership,
  type Person,
  type PersonPrivateDetails,
  type PersonSummary,
  type User,
  type UserSummary,
} from '@tatagereja/shared';
import type {
  AnnouncementRow,
  AttendanceSessionRow,
  ChurchRow,
  EventRow,
  GroupRow,
  InvitationRow,
  MembershipRow,
  PersonPrivateDetailsRow,
  PersonRow,
  UserRow,
} from './db/schema';

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
  ownerUserId: row.ownerUserId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toMembership = (
  row: MembershipRow,
  user: Pick<UserRow, 'id' | 'name' | 'email' | 'avatarUrl'>,
): Membership => ({
  id: row.id,
  churchId: row.churchId,
  userId: row.userId,
  role: row.role,
  joinedAt: row.joinedAt,
  user: toUserSummary(user),
});

export const invitationUrl = (appUrl: string, token: string): string =>
  `${appUrl}/join/${encodeURIComponent(token)}`;

export const toInvitation = (
  row: InvitationRow,
  createdByName: string,
  appUrl: string,
): Invitation => ({
  id: row.id,
  churchId: row.churchId,
  token: row.token,
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
  url: invitationUrl(appUrl, row.token),
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
