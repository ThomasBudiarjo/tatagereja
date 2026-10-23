// Zod schemas, enums and labels owned by the comms module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { LIMITS, PARTICIPANT_STATUSES } from '../constants';
import type { LocalizedText } from '../localized';
import { isModuleEnabled } from '../modules';
import { has, hasAny, isLeaderOf, type AccessLike } from '../permissions';
import { announcementInputSchema, announcementSchema } from './announcement';
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
import { attendanceSessionSummarySchema, eventInputSchema, eventSchema } from './event';
import { personSummarySchema } from './person';
import { dateTimeFormat } from '../utils';

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
  /** Days of history and future an iCal feed covers. */
  feedPastDays: 30,
  feedFutureDays: 180,
  /** Self check-in opens this long before an event starts. */
  checkInOpensMinutes: 120,
  /** Self check-in stays open this long after the start when an event has no end. */
  checkInOpenHours: 12,
} as const;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------------------------
// Time zone helpers (church-local dates for series, bulletins and birthdays)
// ---------------------------------------------------------------------------------------------

/** Milliseconds a time zone is ahead of UTC at an instant (Asia/Jakarta: +7 h). */
export const timeZoneOffsetMs = (instant: number, timeZone: string): number => {
  try {
    const parts = dateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(instant));
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
    const wall = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    );
    return wall - Math.floor(instant / 1000) * 1000;
  } catch {
    return 0;
  }
};

/** The calendar day (YYYY-MM-DD) of an instant in a time zone. */
export const churchDateOf = (instant: string | number | Date, timeZone: string): string => {
  const time = new Date(instant).getTime();
  return new Date(time + timeZoneOffsetMs(time, timeZone)).toISOString().slice(0, 10);
};

/** Adds days to a YYYY-MM-DD date. */
export const addDaysToDate = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** The instant a local wall-clock time (`date` + milliseconds after midnight) happens. */
export const zonedInstant = (date: string, msOfDay: number, timeZone: string): number => {
  const wall = Date.parse(`${date}T00:00:00Z`) + msOfDay;
  const guess = wall - timeZoneOffsetMs(wall, timeZone);
  return wall - timeZoneOffsetMs(guess, timeZone);
};

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

/** Posting to the whole church or to roles needs `announcements.manage`. */
export const canTargetChurchWide = (access: Pick<AccessLike, 'permissions'>): boolean =>
  has(access, 'announcements.manage');

/**
 * Whether an announcement's audience includes the caller: everyone for the whole church,
 * members and leaders of the group, holders of one of the roles.
 */
export const isInAnnouncementAudience = (
  access: AccessLike & { roleIds?: readonly string[] },
  announcement: {
    audience: AnnouncementAudience;
    groupId: string | null;
    roleIds: readonly string[];
  },
  memberGroupIds: readonly string[],
): boolean => {
  if (announcement.audience === 'church') return true;
  if (announcement.audience === 'group') {
    return (
      !!announcement.groupId &&
      (memberGroupIds.includes(announcement.groupId) || isLeaderOf(access, announcement.groupId))
    );
  }
  const roleIds = access.roleIds ?? [];
  return announcement.roleIds.some((roleId) => roleIds.includes(roleId));
};

export const announcementDetailsSchema = announcementSchema.extend({
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  roleIds: z.array(idSchema),
  roleNames: z.array(z.string()),
  publishAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  pinned: z.boolean(),
  coverImageUrl: z.string().nullable(),
  state: z.enum(ANNOUNCEMENT_STATES),
  /** Members who opened it; only returned to people who can manage it. */
  seenCount: z.number().int().nonnegative().nullable(),
  readByMe: z.boolean(),
  /** When it became (or becomes) visible: `publishAt`, else `publishedAt`. */
  visibleFrom: isoDateTimeSchema.nullable(),
});
export type AnnouncementDetails = z.infer<typeof announcementDetailsSchema>;

/**
 * The full announcement form. The body is a safe markdown subset (paragraphs, **bold**,
 * _italic_, lists, links); raw HTML is never rendered. Without an `audience`, a group id makes
 * it a group announcement (the older form).
 */
export const announcementDetailsInputSchema = announcementInputSchema
  .extend({
    audience: z.enum(ANNOUNCEMENT_AUDIENCES).optional(),
    roleIds: z.array(idSchema).max(COMMS_LIMITS.announcementRolesMax).default([]),
    publishAt: optionalDateTime,
    expiresAt: optionalDateTime,
    pinned: z.boolean().default(false),
    coverImageUrl: optionalUrl,
  })
  .transform((value) => {
    const audience: AnnouncementAudience = value.audience ?? (value.groupId ? 'group' : 'church');
    return {
      ...value,
      audience,
      groupId: audience === 'group' ? value.groupId : null,
      roleIds: audience === 'roles' ? [...new Set(value.roleIds)] : [],
    };
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
export type AnnouncementDetailsInput = z.output<typeof announcementDetailsInputSchema>;

export const announcementDetailsListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['draft', 'published']).optional(),
  state: z.enum(ANNOUNCEMENT_STATES).optional(),
  groupId: idSchema.optional(),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).optional(),
});
export type AnnouncementDetailsListQuery = z.infer<typeof announcementDetailsListQuerySchema>;

export const announcementDetailsListSchema = paginatedSchema(announcementDetailsSchema);
export type AnnouncementDetailsList = z.infer<typeof announcementDetailsListSchema>;

export const announcementFullDetailSchema = z.object({
  announcement: announcementDetailsSchema,
  canManage: z.boolean(),
});
export type AnnouncementFullDetail = z.infer<typeof announcementFullDetailSchema>;

export const announcementDetailsResponseSchema = z.object({
  announcement: announcementDetailsSchema,
});

/** Who the caller may address: groups they may post to and, with `announcements.manage`, roles. */
export const announcementAudienceOptionsSchema = z.object({
  churchWide: z.boolean(),
  groups: z.array(z.object({ id: idSchema, name: z.string() })),
  roles: z.array(z.object({ id: idSchema, name: z.string() })),
});
export type AnnouncementAudienceOptions = z.infer<typeof announcementAudienceOptionsSchema>;

export const pinAnnouncementBodySchema = z.object({ pinned: z.boolean() });

export const announcementReadersSchema = z.object({
  seenCount: z.number().int().nonnegative(),
  audienceCount: z.number().int().nonnegative(),
  items: z.array(z.object({ userId: idSchema, name: z.string(), readAt: isoDateTimeSchema })),
});
export type AnnouncementReaders = z.infer<typeof announcementReadersSchema>;

/** Plain text of a markdown-lite body, for notification bodies and previews. */
export const markdownExcerpt = (body: string, max = 160): string => {
  const text = body
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

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

/**
 * The start instants of a series: the first start, then every week, two weeks or month at the
 * same church-local time of day, up to `untilDate` (inclusive, church-local). Monthly series
 * skip months without that day (a series on the 31st meets only in long months).
 */
export const seriesOccurrenceStarts = (
  series: { startsAt: string; frequency: EventRecurrenceFrequency; untilDate: string },
  timeZone: string,
  max: number = COMMS_LIMITS.seriesOccurrencesMax,
): string[] => {
  const first = new Date(series.startsAt).getTime();
  const firstDate = churchDateOf(first, timeZone);
  const msOfDay = first + timeZoneOffsetMs(first, timeZone) - Date.parse(`${firstDate}T00:00:00Z`);
  const [year, month, day] = firstDate.split('-').map(Number) as [number, number, number];
  const starts: string[] = [];
  for (let index = 0; starts.length < max && index < max * 2; index += 1) {
    let date: string;
    if (series.frequency === 'monthly') {
      const candidate = new Date(Date.UTC(year, month - 1 + index, day));
      if (candidate.getUTCDate() !== day) continue;
      date = candidate.toISOString().slice(0, 10);
    } else {
      date = addDaysToDate(firstDate, index * (series.frequency === 'weekly' ? 7 : 14));
    }
    if (date > series.untilDate) break;
    starts.push(new Date(zonedInstant(date, msOfDay, timeZone)).toISOString());
  }
  return starts;
};

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
  })
  .refine(
    (value) =>
      Date.parse(`${value.untilDate}T00:00:00Z`) - new Date(value.startsAt).getTime() <=
      2 * 366 * DAY_MS,
    { message: 'A series can run for at most two years', path: ['untilDate'] },
  );
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

/** A registration of the caller or their household, shown on the event. */
export const myEventRegistrationSchema = z.object({
  id: idSchema,
  personId: idSchema,
  status: z.enum(EVENT_REGISTRATION_STATUSES),
  partySize: z.number().int().min(1),
  waitlistPosition: z.number().int().min(1).nullable(),
  checkedInAt: isoDateTimeSchema.nullable(),
});
export type MyEventRegistration = z.infer<typeof myEventRegistrationSchema>;

export const eventDetailsSchema = eventSchema.extend({
  seriesId: idSchema.nullable(),
  series: z
    .object({ frequency: z.enum(EVENT_RECURRENCE_FREQUENCIES), untilDate: isoDateSchema })
    .nullable(),
  isSeriesException: z.boolean(),
  coverColor: z.string().nullable(),
  capacity: z.number().int().nullable(),
  registrationRequired: z.boolean(),
  registrationClosesAt: isoDateTimeSchema.nullable(),
  waitlistEnabled: z.boolean(),
  checkInEnabled: z.boolean(),
  cancelledAt: isoDateTimeSchema.nullable(),
  /** Places taken by registered people (party sizes added up). */
  registeredCount: z.number().int().nonnegative(),
  waitlistCount: z.number().int().nonnegative(),
  /** Null when the event has no capacity. */
  placesLeft: z.number().int().nonnegative().nullable(),
  goingCount: z.number().int().nonnegative(),
  /** The caller's own registration (not their household's). */
  myRegistration: myEventRegistrationSchema.nullable(),
  myRsvp: z.enum(PARTICIPANT_STATUSES).nullable(),
});
export type EventDetails = z.infer<typeof eventDetailsSchema>;

export const eventDetailsListQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  groupId: idSchema.optional(),
  /** Only events the caller registered for or said they attend. */
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type EventDetailsListQuery = z.infer<typeof eventDetailsListQuerySchema>;

export const eventDetailsListSchema = paginatedSchema(eventDetailsSchema);
export type EventDetailsList = z.infer<typeof eventDetailsListSchema>;

export const eventParticipantDetailsSchema = personSummarySchema.extend({
  status: z.enum(PARTICIPANT_STATUSES),
});

export const eventFullDetailSchema = z.object({
  event: eventDetailsSchema,
  participants: z.array(eventParticipantDetailsSchema),
  sessions: z.array(attendanceSessionSummarySchema),
  canManage: z.boolean(),
  canRecordAttendance: z.boolean(),
  canCheckIn: z.boolean(),
  /** Registration is open now (not closed, started or cancelled). */
  registrationOpen: z.boolean(),
  selfCheckInOpen: z.boolean(),
  /** People the caller may register: themselves and their household. */
  registrablePeople: z.array(personSummarySchema),
  /** Registrations of the caller's household. */
  householdRegistrations: z.array(myEventRegistrationSchema),
});
export type EventFullDetail = z.infer<typeof eventFullDetailSchema>;

export const eventDetailsResponseSchema = z.object({ event: eventDetailsSchema });

export const eventSeriesResponseSchema = z.object({
  series: eventSeriesSchema,
  event: eventDetailsSchema,
});
export type EventSeriesResponse = z.infer<typeof eventSeriesResponseSchema>;

export const eventDeleteResultSchema = z.object({
  ok: z.literal(true),
  deleted: z.number().int().nonnegative(),
});

export const cancelEventBodySchema = z.object({ reason: optionalText(LIMITS.shortTextMax) });

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

export const eventRegistrationResponseSchema = z.object({
  registration: eventRegistrationSchema,
  event: eventDetailsSchema,
});
export type EventRegistrationResponse = z.infer<typeof eventRegistrationResponseSchema>;

/** Registers the caller (default) or someone in their household. */
export const registerForEventBodySchema = z.object({
  personId: idSchema.optional(),
  partySize: z.number().int().min(1).max(COMMS_LIMITS.partySizeMax).default(1),
  note: optionalText(LIMITS.shortTextMax),
});
export type RegisterForEventBody = z.infer<typeof registerForEventBodySchema>;

export const eventRegistrationParamsSchema = z.object({
  churchId: idSchema,
  id: idSchema,
  registrationId: idSchema,
});

export const eventCheckInBodySchema = z.object({
  personIds: z.array(idSchema).min(1).max(LIMITS.bulkIdsMax),
});
export type EventCheckInBody = z.infer<typeof eventCheckInBodySchema>;

export const EVENT_CHECK_IN_SOURCES = ['registration', 'rsvp', 'walk_in'] as const;
export type EventCheckInSource = (typeof EVENT_CHECK_IN_SOURCES)[number];

export const eventCheckInListSchema = z.object({
  items: z.array(
    z.object({
      person: personSummarySchema,
      source: z.enum(EVENT_CHECK_IN_SOURCES),
      partySize: z.number().int().min(1),
      checkedInAt: isoDateTimeSchema.nullable(),
    }),
  ),
  sessionId: idSchema.nullable(),
  checkedInCount: z.number().int().nonnegative(),
});
export type EventCheckInList = z.infer<typeof eventCheckInListSchema>;

export const eventCheckInResultSchema = z.object({
  sessionId: idSchema,
  checkedIn: z.number().int().nonnegative(),
});
export type EventCheckInResult = z.infer<typeof eventCheckInResultSchema>;

/** Places taken by a set of registrations (party sizes of the registered ones). */
export const placesTaken = (
  registrations: readonly { status: EventRegistrationStatus; partySize: number }[],
): number =>
  registrations
    .filter((registration) => registration.status === 'registered')
    .reduce((sum, registration) => sum + registration.partySize, 0);

/** Whether people can still sign up: not cancelled, not started, not past the closing time. */
export const isRegistrationOpen = (
  event: {
    registrationRequired: boolean;
    registrationClosesAt: string | null;
    cancelledAt: string | null;
    startsAt: string;
  },
  now = Date.now(),
): boolean =>
  event.registrationRequired &&
  !event.cancelledAt &&
  new Date(event.startsAt).getTime() > now &&
  (!event.registrationClosesAt || new Date(event.registrationClosesAt).getTime() > now);

/** Self check-in is open from two hours before the start until the end (or 12 hours in). */
export const isSelfCheckInOpen = (
  event: {
    checkInEnabled: boolean;
    cancelledAt: string | null;
    startsAt: string;
    endsAt: string | null;
  },
  now = Date.now(),
): boolean => {
  if (!event.checkInEnabled || event.cancelledAt) return false;
  const start = new Date(event.startsAt).getTime();
  const end = event.endsAt
    ? new Date(event.endsAt).getTime()
    : start + COMMS_LIMITS.checkInOpenHours * 3_600_000;
  return now >= start - COMMS_LIMITS.checkInOpensMinutes * 60_000 && now <= end;
};

/** Check people in at an event: attendance recorders and the event's managers. */
export const canCheckInEvent = (access: AccessLike, event: { groupId: string | null }): boolean =>
  has(access, 'attendance.record') ||
  has(access, 'events.manage') ||
  isLeaderOf(access, event.groupId);

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

/**
 * The calendar sources the caller may see: events (`events.view`), services (worship on and
 * a services permission), bookings (facilities on and a facilities permission), birthdays
 * (`people.view`; each person's birthday privacy still applies).
 */
export const calendarSourcesFor = (
  access: Pick<AccessLike, 'permissions'>,
  enabledModules: readonly string[],
): CalendarSource[] => {
  const sources: CalendarSource[] = [];
  if (has(access, 'events.view')) sources.push('events');
  if (
    isModuleEnabled(enabledModules, 'worship') &&
    hasAny(access, ['services.view', 'services.manage'])
  )
    sources.push('services');
  if (
    isModuleEnabled(enabledModules, 'facilities') &&
    hasAny(access, ['facilities.view', 'facilities.book', 'facilities.manage'])
  )
    sources.push('bookings');
  if (has(access, 'people.view')) sources.push('birthdays');
  return sources;
};

/** Comma-separated sources; some servers already split repeated or comma-separated values. */
const sourceListSchema = z
  .union([
    z.string().trim().max(LIMITS.shortTextMax),
    z.array(z.string().trim().max(40)).max(CALENDAR_SOURCES.length * 2),
  ])
  .optional()
  .transform((value): CalendarSource[] => {
    if (value === undefined || value === '') return ['events', 'services', 'bookings'];
    const parts = (Array.isArray(value) ? value : [value]).flatMap((part) => part.split(','));
    return [
      ...new Set(
        parts
          .map((part) => part.trim())
          .filter((part): part is CalendarSource =>
            (CALENDAR_SOURCES as readonly string[]).includes(part),
          ),
      ),
    ];
  });

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
      COMMS_LIMITS.calendarRangeDaysMax * DAY_MS,
    { message: 'Choose a shorter range', path: ['to'] },
  );
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const calendarItemSchema = z.object({
  /** `<source>:<id>[:<start>]`, unique within one response. */
  key: z.string(),
  source: z.enum(CALENDAR_SOURCES),
  id: z.string(),
  title: z.string(),
  /** A second line: group, room, preacher or age. */
  subtitle: z.string().nullable(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable(),
  isAllDay: z.boolean(),
  location: z.string().nullable(),
  color: z.string(),
  cancelled: z.boolean(),
  /** In-app path to open. */
  link: z.string().nullable(),
});
export type CalendarItem = z.infer<typeof calendarItemSchema>;

export const calendarResponseSchema = z.object({
  items: z.array(calendarItemSchema),
  /** Sources the caller may turn on. */
  available: z.array(z.enum(CALENDAR_SOURCES)),
});
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
export type CalendarFeedList = z.infer<typeof calendarFeedListSchema>;

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
  /** The URL path below the server address, for clients that know their server. */
  path: z.string(),
});
export type CreatedCalendarFeed = z.infer<typeof createdCalendarFeedSchema>;

export const calendarFeedTokenParamsSchema = z.object({
  token: z
    .string()
    .min(20)
    .max(LIMITS.tokenMax)
    .regex(/^[A-Za-z0-9_-]+(\.ics)?$/),
});

// ---------------------------------------------------------------------------------------------
// Warta Jemaat
// ---------------------------------------------------------------------------------------------

export const BULLETIN_STATUSES = ['draft', 'published'] as const;
export type BulletinStatus = (typeof BULLETIN_STATUSES)[number];

export const BULLETIN_STATUS_LABELS: Record<BulletinStatus, LocalizedText> = {
  draft: { en: 'Draft', id: 'Draf' },
  published: { en: 'Published', id: 'Terbit' },
};

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

/** Section kinds that pick items by id (none chosen means every item of the week). */
export const BULLETIN_PICKABLE_KINDS = ['announcements', 'services', 'events'] as const;

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

/** The sections a new bulletin starts with, titled in the given language. */
export const defaultBulletinSections = (
  locale: 'id' | 'en' = 'id',
  newId: () => string = () => Math.random().toString(36).slice(2, 10),
): BulletinSection[] =>
  (
    [
      'text',
      'services',
      'rosters',
      'announcements',
      'events',
      'birthdays',
      'anniversaries',
    ] as const
  ).map((kind) => ({
    id: newId(),
    kind,
    title:
      kind === 'text'
        ? locale === 'id'
          ? 'Renungan singkat'
          : 'Reflection'
        : BULLETIN_SECTION_LABELS[kind][locale],
    body: null,
    itemIds: [],
  }));

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
  authorName: z.string().nullable(),
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
});
export type BulletinInput = z.infer<typeof bulletinInputSchema>;

export const bulletinListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(BULLETIN_STATUSES).optional(),
});
export type BulletinListQuery = z.infer<typeof bulletinListQuerySchema>;

export const bulletinSummarySchema = bulletinSchema.omit({ sections: true }).extend({
  sectionCount: z.number().int().nonnegative(),
});
export type BulletinSummary = z.infer<typeof bulletinSummarySchema>;

export const bulletinListSchema = paginatedSchema(bulletinSummarySchema);
export type BulletinList = z.infer<typeof bulletinListSchema>;

/** One line of a generated section. */
export const bulletinItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  /** Instant for services and events. */
  startsAt: isoDateTimeSchema.nullable(),
  /** Day for birthdays and anniversaries. */
  date: isoDateSchema.nullable(),
  /** Markdown-lite body (announcements). */
  body: z.string().nullable(),
  /** Years: age turned or years married. */
  years: z.number().int().nullable(),
});
export type BulletinItem = z.infer<typeof bulletinItemSchema>;

export const bulletinFinanceSummarySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  currency: z.string(),
  income: z.number().int(),
  expense: z.number().int(),
  byCategory: z.array(z.object({ name: z.string(), amount: z.number().int() })),
});
export type BulletinFinanceSummary = z.infer<typeof bulletinFinanceSummarySchema>;

export const bulletinRenderedSectionSchema = bulletinSectionSchema.extend({
  items: z.array(bulletinItemSchema),
  finance: bulletinFinanceSummarySchema.nullable(),
});
export type BulletinRenderedSection = z.infer<typeof bulletinRenderedSectionSchema>;

export const bulletinDetailSchema = z.object({
  bulletin: bulletinSchema,
  /** Sections with their content resolved for the caller (finance only for `finance.reports`). */
  rendered: z.array(bulletinRenderedSectionSchema),
  week: z.object({ from: isoDateSchema, to: isoDateSchema }),
  churchName: z.string(),
  canManage: z.boolean(),
});
export type BulletinDetail = z.infer<typeof bulletinDetailSchema>;

export const bulletinResponseSchema = z.object({ bulletin: bulletinSchema });

export const bulletinSourcesQuerySchema = z.object({ issueDate: isoDateSchema });

const bulletinSourceSchema = z.object({
  id: idSchema,
  title: z.string(),
  startsAt: isoDateTimeSchema.nullable(),
});

export const bulletinSourcesSchema = z.object({
  week: z.object({ from: isoDateSchema, to: isoDateSchema }),
  announcements: z.array(bulletinSourceSchema),
  services: z.array(bulletinSourceSchema),
  events: z.array(bulletinSourceSchema),
  financeAvailable: z.boolean(),
  servicesAvailable: z.boolean(),
});
export type BulletinSources = z.infer<typeof bulletinSourcesSchema>;

/** The week a bulletin covers: its issue date and the six days after it. */
export const bulletinWeekOf = (issueDate: string) => ({
  from: issueDate,
  to: addDaysToDate(issueDate, 6),
});

export const canManageBulletins = (access: Pick<AccessLike, 'permissions'>): boolean =>
  has(access, 'bulletin.manage');

export const canReadBulletins = (access: Pick<AccessLike, 'permissions'>): boolean =>
  hasAny(access, ['bulletin.view', 'bulletin.manage']);

/** Only holders of `finance.reports` see the offering summary, and only with finance on. */
export const canSeeBulletinFinance = (
  access: Pick<AccessLike, 'permissions'>,
  enabledModules: readonly string[],
): boolean => isModuleEnabled(enabledModules, 'finance') && has(access, 'finance.reports');
