export const APP_NAME = 'tatagereja';
export const API_VERSION = 1;

export const CHURCH_ROLES = ['owner', 'administrator', 'member'] as const;
export type ChurchRole = (typeof CHURCH_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'suspended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

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

export const GROUP_TYPES = [
  'komisi',
  'ministry',
  'small_group',
  'committee',
  'choir',
  'area',
  'other',
] as const;
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
  tokenMax: 200,
  codeMax: 64,
  roleNameMax: 60,
  roleDescriptionMax: 500,
  customRolesMax: 100,
  rolesPerMemberMax: 20,
  auditSummaryMax: 500,
  auditPageSizeMax: 200,
  notificationTitleMax: 200,
  notificationBodyMax: 1000,
  notificationTypeMax: 80,
  /** Largest money amount in minor units (fits safely in a JS number and SQLite integer). */
  moneyMax: 999_999_999_999_999,
  csvRowsMax: 5000,
  /** Ids or records accepted by one bulk request (group members, participants, attendance). */
  bulkIdsMax: 1000,
  turnstileTokenMax: 4096,
  timezoneMax: 64,
  /** Default request body limit; the server's `MAX_BODY_KB` overrides it. */
  bodyKbDefault: 2048,
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
  /** The church switched the module off. */
  'MODULE_DISABLED',
  /** The caller's membership in the church is suspended. */
  'MEMBERSHIP_SUSPENDED',
  /** Granting a permission or role the caller does not hold themselves. */
  'ESCALATION_DENIED',
  /** The change would remove the caller's own ability to manage roles. */
  'LOCKOUT_PREVENTED',
  /** A second factor is needed to finish signing in, or the church policy requires 2FA. */
  'TWO_FACTOR_REQUIRED',
  /** The church policy requires 2FA and the caller has not set it up yet. */
  'TWO_FACTOR_SETUP_REQUIRED',
  'TWO_FACTOR_INVALID',
  /** Too many failed sign-in attempts for this account; wait before trying again. */
  'ACCOUNT_LOCKED',
  'PAYLOAD_TOO_LARGE',
  /** The entry is dated in a closed finance period. */
  'PERIOD_CLOSED',
  /** A booking, roster or schedule overlaps another one. */
  'SCHEDULING_CONFLICT',
  /** Segregation of duties: the same person cannot both request and approve or verify. */
  'SELF_APPROVAL',
  /** A cookie-authenticated write without a valid CSRF token or from another site. */
  'CSRF_FAILED',
  /** A refresh token was presented again after it had been rotated: the session is revoked. */
  'SESSION_REVOKED',
  /** A password reset link that is unknown, used or expired. */
  'RESET_LINK_INVALID',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ROLE_LABELS: Record<ChurchRole, string> = {
  owner: 'Owner',
  administrator: 'Administrator',
  member: 'Member',
};

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
};

export const PERSON_MEMBERSHIP_STATUS_LABELS: Record<PersonMembershipStatus, string> = {
  visitor: 'Visitor',
  regular: 'Regular attendee',
  member: 'Member',
  inactive: 'Inactive',
};

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  komisi: 'Commission',
  ministry: 'Ministry',
  small_group: 'Small group',
  committee: 'Committee',
  choir: 'Choir',
  area: 'Area group',
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
