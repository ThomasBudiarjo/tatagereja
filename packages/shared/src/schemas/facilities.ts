// Zod schemas, enums and labels owned by the facilities module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { LIMITS } from '../constants';
import type { LocalizedText } from '../localized';
import { has, type AccessLike } from '../permissions';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  moneySchema,
  optionalDate,
  optionalHexColor,
  optionalText,
  optionalUrl,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
} from './common';
import { personSummarySchema } from './person';

export const FACILITIES_LIMITS = {
  featuresMax: 30,
  /** Longest weekly recurrence, about two years. */
  recurrenceWeeksMax: 104,
  bookingHoursMax: 24 * 7,
  capacityMax: 100_000,
  assetCodePrefix: 'INV',
} as const;

export const RESOURCE_KINDS = [
  'sanctuary',
  'hall',
  'classroom',
  'room',
  'vehicle',
  'equipment',
  'other',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_KIND_LABELS: Record<ResourceKind, LocalizedText> = {
  sanctuary: { en: 'Sanctuary', id: 'Ruang ibadah' },
  hall: { en: 'Hall', id: 'Aula' },
  classroom: { en: 'Classroom', id: 'Ruang kelas' },
  room: { en: 'Room', id: 'Ruangan' },
  vehicle: { en: 'Vehicle', id: 'Kendaraan' },
  equipment: { en: 'Equipment', id: 'Peralatan' },
  other: { en: 'Other', id: 'Lainnya' },
};

export const BOOKING_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, LocalizedText> = {
  pending: { en: 'Waiting for approval', id: 'Menunggu persetujuan' },
  approved: { en: 'Approved', id: 'Disetujui' },
  rejected: { en: 'Rejected', id: 'Ditolak' },
  cancelled: { en: 'Cancelled', id: 'Dibatalkan' },
};

export const BOOKING_RECURRENCES = ['none', 'weekly'] as const;
export type BookingRecurrence = (typeof BOOKING_RECURRENCES)[number];

export const ASSET_CONDITIONS = ['new', 'good', 'fair', 'poor', 'broken'] as const;
export type AssetCondition = (typeof ASSET_CONDITIONS)[number];

export const ASSET_CONDITION_LABELS: Record<AssetCondition, LocalizedText> = {
  new: { en: 'New', id: 'Baru' },
  good: { en: 'Good', id: 'Baik' },
  fair: { en: 'Fair', id: 'Cukup' },
  poor: { en: 'Poor', id: 'Kurang baik' },
  broken: { en: 'Broken', id: 'Rusak' },
};

export const ASSET_STATUSES = ['available', 'on_loan', 'maintenance', 'retired', 'lost'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_STATUS_LABELS: Record<AssetStatus, LocalizedText> = {
  available: { en: 'Available', id: 'Tersedia' },
  on_loan: { en: 'On loan', id: 'Dipinjam' },
  maintenance: { en: 'In maintenance', id: 'Dalam perbaikan' },
  retired: { en: 'Retired', id: 'Dihapuskan' },
  lost: { en: 'Lost', id: 'Hilang' },
};

export const MAINTENANCE_KINDS = ['inspection', 'repair', 'service', 'cleaning', 'other'] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

export const MAINTENANCE_KIND_LABELS: Record<MaintenanceKind, LocalizedText> = {
  inspection: { en: 'Inspection', id: 'Pemeriksaan' },
  repair: { en: 'Repair', id: 'Perbaikan' },
  service: { en: 'Service', id: 'Servis' },
  cleaning: { en: 'Cleaning', id: 'Pembersihan' },
  other: { en: 'Other', id: 'Lainnya' },
};

// ---------------------------------------------------------------------------------------------
// Helpers and access rules
// ---------------------------------------------------------------------------------------------

/** "INV-0042". */
export const formatAssetCode = (
  sequence: number,
  prefix: string = FACILITIES_LIMITS.assetCodePrefix,
) => `${prefix}-${String(sequence).padStart(4, '0')}`;

export const rangesOverlap = (
  a: { startsAt: string; endsAt: string },
  b: { startsAt: string; endsAt: string },
): boolean =>
  new Date(a.startsAt).getTime() < new Date(b.endsAt).getTime() &&
  new Date(b.startsAt).getTime() < new Date(a.endsAt).getTime();

const WEEK_MS = 7 * 86_400_000;

/**
 * The occurrences of a booking that intersect `[from, to)`. Weekly bookings repeat every seven
 * days until `recurrenceUntil` (inclusive, compared on the UTC date of each start), skipping
 * `skipDates` (YYYY-MM-DD of the occurrence start). Indonesian time zones have no DST, so a
 * fixed seven-day step keeps the local time.
 */
export const bookingOccurrences = (
  booking: {
    startsAt: string;
    endsAt: string;
    recurrence: BookingRecurrence;
    recurrenceUntil: string | null;
  },
  from: string,
  to: string,
  skipDates: readonly string[] = [],
): { startsAt: string; endsAt: string }[] => {
  const start = new Date(booking.startsAt).getTime();
  const duration = new Date(booking.endsAt).getTime() - start;
  const rangeStart = new Date(from).getTime();
  const rangeEnd = new Date(to).getTime();
  const occurrences: { startsAt: string; endsAt: string }[] = [];
  const maxCount = booking.recurrence === 'weekly' ? FACILITIES_LIMITS.recurrenceWeeksMax + 1 : 1;
  for (let index = 0; index < maxCount; index += 1) {
    const occurrenceStart = start + index * WEEK_MS;
    const startsAt = new Date(occurrenceStart).toISOString();
    if (
      index > 0 &&
      (!booking.recurrenceUntil || startsAt.slice(0, 10) > booking.recurrenceUntil)
    ) {
      break;
    }
    if (occurrenceStart >= rangeEnd) break;
    if (occurrenceStart + duration > rangeStart && !skipDates.includes(startsAt.slice(0, 10))) {
      occurrences.push({ startsAt, endsAt: new Date(occurrenceStart + duration).toISOString() });
    }
  }
  return occurrences;
};

/** Managers approve bookings, and their own bookings are approved at once. */
export const canDecideBooking = (access: Pick<AccessLike, 'permissions'>) =>
  has(access, 'facilities.manage');

/** Requesters may cancel their own booking; managers may cancel any. */
export const canCancelBooking = (access: AccessLike, booking: { requestedBy: string | null }) =>
  has(access, 'facilities.manage') ||
  (has(access, 'facilities.book') && booking.requestedBy === access.userId);

// ---------------------------------------------------------------------------------------------
// Resources and bookings
// ---------------------------------------------------------------------------------------------

export const facilityResourceSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: z.enum(RESOURCE_KINDS),
  description: z.string().nullable(),
  location: z.string().nullable(),
  capacity: z.number().int().nullable(),
  features: z.array(z.string()),
  photoUrl: z.string().nullable(),
  color: z.string().nullable(),
  requiresApproval: z.boolean(),
  isActive: z.boolean(),
  /** Whether no approved booking covers the current time. */
  availableNow: z.boolean(),
});
export type FacilityResource = z.infer<typeof facilityResourceSchema>;

export const facilityResourceInputSchema = z.object({
  name: requiredText(2, LIMITS.nameMax),
  kind: z.enum(RESOURCE_KINDS).default('room'),
  description: optionalText(LIMITS.longTextMax),
  location: optionalText(LIMITS.shortTextMax),
  capacity: z.number().int().min(1).max(FACILITIES_LIMITS.capacityMax).nullable().default(null),
  features: z.array(requiredText(1, 60)).max(FACILITIES_LIMITS.featuresMax).default([]),
  photoUrl: optionalUrl,
  color: optionalHexColor,
  requiresApproval: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export type FacilityResourceInput = z.infer<typeof facilityResourceInputSchema>;

export const facilityResourceListSchema = z.object({ items: z.array(facilityResourceSchema) });

export const facilityBookingSchema = z.object({
  id: idSchema,
  resourceId: idSchema,
  resourceName: z.string(),
  title: z.string(),
  purpose: z.string().nullable(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  recurrence: z.enum(BOOKING_RECURRENCES),
  recurrenceUntil: isoDateSchema.nullable(),
  skippedDates: z.array(isoDateSchema),
  status: z.enum(BOOKING_STATUSES),
  expectedAttendees: z.number().int().nullable(),
  groupId: idSchema.nullable(),
  eventId: idSchema.nullable(),
  requestedBy: idSchema.nullable(),
  requesterName: z.string().nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  decisionNote: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type FacilityBooking = z.infer<typeof facilityBookingSchema>;

export const facilityBookingInputSchema = z
  .object({
    resourceId: idSchema,
    title: requiredText(2, LIMITS.nameMax),
    purpose: optionalText(LIMITS.shortTextMax),
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    recurrence: z.enum(BOOKING_RECURRENCES).default('none'),
    recurrenceUntil: optionalDate,
    expectedAttendees: z
      .number()
      .int()
      .min(1)
      .max(FACILITIES_LIMITS.capacityMax)
      .nullable()
      .default(null),
    groupId: idSchema.nullable().default(null),
    eventId: idSchema.nullable().default(null),
    notes: optionalText(LIMITS.longTextMax),
  })
  .refine((value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(), {
    message: 'End time must be after the start time',
    path: ['endsAt'],
  })
  .refine(
    (value) =>
      new Date(value.endsAt).getTime() - new Date(value.startsAt).getTime() <=
      FACILITIES_LIMITS.bookingHoursMax * 3_600_000,
    { message: 'A booking can last at most one week', path: ['endsAt'] },
  )
  .refine(
    (value) =>
      value.recurrence === 'none' ||
      (!!value.recurrenceUntil && value.recurrenceUntil >= value.startsAt.slice(0, 10)),
    { message: 'Choose when the weekly booking ends', path: ['recurrenceUntil'] },
  );
export type FacilityBookingInput = z.infer<typeof facilityBookingInputSchema>;

export const decideBookingBodySchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: optionalText(LIMITS.shortTextMax),
});
export type DecideBookingBody = z.infer<typeof decideBookingBodySchema>;

/** Cancels the whole booking, or one occurrence of a weekly one. */
export const cancelBookingBodySchema = z.object({
  occurrenceDate: optionalDate,
  reason: optionalText(LIMITS.shortTextMax),
});
export type CancelBookingBody = z.infer<typeof cancelBookingBodySchema>;

export const facilityBookingListQuerySchema = z.object({
  resourceId: idSchema.optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  mine: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type FacilityBookingListQuery = z.infer<typeof facilityBookingListQuerySchema>;

export const facilityBookingListSchema = z.object({ items: z.array(facilityBookingSchema) });

/** Answer of 409 SCHEDULING_CONFLICT for bookings: what overlaps, in plain terms. */
export const bookingConflictSchema = z.object({
  bookingId: idSchema,
  title: z.string(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  requesterName: z.string().nullable(),
});
export type BookingConflict = z.infer<typeof bookingConflictSchema>;

export const bookingOccurrenceSchema = z.object({
  bookingId: idSchema,
  resourceId: idSchema,
  title: z.string(),
  status: z.enum(BOOKING_STATUSES),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
});
export type BookingOccurrence = z.infer<typeof bookingOccurrenceSchema>;

export const resourceTimelineSchema = z.object({
  resource: facilityResourceSchema,
  occurrences: z.array(bookingOccurrenceSchema),
});
export type ResourceTimeline = z.infer<typeof resourceTimelineSchema>;

// ---------------------------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------------------------

export const inventoryAssetSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  description: z.string().nullable(),
  resourceId: idSchema.nullable(),
  location: z.string().nullable(),
  condition: z.enum(ASSET_CONDITIONS),
  status: z.enum(ASSET_STATUSES),
  acquisitionDate: isoDateSchema.nullable(),
  acquisitionValue: moneySchema.nullable(),
  custodian: personSummarySchema.nullable(),
  serialNumber: z.string().nullable(),
  photoUrl: z.string().nullable(),
  notes: z.string().nullable(),
  currentLoanId: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type InventoryAsset = z.infer<typeof inventoryAssetSchema>;

export const inventoryAssetInputSchema = z.object({
  name: requiredText(2, LIMITS.nameMax),
  category: optionalText(60),
  description: optionalText(LIMITS.longTextMax),
  resourceId: idSchema.nullable().default(null),
  location: optionalText(LIMITS.shortTextMax),
  condition: z.enum(ASSET_CONDITIONS).default('good'),
  status: z.enum(['available', 'maintenance', 'retired', 'lost']).default('available'),
  acquisitionDate: optionalDate,
  acquisitionValue: moneySchema.nullable().default(null),
  custodianPersonId: idSchema.nullable().default(null),
  serialNumber: optionalText(60),
  photoUrl: optionalUrl,
  notes: optionalText(LIMITS.longTextMax),
});
export type InventoryAssetInput = z.infer<typeof inventoryAssetInputSchema>;

export const inventoryAssetListQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().max(60).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  condition: z.enum(ASSET_CONDITIONS).optional(),
  resourceId: idSchema.optional(),
});
export type InventoryAssetListQuery = z.infer<typeof inventoryAssetListQuerySchema>;

export const inventoryAssetListSchema = paginatedSchema(inventoryAssetSchema);

export const assetLoanSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  assetName: z.string(),
  assetCode: z.string(),
  borrower: personSummarySchema.nullable(),
  borrowerName: z.string(),
  groupId: idSchema.nullable(),
  checkedOutAt: isoDateTimeSchema,
  dueDate: isoDateSchema.nullable(),
  returnedAt: isoDateTimeSchema.nullable(),
  conditionOut: z.enum(ASSET_CONDITIONS).nullable(),
  conditionIn: z.enum(ASSET_CONDITIONS).nullable(),
  notes: z.string().nullable(),
  isOverdue: z.boolean(),
});
export type AssetLoan = z.infer<typeof assetLoanSchema>;

export const checkOutAssetBodySchema = z
  .object({
    borrowerPersonId: idSchema.nullable().default(null),
    borrowerName: optionalText(LIMITS.nameMax),
    groupId: idSchema.nullable().default(null),
    dueDate: optionalDate,
    conditionOut: z.enum(ASSET_CONDITIONS).nullable().default(null),
    notes: optionalText(LIMITS.shortTextMax),
  })
  .refine((value) => value.borrowerPersonId || value.borrowerName, {
    message: 'Choose who borrows it',
    path: ['borrowerPersonId'],
  });
export type CheckOutAssetBody = z.infer<typeof checkOutAssetBodySchema>;

export const returnAssetBodySchema = z.object({
  conditionIn: z.enum(ASSET_CONDITIONS),
  notes: optionalText(LIMITS.shortTextMax),
});
export type ReturnAssetBody = z.infer<typeof returnAssetBodySchema>;

export const assetLoanListQuerySchema = z.object({
  assetId: idSchema.optional(),
  scope: z.enum(['open', 'overdue', 'all']).default('open'),
});
export type AssetLoanListQuery = z.infer<typeof assetLoanListQuerySchema>;

export const assetLoanListSchema = z.object({ items: z.array(assetLoanSchema) });

export const assetMaintenanceSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  date: isoDateSchema,
  kind: z.enum(MAINTENANCE_KINDS),
  description: z.string(),
  cost: moneySchema.nullable(),
  performedBy: z.string().nullable(),
  nextDueDate: isoDateSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type AssetMaintenance = z.infer<typeof assetMaintenanceSchema>;

export const assetMaintenanceInputSchema = z.object({
  date: isoDateSchema,
  kind: z.enum(MAINTENANCE_KINDS).default('service'),
  description: requiredText(2, LIMITS.longTextMax),
  cost: moneySchema.nullable().default(null),
  performedBy: optionalText(LIMITS.nameMax),
  nextDueDate: optionalDate,
});
export type AssetMaintenanceInput = z.infer<typeof assetMaintenanceInputSchema>;
