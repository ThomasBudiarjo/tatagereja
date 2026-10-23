// Zod schemas, enums and labels owned by the facilities module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { LIMITS } from '../constants';
import type { LocalizedText } from '../localized';
import { has, hasAny, type AccessLike } from '../permissions';
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

/** The UTC date of an occurrence start: the key of a skipped occurrence of a weekly booking. */
export const occurrenceDateOf = (startsAt: string) => new Date(startsAt).toISOString().slice(0, 10);

/** The last day a weekly booking may repeat on (about two years after its first day). */
export const latestRecurrenceUntil = (startsAt: string) =>
  new Date(new Date(startsAt).getTime() + FACILITIES_LIMITS.recurrenceWeeksMax * WEEK_MS)
    .toISOString()
    .slice(0, 10);

/** Whether an open loan is past its due date; `today` is `YYYY-MM-DD` in the church time zone. */
export const isLoanOverdue = (
  loan: { dueDate: string | null; returnedAt: string | null },
  today: string,
): boolean => !loan.returnedAt && !!loan.dueDate && loan.dueDate < today;

/** Rooms, resources and their schedule. */
export const canViewFacilities = (access: Pick<AccessLike, 'permissions'>) =>
  hasAny(access, ['facilities.view', 'facilities.book', 'facilities.manage']);

export const canRequestBooking = (access: Pick<AccessLike, 'permissions'>) =>
  hasAny(access, ['facilities.book', 'facilities.manage']);

export const canManageFacilities = (access: Pick<AccessLike, 'permissions'>) =>
  has(access, 'facilities.manage');

export const canViewInventory = (access: Pick<AccessLike, 'permissions'>) =>
  hasAny(access, ['inventory.view', 'inventory.manage']);

export const canManageInventory = (access: Pick<AccessLike, 'permissions'>) =>
  has(access, 'inventory.manage');

/** Managers approve bookings, and their own bookings are approved at once. */
export const canDecideBooking = (access: Pick<AccessLike, 'permissions'>) =>
  has(access, 'facilities.manage');

/** Requesters may cancel their own booking; managers may cancel any. */
export const canCancelBooking = (
  access: Pick<AccessLike, 'permissions' | 'userId'>,
  booking: { requestedBy: string | null },
) =>
  has(access, 'facilities.manage') ||
  (has(access, 'facilities.book') && booking.requestedBy === access.userId);

/**
 * Requesters may change their own booking while it is still to come; managers may change any.
 * A requester's change goes back for approval when the resource needs it.
 */
export const canEditBooking = (
  access: Pick<AccessLike, 'permissions' | 'userId'>,
  booking: { requestedBy: string | null; status: BookingStatus },
) =>
  (booking.status === 'pending' || booking.status === 'approved') &&
  canCancelBooking(access, booking);

/** Notes and decision notes are for the requester and the managers only. */
export const canSeeBookingNotes = (
  access: Pick<AccessLike, 'permissions' | 'userId'>,
  booking: { requestedBy: string | null },
) => has(access, 'facilities.manage') || booking.requestedBy === access.userId;

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
  /** The approved booking happening now, if any. */
  currentBooking: z
    .object({ bookingId: idSchema, title: z.string(), endsAt: isoDateTimeSchema })
    .nullable(),
  /** The next approved occurrence starting after now, if any. */
  nextBooking: z
    .object({ bookingId: idSchema, title: z.string(), startsAt: isoDateTimeSchema })
    .nullable(),
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

const booleanQuery = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const facilityResourceListQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  kind: z.enum(RESOURCE_KINDS).optional(),
  /** Inactive resources are listed for managers only. */
  includeInactive: booleanQuery,
});
export type FacilityResourceListQuery = z.infer<typeof facilityResourceListQuerySchema>;

export const facilityResourceListSchema = z.object({ items: z.array(facilityResourceSchema) });

export const facilityResourceResponseSchema = z.object({ resource: facilityResourceSchema });

export const facilityBookingSchema = z.object({
  id: idSchema,
  resourceId: idSchema,
  resourceName: z.string(),
  resourceColor: z.string().nullable(),
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
  groupName: z.string().nullable(),
  eventId: idSchema.nullable(),
  requestedBy: idSchema.nullable(),
  requesterName: z.string().nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  deciderName: z.string().nullable(),
  decisionNote: z.string().nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
  /** Visible to the requester and managers only; null for everyone else. */
  notes: z.string().nullable(),
  /** The next occurrence that has not ended yet, or null when the booking is over. */
  nextOccurrence: z.object({ startsAt: isoDateTimeSchema, endsAt: isoDateTimeSchema }).nullable(),
  createdAt: isoDateTimeSchema,
});
export type FacilityBooking = z.infer<typeof facilityBookingSchema>;

type BookingTimes = {
  startsAt: string;
  endsAt: string;
  recurrence: BookingRecurrence;
  recurrenceUntil: string | null;
};

/** Time rules shared by the booking form, the availability check and the API. */
const checkBookingTimes = (value: BookingTimes, context: z.RefinementCtx) => {
  const start = new Date(value.startsAt).getTime();
  const end = new Date(value.endsAt).getTime();
  if (end <= start) {
    context.addIssue({
      code: 'custom',
      message: 'End time must be after the start time',
      path: ['endsAt'],
    });
  } else if (end - start > FACILITIES_LIMITS.bookingHoursMax * 3_600_000) {
    context.addIssue({
      code: 'custom',
      message: 'A booking can last at most one week',
      path: ['endsAt'],
    });
  }
  if (value.recurrence === 'weekly') {
    if (!value.recurrenceUntil || value.recurrenceUntil < value.startsAt.slice(0, 10)) {
      context.addIssue({
        code: 'custom',
        message: 'Choose when the weekly booking ends',
        path: ['recurrenceUntil'],
      });
    } else if (value.recurrenceUntil > latestRecurrenceUntil(value.startsAt)) {
      context.addIssue({
        code: 'custom',
        message: 'A weekly booking can repeat for at most two years',
        path: ['recurrenceUntil'],
      });
    }
  }
};

const facilityBookingFieldsSchema = z.object({
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
});

export const facilityBookingInputSchema =
  facilityBookingFieldsSchema.superRefine(checkBookingTimes);
export type FacilityBookingInput = z.infer<typeof facilityBookingInputSchema>;

/** Body of the availability check: the times to test, ignoring the booking being edited. */
export const bookingAvailabilityBodySchema = z
  .object({
    resourceId: idSchema,
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    recurrence: z.enum(BOOKING_RECURRENCES).default('none'),
    recurrenceUntil: optionalDate,
    excludeBookingId: idSchema.nullable().default(null),
  })
  .superRefine(checkBookingTimes);
export type BookingAvailabilityBody = z.infer<typeof bookingAvailabilityBodySchema>;

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

export const BOOKING_LIST_SCOPES = ['upcoming', 'past', 'all'] as const;
export type BookingListScope = (typeof BOOKING_LIST_SCOPES)[number];

export const facilityBookingListQuerySchema = paginationQuerySchema.extend({
  resourceId: idSchema.optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  /** `upcoming`: some occurrence has not ended; `past`: every occurrence has ended. */
  scope: z.enum(BOOKING_LIST_SCOPES).default('upcoming'),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  mine: booleanQuery,
});
export type FacilityBookingListQuery = z.infer<typeof facilityBookingListQuerySchema>;

export const facilityBookingListSchema = paginatedSchema(facilityBookingSchema);

/** What overlaps a requested time, in plain terms (also the `conflicts` of a 409). */
export const bookingConflictSchema = z.object({
  bookingId: idSchema,
  title: z.string(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  requesterName: z.string().nullable(),
});
export type BookingConflict = z.infer<typeof bookingConflictSchema>;

export const bookingAvailabilitySchema = z.object({
  available: z.boolean(),
  /** Approved bookings that overlap (at most `conflictsMax`). */
  conflicts: z.array(bookingConflictSchema),
  /** Pending requests for the same time: not blocking, but a manager will choose. */
  pendingOverlaps: z.number().int().nonnegative(),
  occurrenceCount: z.number().int().nonnegative(),
  /** Whether the request would be approved at once for the caller. */
  autoApproved: z.boolean(),
});
export type BookingAvailability = z.infer<typeof bookingAvailabilitySchema>;

export const facilityBookingDetailSchema = z.object({
  booking: facilityBookingSchema,
  /** For pending bookings: approved bookings that now overlap (approving would fail). */
  conflicts: z.array(bookingConflictSchema),
  /** Upcoming occurrences (weekly bookings), at most 26. */
  occurrences: z.array(z.object({ startsAt: isoDateTimeSchema, endsAt: isoDateTimeSchema })),
});
export type FacilityBookingDetail = z.infer<typeof facilityBookingDetailSchema>;

export const facilityBookingResponseSchema = z.object({ booking: facilityBookingSchema });

export const bookingOccurrenceSchema = z.object({
  bookingId: idSchema,
  resourceId: idSchema,
  title: z.string(),
  status: z.enum(BOOKING_STATUSES),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  recurrence: z.enum(BOOKING_RECURRENCES),
  requestedBy: idSchema.nullable(),
  requesterName: z.string().nullable(),
  groupName: z.string().nullable(),
});
export type BookingOccurrence = z.infer<typeof bookingOccurrenceSchema>;

export const resourceTimelineSchema = z.object({
  resource: facilityResourceSchema,
  occurrences: z.array(bookingOccurrenceSchema),
});
export type ResourceTimeline = z.infer<typeof resourceTimelineSchema>;

/** Longest window a schedule request may cover. */
export const SCHEDULE_DAYS_MAX = 42;

export const facilityScheduleQuerySchema = z
  .object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    resourceId: idSchema.optional(),
    /** Pending requests are shown to managers and to their requesters. */
    includePending: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  })
  .refine((value) => new Date(value.to).getTime() > new Date(value.from).getTime(), {
    message: 'The end must be after the start',
    path: ['to'],
  })
  .refine(
    (value) =>
      new Date(value.to).getTime() - new Date(value.from).getTime() <=
      SCHEDULE_DAYS_MAX * 86_400_000,
    { message: `A schedule covers at most ${SCHEDULE_DAYS_MAX} days`, path: ['to'] },
  );
export type FacilityScheduleQuery = z.infer<typeof facilityScheduleQuerySchema>;

export const facilityScheduleSchema = z.object({ items: z.array(resourceTimelineSchema) });
export type FacilitySchedule = z.infer<typeof facilityScheduleSchema>;

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
  resourceName: z.string().nullable(),
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
  /** Borrower and due date of the open loan, for list rows. */
  currentLoan: z
    .object({ borrowerName: z.string(), dueDate: isoDateSchema.nullable(), isOverdue: z.boolean() })
    .nullable(),
  /** Earliest `nextDueDate` of the maintenance log, if any. */
  nextMaintenanceDate: isoDateSchema.nullable(),
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
  /** `on_loan` is set by checking the asset out, never directly. */
  status: z.enum(['available', 'maintenance', 'retired', 'lost']).default('available'),
  acquisitionDate: optionalDate,
  acquisitionValue: moneySchema.nullable().default(null),
  custodianPersonId: idSchema.nullable().default(null),
  serialNumber: optionalText(60),
  photoUrl: optionalUrl,
  notes: optionalText(LIMITS.longTextMax),
});
export type InventoryAssetInput = z.infer<typeof inventoryAssetInputSchema>;

export const ASSET_SORTS = ['code', 'name', '-value', '-acquired', '-updated'] as const;
export type AssetSort = (typeof ASSET_SORTS)[number];

export const inventoryAssetListQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().max(60).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  condition: z.enum(ASSET_CONDITIONS).optional(),
  resourceId: idSchema.optional(),
  custodianPersonId: idSchema.optional(),
  sort: z.enum(ASSET_SORTS).default('code'),
});
export type InventoryAssetListQuery = z.infer<typeof inventoryAssetListQuerySchema>;

export const inventoryAssetListSchema = paginatedSchema(inventoryAssetSchema).extend({
  /** Sum of `acquisitionValue` over every matching asset (not just this page). */
  totalValue: z.number().int().nonnegative(),
});

export const inventoryAssetResponseSchema = z.object({ asset: inventoryAssetSchema });

export const assetCategoryListSchema = z.object({
  items: z.array(z.object({ category: z.string(), count: z.number().int().nonnegative() })),
});

export const assetLoanSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  assetName: z.string(),
  assetCode: z.string(),
  borrower: personSummarySchema.nullable(),
  borrowerName: z.string(),
  groupId: idSchema.nullable(),
  groupName: z.string().nullable(),
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

export const assetLoanListQuerySchema = paginationQuerySchema.extend({
  assetId: idSchema.optional(),
  scope: z.enum(['open', 'overdue', 'returned', 'all']).default('open'),
});
export type AssetLoanListQuery = z.infer<typeof assetLoanListQuerySchema>;

export const assetLoanListSchema = paginatedSchema(assetLoanSchema);

export const assetLoanResponseSchema = z.object({ loan: assetLoanSchema });

export const assetMaintenanceSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  date: isoDateSchema,
  kind: z.enum(MAINTENANCE_KINDS),
  description: z.string(),
  cost: moneySchema.nullable(),
  performedBy: z.string().nullable(),
  nextDueDate: isoDateSchema.nullable(),
  createdByName: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type AssetMaintenance = z.infer<typeof assetMaintenanceSchema>;

export const assetMaintenanceInputSchema = z
  .object({
    date: isoDateSchema,
    kind: z.enum(MAINTENANCE_KINDS).default('service'),
    description: requiredText(2, LIMITS.longTextMax),
    cost: moneySchema.nullable().default(null),
    performedBy: optionalText(LIMITS.nameMax),
    nextDueDate: optionalDate,
  })
  .refine((value) => !value.nextDueDate || value.nextDueDate >= value.date, {
    message: 'The next service date must be after this one',
    path: ['nextDueDate'],
  });
export type AssetMaintenanceInput = z.infer<typeof assetMaintenanceInputSchema>;

export const assetMaintenanceResponseSchema = z.object({ maintenance: assetMaintenanceSchema });

export const inventoryAssetDetailSchema = z.object({
  asset: inventoryAssetSchema,
  loans: z.array(assetLoanSchema),
  maintenance: z.array(assetMaintenanceSchema),
  /** Sum of maintenance costs. */
  maintenanceCost: z.number().int().nonnegative(),
});
export type InventoryAssetDetail = z.infer<typeof inventoryAssetDetailSchema>;

/** Stored in `churches.settings.facilities`. */
export const facilitiesSettingsSchema = z.object({
  /** Highest asset number handed out, so codes of deleted assets are never reused. */
  assetSequence: z.number().int().min(0).default(0),
});
export type FacilitiesSettings = z.infer<typeof facilitiesSettingsSchema>;

// ---------------------------------------------------------------------------------------------
// Module home and pickers
// ---------------------------------------------------------------------------------------------

export const facilitiesOverviewSchema = z.object({
  resources: z.object({
    total: z.number().int().nonnegative(),
    availableNow: z.number().int().nonnegative(),
  }),
  /** Requests waiting for a decision: every one for managers, the caller's own otherwise. */
  pendingCount: z.number().int().nonnegative(),
  /** Today's occurrences across resources (approved, plus pending ones the caller may see). */
  today: z.array(bookingOccurrenceSchema),
  /** The caller's next bookings. */
  myUpcoming: z.array(facilityBookingSchema),
  /** Present when the caller may view the inventory. */
  inventory: z
    .object({
      totalAssets: z.number().int().nonnegative(),
      totalValue: z.number().int().nonnegative(),
      onLoan: z.number().int().nonnegative(),
      overdue: z.number().int().nonnegative(),
      inMaintenance: z.number().int().nonnegative(),
      needsAttention: z.number().int().nonnegative(),
      maintenanceDue: z.number().int().nonnegative(),
      overdueLoans: z.array(assetLoanSchema),
    })
    .nullable(),
});
export type FacilitiesOverview = z.infer<typeof facilitiesOverviewSchema>;

export const facilitiesPeopleQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  ids: z
    .string()
    .trim()
    .max(40 * 20)
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean) : []))
    .pipe(z.array(idSchema).max(20)),
});
export const facilitiesPeopleSchema = z.object({ items: z.array(personSummarySchema) });
