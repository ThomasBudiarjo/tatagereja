// Zod schemas, enums and labels owned by the comms module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { LIMITS } from '../constants';
import type { LocalizedText } from '../localized';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  optionalDateTime,
  optionalText,
  optionalUrl,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
} from './common';
import { announcementInputSchema, announcementSchema } from './announcement';
import { eventInputSchema } from './event';
import { personSummarySchema } from './person';

export const COMMS_LIMITS = {
  announcementRolesMax: 20,
  feedTokensPerUserMax: 5,
  /** Occurrences created for one recurring series. */
  seriesOccurrencesMax: 200,
  partySizeMax: 20,
  eventCapacityMax: 100_000,
  bulletinSectionsMax: 30,
  bulletinSectionBodyMax: 10_000,
  bulletinItemsMax: 100,
  calendarRangeDaysMax: 100,
} as const;

// ---------------------------------------------------------------------------------------------
// Announcements upgrade
// ---------------------------------------------------------------------------------------------

export const ANNOUNCEMENT_AUDIENCES = ['church', 'group', 'roles'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<AnnouncementAudience, LocalizedText> = {
  church: { en: 'Whole church', id: 'Seluruh jemaat' },
  group: { en: 'One group', id: 'Satu kelompok' },
  roles: { en: 'People with roles', id: 'Pemegang peran tertentu' },
};

/** Derived from `status`, `publishAt` and `expiresAt` for display. */
export const ANNOUNCEMENT_STATES = ['draft', 'scheduled', 'published', 'expired'] as const;
export type AnnouncementState = (typeof ANNOUNCEMENT_STATES)[number];

export const ANNOUNCEMENT_STATE_LABELS: Record<AnnouncementState, LocalizedText> = {
  draft: { en: 'Draft', id: 'Draf' },
  scheduled: { en: 'Scheduled', id: 'Terjadwal' },
  published: { en: 'Published', id: 'Terbit' },
  expired: { en: 'Expired', id: 'Kedaluwarsa' },
};

export const announcementStateOf = (
  announcement: {
    status: 'draft' | 'published';
    publishAt: string | null;
    expiresAt: string | null;
  },
  now = Date.now(),
): AnnouncementState => {
  if (announcement.status === 'draft') return 'draft';
  if (announcement.publishAt && new Date(announcement.publishAt).getTime() > now)
    return 'scheduled';
  if (announcement.expiresAt && new Date(announcement.expiresAt).getTime() <= now) return 'expired';
  return 'published';
};

export const announcementDetailsSchema = announcementSchema.extend({
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  roleIds: z.array(idSchema),
  publishAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  pinned: z.boolean(),
  coverImageUrl: z.string().nullable(),
  state: z.enum(ANNOUNCEMENT_STATES),
  /** Members who opened it; only returned to people who can manage it. */
  seenCount: z.number().int().nonnegative().nullable(),
  readByMe: z.boolean(),
});
export type AnnouncementDetails = z.infer<typeof announcementDetailsSchema>;

/**
 * The full announcement form. The body is a safe markdown subset (paragraphs, **bold**,
 * _italic_, lists, links); raw HTML is never rendered.
 */
export const announcementDetailsInputSchema = announcementInputSchema
  .extend({
    audience: z.enum(ANNOUNCEMENT_AUDIENCES).default('church'),
    roleIds: z.array(idSchema).max(COMMS_LIMITS.announcementRolesMax).default([]),
    publishAt: optionalDateTime,
    expiresAt: optionalDateTime,
    pinned: z.boolean().default(false),
    coverImageUrl: optionalUrl,
  })
  .refine((value) => value.audience !== 'group' || value.groupId !== null, {
    message: 'Choose the group',
    path: ['groupId'],
  })
  .refine((value) => value.audience !== 'roles' || value.roleIds.length > 0, {
    message: 'Choose at least one role',
    path: ['roleIds'],
  })
  .refine(
    (value) =>
      !value.publishAt ||
      !value.expiresAt ||
      new Date(value.expiresAt).getTime() > new Date(value.publishAt).getTime(),
    { message: 'Expiry must be after the publish time', path: ['expiresAt'] },
  );
export type AnnouncementDetailsInput = z.infer<typeof announcementDetailsInputSchema>;

export const announcementReadersSchema = z.object({
  seenCount: z.number().int().nonnegative(),
  audienceCount: z.number().int().nonnegative(),
  items: z.array(z.object({ userId: idSchema, name: z.string(), readAt: isoDateTimeSchema })),
});
export type AnnouncementReaders = z.infer<typeof announcementReadersSchema>;

// ---------------------------------------------------------------------------------------------
// Events upgrade: recurring series, registration, waitlist, check-in
// ---------------------------------------------------------------------------------------------

export const EVENT_RECURRENCE_FREQUENCIES = ['weekly', 'biweekly', 'monthly'] as const;
export type EventRecurrenceFrequency = (typeof EVENT_RECURRENCE_FREQUENCIES)[number];

export const EVENT_RECURRENCE_LABELS: Record<EventRecurrenceFrequency, LocalizedText> = {
  weekly: { en: 'Every week', id: 'Setiap minggu' },
  biweekly: { en: 'Every two weeks', id: 'Dua minggu sekali' },
  monthly: { en: 'Every month', id: 'Setiap bulan' },
};

/** Editing an occurrence of a series changes only it, or it and every later one. */
export const EVENT_EDIT_SCOPES = ['this', 'future'] as const;
export type EventEditScope = (typeof EVENT_EDIT_SCOPES)[number];

export const eventRegistrationSettingsSchema = z.object({
  capacity: z.number().int().min(1).max(COMMS_LIMITS.eventCapacityMax).nullable().default(null),
  registrationRequired: z.boolean().default(false),
  registrationClosesAt: optionalDateTime,
  waitlistEnabled: z.boolean().default(true),
  checkInEnabled: z.boolean().default(false),
  coverColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish()
    .transform((value) => value ?? null),
});
export type EventRegistrationSettings = z.infer<typeof eventRegistrationSettingsSchema>;

export const eventDetailsInputSchema = eventInputSchema.and(eventRegistrationSettingsSchema);
export type EventDetailsInput = z.infer<typeof eventDetailsInputSchema>;

export const eventSeriesInputSchema = z
  .object({
    title: requiredText(2, LIMITS.nameMax),
    description: optionalText(LIMITS.longTextMax),
    location: optionalText(LIMITS.shortTextMax),
    groupId: idSchema.nullable().default(null),
    startsAt: isoDateTimeSchema,
    durationMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .nullable()
      .default(null),
    isAllDay: z.boolean().default(false),
    frequency: z.enum(EVENT_RECURRENCE_FREQUENCIES),
    untilDate: isoDateSchema,
  })
  .and(eventRegistrationSettingsSchema)
  .refine((value) => value.untilDate >= value.startsAt.slice(0, 10), {
    message: 'The end date must be on or after the first occurrence',
    path: ['untilDate'],
  });
export type EventSeriesInput = z.infer<typeof eventSeriesInputSchema>;

export const eventSeriesSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  groupId: idSchema.nullable(),
  title: z.string(),
  frequency: z.enum(EVENT_RECURRENCE_FREQUENCIES),
  startsAt: isoDateTimeSchema,
  untilDate: isoDateSchema,
  occurrenceCount: z.number().int().nonnegative(),
});
export type EventSeries = z.infer<typeof eventSeriesSchema>;

export const editEventScopeQuerySchema = z.object({
  scope: z.enum(EVENT_EDIT_SCOPES).default('this'),
});

export const EVENT_REGISTRATION_STATUSES = ['registered', 'waitlisted', 'cancelled'] as const;
export type EventRegistrationStatus = (typeof EVENT_REGISTRATION_STATUSES)[number];

export const EVENT_REGISTRATION_STATUS_LABELS: Record<EventRegistrationStatus, LocalizedText> = {
  registered: { en: 'Registered', id: 'Terdaftar' },
  waitlisted: { en: 'On the waitlist', id: 'Daftar tunggu' },
  cancelled: { en: 'Cancelled', id: 'Dibatalkan' },
};

export const eventRegistrationSchema = z.object({
  id: idSchema,
  eventId: idSchema,
  person: personSummarySchema,
  status: z.enum(EVENT_REGISTRATION_STATUSES),
  partySize: z.number().int().min(1),
  note: z.string().nullable(),
  /** 1-based place on the waitlist, null when not waitlisted. */
  waitlistPosition: z.number().int().min(1).nullable(),
  checkedInAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type EventRegistration = z.infer<typeof eventRegistrationSchema>;

export const eventRegistrationListSchema = z.object({
  items: z.array(eventRegistrationSchema),
  capacity: z.number().int().nullable(),
  registeredCount: z.number().int().nonnegative(),
  waitlistCount: z.number().int().nonnegative(),
});
export type EventRegistrationList = z.infer<typeof eventRegistrationListSchema>;

/** Registers the caller (default) or someone in their household. */
export const registerForEventBodySchema = z.object({
  personId: idSchema.optional(),
  partySize: z.number().int().min(1).max(COMMS_LIMITS.partySizeMax).default(1),
  note: optionalText(LIMITS.shortTextMax),
});
export type RegisterForEventBody = z.infer<typeof registerForEventBodySchema>;

export const eventCheckInBodySchema = z.object({
  personIds: z.array(idSchema).min(1).max(LIMITS.bulkIdsMax),
});
export type EventCheckInBody = z.infer<typeof eventCheckInBodySchema>;

// ---------------------------------------------------------------------------------------------
// Unified calendar and iCal feeds
// ---------------------------------------------------------------------------------------------

export const CALENDAR_SOURCES = ['events', 'services', 'bookings', 'birthdays'] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

export const CALENDAR_SOURCE_LABELS: Record<CalendarSource, LocalizedText> = {
  events: { en: 'Events', id: 'Kegiatan' },
  services: { en: 'Worship services', id: 'Ibadah' },
  bookings: { en: 'Room bookings', id: 'Peminjaman ruangan' },
  birthdays: { en: 'Birthdays', id: 'Ulang tahun' },
};

/** Default colours per source (both themes read them as accents). */
export const CALENDAR_SOURCE_COLORS: Record<CalendarSource, string> = {
  events: '#2563eb',
  services: '#7c3aed',
  bookings: '#0d9488',
  birthdays: '#db2777',
};

const sourceListSchema = z
  .string()
  .trim()
  .max(LIMITS.shortTextMax)
  .optional()
  .transform((value): CalendarSource[] =>
    value
      ? value
          .split(',')
          .map((part) => part.trim())
          .filter((part): part is CalendarSource =>
            (CALENDAR_SOURCES as readonly string[]).includes(part),
          )
      : ['events', 'services', 'bookings'],
  );

export const calendarQuerySchema = z
  .object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    /** Comma-separated `CALENDAR_SOURCES`; birthdays are opt-in. */
    sources: sourceListSchema,
    groupId: idSchema.optional(),
  })
  .refine((value) => new Date(value.to).getTime() > new Date(value.from).getTime(), {
    message: 'The end must be after the start',
    path: ['to'],
  })
  .refine(
    (value) =>
      new Date(value.to).getTime() - new Date(value.from).getTime() <=
      COMMS_LIMITS.calendarRangeDaysMax * 86_400_000,
    { message: 'Choose a shorter range', path: ['to'] },
  );
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const calendarItemSchema = z.object({
  /** `<source>:<id>`, unique within one response. */
  key: z.string(),
  source: z.enum(CALENDAR_SOURCES),
  id: z.string(),
  title: z.string(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable(),
  isAllDay: z.boolean(),
  location: z.string().nullable(),
  color: z.string(),
  /** In-app path to open. */
  link: z.string().nullable(),
});
export type CalendarItem = z.infer<typeof calendarItemSchema>;

export const calendarResponseSchema = z.object({ items: z.array(calendarItemSchema) });
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;

export const calendarFeedSchema = z.object({
  id: idSchema,
  label: z.string().nullable(),
  sources: z.array(z.enum(CALENDAR_SOURCES)),
  lastUsedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type CalendarFeed = z.infer<typeof calendarFeedSchema>;

export const calendarFeedListSchema = z.object({ items: z.array(calendarFeedSchema) });

export const createCalendarFeedBodySchema = z.object({
  label: optionalText(60),
  sources: z
    .array(z.enum(CALENDAR_SOURCES))
    .min(1)
    .max(CALENDAR_SOURCES.length)
    .default(['events', 'services']),
});
export type CreateCalendarFeedBody = z.infer<typeof createCalendarFeedBodySchema>;

/** The feed URL contains the secret token; it is shown only once. */
export const createdCalendarFeedSchema = z.object({
  feed: calendarFeedSchema,
  url: z.string(),
});
export type CreatedCalendarFeed = z.infer<typeof createdCalendarFeedSchema>;

// ---------------------------------------------------------------------------------------------
// Warta Jemaat
// ---------------------------------------------------------------------------------------------

export const BULLETIN_STATUSES = ['draft', 'published'] as const;
export type BulletinStatus = (typeof BULLETIN_STATUSES)[number];

export const BULLETIN_SECTION_KINDS = [
  'text',
  'announcements',
  'services',
  'rosters',
  'events',
  'birthdays',
  'anniversaries',
  'finance',
] as const;
export type BulletinSectionKind = (typeof BULLETIN_SECTION_KINDS)[number];

export const BULLETIN_SECTION_LABELS: Record<BulletinSectionKind, LocalizedText> = {
  text: { en: 'Free text', id: 'Teks bebas' },
  announcements: { en: 'Announcements', id: 'Pengumuman' },
  services: { en: 'Upcoming services', id: 'Jadwal ibadah' },
  rosters: { en: 'Serving schedule', id: 'Jadwal pelayanan' },
  events: { en: 'Upcoming events', id: 'Kegiatan mendatang' },
  birthdays: { en: 'Birthdays this week', id: 'Ulang tahun minggu ini' },
  anniversaries: { en: 'Wedding anniversaries', id: 'Ulang tahun pernikahan' },
  finance: { en: 'Offering summary', id: 'Laporan persembahan' },
};

/**
 * A section of the bulletin. `text` sections carry `body` (markdown subset); generated
 * sections list the chosen `itemIds` (announcements, services, events), or none for all.
 */
export const bulletinSectionSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(BULLETIN_SECTION_KINDS),
  title: requiredText(1, LIMITS.nameMax),
  body: optionalText(COMMS_LIMITS.bulletinSectionBodyMax),
  itemIds: z.array(idSchema).max(COMMS_LIMITS.bulletinItemsMax).default([]),
});
export type BulletinSection = z.infer<typeof bulletinSectionSchema>;

export const bulletinSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  title: z.string(),
  issueDate: isoDateSchema,
  theme: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  sections: z.array(bulletinSectionSchema),
  includeFinanceSummary: z.boolean(),
  status: z.enum(BULLETIN_STATUSES),
  publishedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Bulletin = z.infer<typeof bulletinSchema>;

export const bulletinInputSchema = z.object({
  title: requiredText(2, LIMITS.nameMax),
  issueDate: isoDateSchema,
  theme: optionalText(LIMITS.shortTextMax),
  coverImageUrl: optionalUrl,
  sections: z.array(bulletinSectionSchema).max(COMMS_LIMITS.bulletinSectionsMax).default([]),
  includeFinanceSummary: z.boolean().default(false),
  status: z.enum(BULLETIN_STATUSES).default('draft'),
});
export type BulletinInput = z.infer<typeof bulletinInputSchema>;

export const bulletinListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(BULLETIN_STATUSES).optional(),
});
export type BulletinListQuery = z.infer<typeof bulletinListQuerySchema>;

export const bulletinListSchema = paginatedSchema(bulletinSchema.omit({ sections: true }));
export type BulletinList = z.infer<typeof bulletinListSchema>;
