// Zod schemas, enums and labels owned by the checkin module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { LIMITS } from '../constants';
import type { LocalizedText } from '../localized';
import { has, type AccessLike } from '../permissions';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  optionalHexColor,
  optionalText,
  requiredText,
} from './common';
import { personSummarySchema } from './person';

/** Characters people read aloud: no 0/O, 1/I/L. Matches the API's `UNAMBIGUOUS_ALPHABET`. */
export const SECURITY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const CHECKIN_LIMITS = {
  securityCodeLength: 4,
  childrenPerCheckInMax: 12,
  pickupsPerChildMax: 10,
  alertDescriptionMax: 500,
  /** Wrong check-out codes allowed per session and station before a cool-down. */
  checkoutAttemptsMax: 10,
  checkoutWindowMinutes: 15,
  kioskQueryMin: 2,
} as const;

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

/** Teachers see more than the roster ratio; only managers may check out without the code. */
export const canOverrideCheckout = (access: Pick<AccessLike, 'permissions'>) =>
  has(access, 'checkin.manage');

/** Children per teacher above the class limit. */
export const isRatioExceeded = (
  children: number,
  teachers: number,
  maxChildrenPerTeacher: number | null,
): boolean =>
  maxChildrenPerTeacher !== null &&
  children > 0 &&
  (teachers === 0 || children / teachers > maxChildrenPerTeacher);

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

export const checkinClassListSchema = z.object({ items: z.array(checkinClassSchema) });

export const setClassTeachersBodySchema = z.object({
  teachers: z.array(z.object({ personId: idSchema, isLead: z.boolean().default(false) })).max(50),
});
export type SetClassTeachersBody = z.infer<typeof setClassTeachersBodySchema>;

export const checkinSessionSchema = z.object({
  id: idSchema,
  name: z.string(),
  date: isoDateSchema,
  worshipServiceId: idSchema.nullable(),
  status: z.enum(CHECKIN_SESSION_STATUSES),
  openedAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.nullable(),
  checkedInCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
});
export type CheckinSession = z.infer<typeof checkinSessionSchema>;

export const checkinSessionInputSchema = z.object({
  name: requiredText(2, LIMITS.nameMax),
  date: isoDateSchema,
  worshipServiceId: idSchema.nullable().default(null),
});
export type CheckinSessionInput = z.infer<typeof checkinSessionInputSchema>;

export const checkinSessionListSchema = z.object({ items: z.array(checkinSessionSchema) });

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
  guardians: z.array(personSummarySchema),
  children: z.array(checkinChildSchema),
});
export type CheckinHousehold = z.infer<typeof checkinHouseholdSchema>;

export const kioskSearchQuerySchema = z
  .object({
    /** Family name, or the last four digits of a phone number. */
    q: z.string().trim().min(CHECKIN_LIMITS.kioskQueryMin).max(LIMITS.nameMax),
  })
  .transform((value) => ({
    ...value,
    phoneLast4: /^\d{4}$/.test(value.q) ? value.q : null,
  }));
export type KioskSearchQuery = z.infer<typeof kioskSearchQuerySchema>;

export const checkinHouseholdListSchema = z.object({ items: z.array(checkinHouseholdSchema) });

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
  alerts: z.array(childAlertSchema),
});
export type Checkin = z.infer<typeof checkinSchema>;

export const checkInBodySchema = z.object({
  children: z
    .array(z.object({ personId: idSchema, classId: idSchema.nullable().default(null) }))
    .min(1)
    .max(CHECKIN_LIMITS.childrenPerCheckInMax),
  guardianPersonId: idSchema.nullable().default(null),
  method: z.enum(CHECKIN_METHODS).default('staff'),
});
export type CheckInBody = z.infer<typeof checkInBodySchema>;

export const checkInResultSchema = z.object({ items: z.array(checkinSchema) });
export type CheckInResult = z.infer<typeof checkInResultSchema>;

export const checkOutBodySchema = z.object({
  securityCode: securityCodeSchema,
  pickupPersonId: idSchema.nullable().default(null),
  pickupName: optionalText(LIMITS.nameMax),
});
export type CheckOutBody = z.infer<typeof checkOutBodySchema>;

export const overrideCheckOutBodySchema = z.object({
  reason: requiredText(5, LIMITS.shortTextMax),
  pickupPersonId: idSchema.nullable().default(null),
  pickupName: optionalText(LIMITS.nameMax),
});
export type OverrideCheckOutBody = z.infer<typeof overrideCheckOutBodySchema>;

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

export const childAttendanceSchema = z.object({
  items: z.array(
    z.object({
      sessionId: idSchema,
      sessionName: z.string(),
      date: isoDateSchema,
      className: z.string(),
      checkedInAt: isoDateTimeSchema,
      checkedOutAt: isoDateTimeSchema.nullable(),
    }),
  ),
});
export type ChildAttendance = z.infer<typeof childAttendanceSchema>;
