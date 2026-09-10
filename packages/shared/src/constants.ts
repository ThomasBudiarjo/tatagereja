export const APP_NAME = 'tatagereja';
export const API_VERSION = 1;

export const CHURCH_ROLES = ['owner', 'administrator', 'member'] as const;
export type ChurchRole = (typeof CHURCH_ROLES)[number];

export const INVITABLE_ROLES = ['member', 'administrator'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const REGISTRATION_MODES = ['public', 'invite_only', 'disabled'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export const GENDERS = ['male', 'female', 'unspecified'] as const;
export type Gender = (typeof GENDERS)[number];

export const PERSON_MEMBERSHIP_STATUSES = ['visitor', 'regular', 'member', 'inactive'] as const;
export type PersonMembershipStatus = (typeof PERSON_MEMBERSHIP_STATUSES)[number];

export const MARITAL_STATUSES = [
  'single',
  'married',
  'widowed',
  'divorced',
  'unspecified',
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const GROUP_TYPES = ['ministry', 'small_group', 'committee', 'other'] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

export const PARTICIPANT_STATUSES = ['invited', 'going', 'not_going'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const ATTENDANCE_STATUSES = ['present', 'absent', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ANNOUNCEMENT_STATUSES = ['draft', 'published'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const INVITATION_STATUSES = ['active', 'expired', 'exhausted', 'revoked'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const LIMITS = {
  nameMin: 1,
  nameMax: 120,
  emailMax: 254,
  passwordMin: 8,
  passwordMax: 128,
  shortTextMax: 200,
  longTextMax: 5000,
  urlMax: 2048,
  phoneMax: 40,
  pageSizeDefault: 50,
  pageSizeMax: 200,
  invitationMaxUsesMax: 10000,
  invitationMaxDays: 365,
} as const;

export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'REGISTRATION_DISABLED',
  'INVITATION_REQUIRED',
  'INVITATION_INVALID',
  'TURNSTILE_REQUIRED',
  'TURNSTILE_FAILED',
  'BAD_REQUEST',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ROLE_LABELS: Record<ChurchRole, string> = {
  owner: 'Owner',
  administrator: 'Administrator',
  member: 'Member',
};

export const PERSON_MEMBERSHIP_STATUS_LABELS: Record<PersonMembershipStatus, string> = {
  visitor: 'Visitor',
  regular: 'Regular attendee',
  member: 'Member',
  inactive: 'Inactive',
};

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  ministry: 'Ministry',
  small_group: 'Small group',
  committee: 'Committee',
  other: 'Other',
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  unspecified: 'Not specified',
};

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  single: 'Single',
  married: 'Married',
  widowed: 'Widowed',
  divorced: 'Divorced',
  unspecified: 'Not specified',
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  excused: 'Excused',
};

export const PARTICIPANT_STATUS_LABELS: Record<ParticipantStatus, string> = {
  invited: 'Invited',
  going: 'Going',
  not_going: 'Not going',
};
