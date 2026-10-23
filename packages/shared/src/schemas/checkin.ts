// Zod schemas, enums and labels owned by the checkin module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { GENDERS, LIMITS } from '../constants';
import type { LocalizedText } from '../localized';
import { has, hasAny, type AccessLike } from '../permissions';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  optionalDate,
  optionalHexColor,
  optionalText,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
} from './common';
import { ageOn } from './people';
import { personSummarySchema } from './person';

/** Characters people read aloud: no 0/O, 1/I/L. Matches the API's `UNAMBIGUOUS_ALPHABET`. */
export const SECURITY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const CHECKIN_LIMITS = {
  securityCodeLength: 4,
  childrenPerCheckInMax: 12,
  pickupsPerChildMax: 10,
  alertsPerChildMax: 20,
  alertDescriptionMax: 500,
  /** Check-out attempts allowed per check-in before a cool-down. */
  checkoutAttemptsMax: 10,
  /** Check-out attempts one volunteer may make across all check-ins in the same window. */
  checkoutUserAttemptsMax: 100,
  checkoutWindowMinutes: 15,
  kioskQueryMin: 2,
  kioskResultsMax: 10,
  labelsMax: 50,
  teachersPerClassMax: 50,
  recentSessionsMax: 6,
  /** Default oldest age (years) counted as a child for household check-in. */
  childMaxAgeDefault: 15,
} as const;

/** Household members who may check their household's children in and pick them up. */
export const GUARDIAN_RELATIONSHIPS = ['head', 'spouse', 'parent'] as const;

export const CHECKIN_SESSION_STATUSES = ['open', 'closed'] as const;
export type CheckinSessionStatus = (typeof CHECKIN_SESSION_STATUSES)[number];

export const CHECKIN_SESSION_STATUS_LABELS: Record<CheckinSessionStatus, LocalizedText> = {
  open: { en: 'Open', id: 'Dibuka' },
  closed: { en: 'Closed', id: 'Ditutup' },
};

export const CHECKIN_STATUSES = ['checked_in', 'checked_out'] as const;
export type CheckinStatus = (typeof CHECKIN_STATUSES)[number];

export const CHECKIN_STATUS_LABELS: Record<CheckinStatus, LocalizedText> = {
  checked_in: { en: 'In class', id: 'Di kelas' },
  checked_out: { en: 'Picked up', id: 'Sudah dijemput' },
};

export const CHECKIN_METHODS = ['staff', 'self', 'kiosk'] as const;
export type CheckinMethod = (typeof CHECKIN_METHODS)[number];

export const CHECKIN_METHOD_LABELS: Record<CheckinMethod, LocalizedText> = {
  staff: { en: 'By a volunteer', id: 'Oleh petugas' },
  self: { en: 'By the guardian', id: 'Oleh orang tua' },
  kiosk: { en: 'At the kiosk', id: 'Di kios' },
};

export const CHILD_ALERT_KINDS = ['allergy', 'medical', 'custody', 'other'] as const;
export type ChildAlertKind = (typeof CHILD_ALERT_KINDS)[number];

export const CHILD_ALERT_KIND_LABELS: Record<ChildAlertKind, LocalizedText> = {
  allergy: { en: 'Allergy', id: 'Alergi' },
  medical: { en: 'Medical', id: 'Kondisi medis' },
  custody: { en: 'Custody', id: 'Hak asuh' },
  other: { en: 'Other', id: 'Lainnya' },
};

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, LocalizedText> = {
  info: { en: 'Information', id: 'Informasi' },
  warning: { en: 'Warning', id: 'Perhatian' },
  critical: { en: 'Critical', id: 'Sangat penting' },
};

/** Suggested Sekolah Minggu classes (ages in years, inclusive). */
export const DEFAULT_CHECKIN_CLASSES: readonly { name: string; minAge: number; maxAge: number }[] =
  [
    { name: 'Balita', minAge: 0, maxAge: 3 },
    { name: 'Kelas Kecil', minAge: 4, maxAge: 6 },
    { name: 'Kelas Tengah', minAge: 7, maxAge: 9 },
    { name: 'Kelas Besar', minAge: 10, maxAge: 12 },
    { name: 'Tunas Remaja', minAge: 13, maxAge: 15 },
  ];

/** A typed security code: case and spaces are ignored. */
export const securityCodeSchema = z
  .string()
  .max(LIMITS.codeMax)
  .transform((value) => value.replace(/\s+/g, '').toUpperCase())
  .pipe(
    z
      .string()
      .length(CHECKIN_LIMITS.securityCodeLength, 'Enter the code from the guardian tag')
      .regex(new RegExp(`^[${SECURITY_CODE_ALPHABET}]+$`), 'Enter the code from the guardian tag'),
  );

// ---------------------------------------------------------------------------------------------
// Rules shared by the API and the interface
// ---------------------------------------------------------------------------------------------

/** Volunteers and coordinators run check-in stations, rosters and check-out. */
export const canOperateCheckin = (access: Pick<AccessLike, 'permissions'>) =>
  hasAny(access, ['checkin.operate', 'checkin.manage']);

/** Classes, teachers, sessions, child placement and overrides. */
export const canManageCheckin = (access: Pick<AccessLike, 'permissions'>) =>
  has(access, 'checkin.manage');

/** Teachers see more than the roster ratio; only managers may check out without the code. */
export const canOverrideCheckout = (access: Pick<AccessLike, 'permissions'>) =>
  has(access, 'checkin.manage');

/**
 * Alerts and authorized pickups of a child are set by the child's guardian or by a coordinator.
 * `isGuardian` is decided by the API from the household (see `GUARDIAN_RELATIONSHIPS`).
 */
export const canEditChildCare = (
  access: Pick<AccessLike, 'permissions'>,
  child: { isGuardian: boolean },
) => child.isGuardian || has(access, 'checkin.manage');

/** Children per teacher above the class limit. */
export const isRatioExceeded = (
  children: number,
  teachers: number,
  maxChildrenPerTeacher: number | null,
): boolean =>
  maxChildrenPerTeacher !== null &&
  children > 0 &&
  (teachers === 0 || children / teachers > maxChildrenPerTeacher);

/** Whole years on `today`, or null without a birth date. */
export const childAge = (birthDate: string | null, today: string): number | null =>
  birthDate ? Math.max(0, ageOn(birthDate, today)) : null;

type ClassForAge = {
  id: string;
  minAge: number | null;
  maxAge: number | null;
  isActive: boolean;
  sortOrder: number;
};

/**
 * The class a child goes to: the child's usual class when it is active, otherwise the first
 * active class (by sort order) whose age range holds the child's age. Null when nothing fits.
 */
export const suggestClass = <T extends ClassForAge>(
  classes: readonly T[],
  age: number | null,
  defaultClassId: string | null,
): T | null => {
  const active = classes.filter((item) => item.isActive);
  const preferred = defaultClassId ? active.find((item) => item.id === defaultClassId) : undefined;
  if (preferred) return preferred;
  if (age === null) return null;
  return (
    [...active]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find(
        (item) =>
          (item.minAge !== null || item.maxAge !== null) &&
          (item.minAge === null || age >= item.minAge) &&
          (item.maxAge === null || age <= item.maxAge),
      ) ?? null
  );
};

/** The day before `date` (YYYY-MM-DD). */
export const dayBefore = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};

/**
 * Guardians check in from their phones only to today's sessions (yesterday's too, for a church
 * whose evening service runs past midnight), never to old or future ones.
 */
export const isSelfCheckInDate = (sessionDate: string, today: string): boolean =>
  sessionDate <= today && sessionDate >= dayBefore(today);

/** The last four digits of a phone number, for the kiosk search and the masked display. */
export const phoneLast4 = (phone: string | null | undefined): string | null => {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
};

/** The worst severity among active alerts, for badges and label markers. */
export const highestSeverity = (
  alerts: readonly { severity: AlertSeverity; isActive: boolean }[],
): AlertSeverity | null => {
  let worst: AlertSeverity | null = null;
  for (const alert of alerts) {
    if (!alert.isActive) continue;
    if (ALERT_SEVERITIES.indexOf(alert.severity) > (worst ? ALERT_SEVERITIES.indexOf(worst) : -1))
      worst = alert.severity;
  }
  return worst;
};

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export const checkinSettingsSchema = z.object({
  /** Guardians may check their own children in from their phones. */
  allowSelfCheckIn: z.boolean().default(true),
  /** Oldest age (years) offered for household check-in. */
  childMaxAge: z.number().int().min(1).max(25).default(CHECKIN_LIMITS.childMaxAgeDefault),
});
export type CheckinSettings = z.infer<typeof checkinSettingsSchema>;

export const checkinSettingsResponseSchema = z.object({ settings: checkinSettingsSchema });

// ---------------------------------------------------------------------------------------------
// Classes and sessions
// ---------------------------------------------------------------------------------------------

export const checkinClassSchema = z.object({
  id: idSchema,
  name: z.string(),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  resourceId: idSchema.nullable(),
  location: z.string().nullable(),
  capacity: z.number().int().nullable(),
  maxChildrenPerTeacher: z.number().int().nullable(),
  color: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  teachers: z.array(personSummarySchema.extend({ isLead: z.boolean() })),
});
export type CheckinClass = z.infer<typeof checkinClassSchema>;

export const checkinClassInputSchema = z
  .object({
    name: requiredText(2, LIMITS.nameMax),
    minAge: z.number().int().min(0).max(25).nullable().default(null),
    maxAge: z.number().int().min(0).max(25).nullable().default(null),
    resourceId: idSchema.nullable().default(null),
    location: optionalText(LIMITS.shortTextMax),
    capacity: z.number().int().min(1).max(1000).nullable().default(null),
    maxChildrenPerTeacher: z.number().int().min(1).max(100).nullable().default(null),
    color: optionalHexColor,
    sortOrder: z.number().int().min(0).max(10_000).default(0),
    isActive: z.boolean().default(true),
  })
  .refine(
    (value) => value.minAge === null || value.maxAge === null || value.minAge <= value.maxAge,
    { message: 'The youngest age must not be above the oldest', path: ['maxAge'] },
  );
export type CheckinClassInput = z.infer<typeof checkinClassInputSchema>;

export const checkinClassListQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const checkinClassListSchema = z.object({ items: z.array(checkinClassSchema) });
export const checkinClassResponseSchema = z.object({ class: checkinClassSchema });

export const setClassTeachersBodySchema = z.object({
  teachers: z
    .array(z.object({ personId: idSchema, isLead: z.boolean().default(false) }))
    .max(CHECKIN_LIMITS.teachersPerClassMax),
});
export type SetClassTeachersBody = z.infer<typeof setClassTeachersBodySchema>;

export const checkinSessionSchema = z.object({
  id: idSchema,
  name: z.string(),
  date: isoDateSchema,
  worshipServiceId: idSchema.nullable(),
  /** Title of the linked worship service (ibadah), when there is one. */
  serviceTitle: z.string().nullable(),
  attendanceSessionId: idSchema.nullable(),
  status: z.enum(CHECKIN_SESSION_STATUSES),
  openedAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.nullable(),
  /** Children in class right now. */
  checkedInCount: z.number().int().nonnegative(),
  /** Every check-in of the session, picked up or not. */
  totalCount: z.number().int().nonnegative(),
});
export type CheckinSession = z.infer<typeof checkinSessionSchema>;

export const checkinSessionInputSchema = z.object({
  name: requiredText(2, LIMITS.nameMax),
  date: isoDateSchema,
  worshipServiceId: idSchema.nullable().default(null),
});
export type CheckinSessionInput = z.infer<typeof checkinSessionInputSchema>;

/** A worship service (ibadah) a session can belong to, from the worship module's schedule. */
export const checkinServiceOptionSchema = z.object({
  id: idSchema,
  title: z.string(),
  startsAt: isoDateTimeSchema,
});
export type CheckinServiceOption = z.infer<typeof checkinServiceOptionSchema>;

export const checkinServiceListQuerySchema = z.object({ date: isoDateSchema });
export const checkinServiceListSchema = z.object({ items: z.array(checkinServiceOptionSchema) });

export const checkinSessionListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CHECKIN_SESSION_STATUSES).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type CheckinSessionListQuery = z.infer<typeof checkinSessionListQuerySchema>;

export const checkinSessionListSchema = paginatedSchema(checkinSessionSchema);
export const checkinSessionResponseSchema = z.object({ session: checkinSessionSchema });

/** One class in a session: headcount and ratio, for the session page and the home. */
export const sessionClassStatSchema = z.object({
  classId: idSchema,
  name: z.string(),
  color: z.string().nullable(),
  location: z.string().nullable(),
  capacity: z.number().int().nullable(),
  maxChildrenPerTeacher: z.number().int().nullable(),
  presentCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  teacherCount: z.number().int().nonnegative(),
  /** Children in class with an active alert. */
  alertCount: z.number().int().nonnegative(),
  ratioExceeded: z.boolean(),
});
export type SessionClassStat = z.infer<typeof sessionClassStatSchema>;

export const checkinSessionDetailSchema = z.object({
  session: checkinSessionSchema,
  classes: z.array(sessionClassStatSchema),
});
export type CheckinSessionDetail = z.infer<typeof checkinSessionDetailSchema>;

// ---------------------------------------------------------------------------------------------
// Children: alerts, pickups
// ---------------------------------------------------------------------------------------------

export const childAlertSchema = z.object({
  id: idSchema,
  personId: idSchema,
  kind: z.enum(CHILD_ALERT_KINDS),
  severity: z.enum(ALERT_SEVERITIES),
  description: z.string(),
  isActive: z.boolean(),
  updatedAt: isoDateTimeSchema,
});
export type ChildAlert = z.infer<typeof childAlertSchema>;

export const childAlertInputSchema = z.object({
  kind: z.enum(CHILD_ALERT_KINDS),
  severity: z.enum(ALERT_SEVERITIES).default('warning'),
  description: requiredText(2, CHECKIN_LIMITS.alertDescriptionMax),
  isActive: z.boolean().default(true),
});
export type ChildAlertInput = z.infer<typeof childAlertInputSchema>;

export const childParamsSchema = z.object({ churchId: idSchema, personId: idSchema });
export const childAlertParamsSchema = childParamsSchema.extend({ alertId: idSchema });
export const childPickupParamsSchema = childParamsSchema.extend({ pickupId: idSchema });
export const sessionClassParamsSchema = z.object({
  churchId: idSchema,
  id: idSchema,
  classId: idSchema,
});

export const authorizedPickupSchema = z.object({
  id: idSchema,
  childPersonId: idSchema,
  pickupPersonId: idSchema.nullable(),
  name: z.string(),
  relationship: z.string().nullable(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
});
export type AuthorizedPickup = z.infer<typeof authorizedPickupSchema>;

export const authorizedPickupInputSchema = z
  .object({
    pickupPersonId: idSchema.nullable().default(null),
    name: optionalText(LIMITS.nameMax),
    relationship: optionalText(60),
    phone: optionalText(LIMITS.phoneMax),
    notes: optionalText(LIMITS.shortTextMax),
  })
  .refine((value) => value.pickupPersonId || value.name, {
    message: 'Choose a person or enter a name',
    path: ['name'],
  });
export type AuthorizedPickupInput = z.infer<typeof authorizedPickupInputSchema>;

export const checkinChildSchema = personSummarySchema.extend({
  birthDate: isoDateSchema.nullable(),
  age: z.number().int().nullable(),
  defaultClassId: idSchema.nullable(),
  /** Suggested class from the default or the age ranges. */
  suggestedClassId: idSchema.nullable(),
  alerts: z.array(childAlertSchema),
  /** Open check-in in the session, when already checked in. */
  currentCheckinId: idSchema.nullable(),
});
export type CheckinChild = z.infer<typeof checkinChildSchema>;

/** A family found at the kiosk or loaded for a guardian's self check-in. */
export const checkinHouseholdSchema = z.object({
  householdId: idSchema,
  name: z.string(),
  /** Last four digits of the family phone, to tell families with one name apart. */
  phoneLast4: z.string().nullable(),
  guardians: z.array(personSummarySchema),
  children: z.array(checkinChildSchema),
});
export type CheckinHousehold = z.infer<typeof checkinHouseholdSchema>;

export const kioskSearchQuerySchema = z
  .object({
    /** Family name, or the last four digits of a phone number. */
    q: z.string().trim().min(CHECKIN_LIMITS.kioskQueryMin).max(LIMITS.nameMax),
    /** Marks children already checked in to this session. */
    sessionId: idSchema.optional(),
  })
  .transform((value) => ({
    ...value,
    phoneLast4: /^\d{4}$/.test(value.q) ? value.q : null,
  }));
export type KioskSearchQuery = z.infer<typeof kioskSearchQuerySchema>;

export const checkinHouseholdListSchema = z.object({ items: z.array(checkinHouseholdSchema) });

export const checkinChildListQuerySchema = paginationQuerySchema.extend({
  /** Only children with an active alert. */
  alerts: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  classId: idSchema.optional(),
  sessionId: idSchema.optional(),
});
export type CheckinChildListQuery = z.infer<typeof checkinChildListQuerySchema>;

export const checkinChildListItemSchema = checkinChildSchema.extend({
  householdName: z.string().nullable(),
});
export type CheckinChildListItem = z.infer<typeof checkinChildListItemSchema>;
export const checkinChildListSchema = paginatedSchema(checkinChildListItemSchema);

/** A first-time visitor child registered at the door, with who brought them. */
export const newCheckinChildInputSchema = z.object({
  firstName: requiredText(LIMITS.nameMin, LIMITS.nameMax),
  lastName: optionalText(LIMITS.nameMax),
  gender: z.enum(GENDERS).default('unspecified'),
  birthDate: optionalDate,
  defaultClassId: idSchema.nullable().default(null),
  guardianName: optionalText(LIMITS.nameMax),
  guardianPhone: optionalText(LIMITS.phoneMax),
});
export type NewCheckinChildInput = z.infer<typeof newCheckinChildInputSchema>;

export const childProfileInputSchema = z.object({ defaultClassId: idSchema.nullable() });
export type ChildProfileInput = z.infer<typeof childProfileInputSchema>;

export const checkinChildDetailSchema = z.object({
  child: checkinChildListItemSchema,
  householdId: idSchema.nullable(),
  guardians: z.array(personSummarySchema),
  pickups: z.array(authorizedPickupSchema),
  /** Every alert, inactive ones included, newest first. */
  alerts: z.array(childAlertSchema),
  attendanceCount: z.number().int().nonnegative(),
  lastCheckedInAt: isoDateTimeSchema.nullable(),
  isGuardian: z.boolean(),
  canEdit: z.boolean(),
});
export type CheckinChildDetail = z.infer<typeof checkinChildDetailSchema>;

export const checkinChildResponseSchema = z.object({ child: checkinChildListItemSchema });
export const childAlertResponseSchema = z.object({ alert: childAlertSchema });
export const authorizedPickupResponseSchema = z.object({ pickup: authorizedPickupSchema });

// ---------------------------------------------------------------------------------------------
// Check-in, labels, roster and check-out
// ---------------------------------------------------------------------------------------------

export const checkinSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  classId: idSchema,
  className: z.string(),
  child: personSummarySchema,
  guardian: personSummarySchema.nullable(),
  /** Only returned to the guardian at check-in time, on labels, and to `checkin.manage`. */
  securityCode: z.string().nullable(),
  method: z.enum(CHECKIN_METHODS),
  status: z.enum(CHECKIN_STATUSES),
  checkedInAt: isoDateTimeSchema,
  checkedOutAt: isoDateTimeSchema.nullable(),
  pickupName: z.string().nullable(),
  /** Whether a coordinator checked the child out without the code. */
  overridden: z.boolean(),
  labelPrintedAt: isoDateTimeSchema.nullable(),
  alerts: z.array(childAlertSchema),
});
export type Checkin = z.infer<typeof checkinSchema>;

export const checkInBodySchema = z.object({
  children: z
    .array(z.object({ personId: idSchema, classId: idSchema.nullable().default(null) }))
    .min(1)
    .max(CHECKIN_LIMITS.childrenPerCheckInMax)
    .refine((items) => new Set(items.map((item) => item.personId)).size === items.length, {
      message: 'Each child can be checked in once',
    }),
  guardianPersonId: idSchema.nullable().default(null),
  method: z.enum(CHECKIN_METHODS).default('staff'),
});
export type CheckInBody = z.infer<typeof checkInBodySchema>;

export const checkInResultSchema = z.object({ items: z.array(checkinSchema) });
export type CheckInResult = z.infer<typeof checkInResultSchema>;

export const checkinListQuerySchema = paginationQuerySchema.extend({
  classId: idSchema.optional(),
  status: z.enum(CHECKIN_STATUSES).optional(),
});
export type CheckinListQuery = z.infer<typeof checkinListQuerySchema>;
export const checkinListSchema = paginatedSchema(checkinSchema);

/** One check-in with the people allowed to collect the child, for the check-out dialog. */
export const checkinDetailSchema = z.object({
  checkin: checkinSchema,
  session: z.object({ id: idSchema, name: z.string(), date: isoDateSchema }),
  guardians: z.array(personSummarySchema),
  pickups: z.array(authorizedPickupSchema),
  canOverride: z.boolean(),
});
export type CheckinDetail = z.infer<typeof checkinDetailSchema>;

/**
 * Who collects the child: a person (a guardian or someone on the pick-up list), an entry of the
 * pick-up list by id (for people without a person record), or, only for a child with nobody on
 * record and for overrides, a typed name.
 */
const pickupChoiceShape = {
  pickupPersonId: idSchema.nullable().default(null),
  pickupId: idSchema.nullable().default(null),
  pickupName: optionalText(LIMITS.nameMax),
};

export const checkOutBodySchema = z.object({
  securityCode: securityCodeSchema,
  ...pickupChoiceShape,
});
export type CheckOutBody = z.infer<typeof checkOutBodySchema>;

export const overrideCheckOutBodySchema = z.object({
  reason: requiredText(5, LIMITS.shortTextMax),
  ...pickupChoiceShape,
});
export type OverrideCheckOutBody = z.infer<typeof overrideCheckOutBodySchema>;

export const checkinResponseSchema = z.object({ checkin: checkinSchema });

export const labelsBodySchema = z.object({
  ids: z.array(idSchema).min(1).max(CHECKIN_LIMITS.labelsMax),
});
export type LabelsBody = z.infer<typeof labelsBodySchema>;

/** A child label and its guardian tag share the security code. */
export const checkinLabelSchema = checkinSchema.extend({
  sessionName: z.string(),
  sessionDate: isoDateSchema,
  birthDate: isoDateSchema.nullable(),
});
export type CheckinLabel = z.infer<typeof checkinLabelSchema>;
export const checkinLabelListSchema = z.object({ items: z.array(checkinLabelSchema) });

export const classRosterSchema = z.object({
  class: checkinClassSchema,
  session: checkinSessionSchema,
  checkins: z.array(checkinSchema),
  presentCount: z.number().int().nonnegative(),
  teacherCount: z.number().int().nonnegative(),
  ratioExceeded: z.boolean(),
});
export type ClassRoster = z.infer<typeof classRosterSchema>;

/** The "my children currently checked in" card. */
export const myCheckedInChildrenSchema = z.object({ items: z.array(checkinSchema) });

/** Everything a guardian's phone needs: their family, open sessions and who is in class. */
export const checkinMeSchema = z.object({
  household: checkinHouseholdSchema.nullable(),
  isGuardian: z.boolean(),
  allowSelfCheckIn: z.boolean(),
  openSessions: z.array(checkinSessionSchema),
  current: z.array(checkinSchema),
});
export type CheckinMe = z.infer<typeof checkinMeSchema>;

export const childAttendanceQuerySchema = paginationQuerySchema.omit({ q: true });

export const childAttendanceSchema = z.object({
  items: z.array(
    z.object({
      id: idSchema,
      sessionId: idSchema,
      sessionName: z.string(),
      date: isoDateSchema,
      className: z.string(),
      checkedInAt: isoDateTimeSchema,
      checkedOutAt: isoDateTimeSchema.nullable(),
      pickupName: z.string().nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type ChildAttendance = z.infer<typeof childAttendanceSchema>;

/** The module home for volunteers and coordinators. */
export const checkinOverviewSchema = z.object({
  openSessions: z.array(checkinSessionDetailSchema),
  recentSessions: z.array(checkinSessionSchema),
  stats: z.object({
    activeClasses: z.number().int().nonnegative(),
    teachers: z.number().int().nonnegative(),
    childrenWithAlerts: z.number().int().nonnegative(),
    checkinsLast30Days: z.number().int().nonnegative(),
    childrenLast30Days: z.number().int().nonnegative(),
  }),
  /** Children per session, oldest first, for the trend line. */
  trend: z.array(z.object({ date: isoDateSchema, name: z.string(), count: z.number().int() })),
});
export type CheckinOverview = z.infer<typeof checkinOverviewSchema>;
