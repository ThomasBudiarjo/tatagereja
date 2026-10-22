// Zod schemas, enums and labels owned by the worship module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { LIMITS } from '../constants';
import type { LocalizedText } from '../localized';
import { has, type AccessLike } from '../permissions';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  optionalDateTime,
  optionalHexColor,
  optionalText,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
} from './common';
import { personSummarySchema } from './person';

export const WORSHIP_LIMITS = {
  liturgyItemsMax: 100,
  scriptureReadingsMax: 10,
  songTagsMax: 20,
  lyricsMax: 20_000,
  positionsPerTeamMax: 50,
  rosterBulkMax: 500,
  durationMinutesMax: 600,
  tempoMax: 300,
  /** Weeks of history considered by the rotation fairness suggestion. */
  rotationWeeks: 12,
} as const;

const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

// ---------------------------------------------------------------------------------------------
// Service types and services
// ---------------------------------------------------------------------------------------------

export const SERVICE_CATEGORIES = [
  'general',
  'youth',
  'teens',
  'sunday_school',
  'prayer',
  'holy_day',
  'other',
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, LocalizedText> = {
  general: { en: 'Sunday service', id: 'Ibadah Umum' },
  youth: { en: 'Youth service', id: 'Ibadah Pemuda' },
  teens: { en: 'Teens service', id: 'Ibadah Remaja' },
  sunday_school: { en: 'Sunday school', id: 'Sekolah Minggu' },
  prayer: { en: 'Prayer meeting', id: 'Persekutuan Doa' },
  holy_day: { en: 'Holy day', id: 'Ibadah Hari Raya' },
  other: { en: 'Other', id: 'Lainnya' },
};

/** Suggested service types for a new church. */
export const DEFAULT_SERVICE_TYPES: readonly {
  name: string;
  category: ServiceCategory;
  defaultTime: string;
}[] = [
  { name: 'Ibadah Umum 1', category: 'general', defaultTime: '07:00' },
  { name: 'Ibadah Umum 2', category: 'general', defaultTime: '09:30' },
  { name: 'Ibadah Pemuda', category: 'youth', defaultTime: '17:00' },
  { name: 'Ibadah Remaja', category: 'teens', defaultTime: '09:30' },
  { name: 'Sekolah Minggu', category: 'sunday_school', defaultTime: '07:00' },
  { name: 'Persekutuan Doa', category: 'prayer', defaultTime: '19:00' },
];

export const SERVICE_STATUSES = ['draft', 'published', 'cancelled'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, LocalizedText> = {
  draft: { en: 'Draft', id: 'Draf' },
  published: { en: 'Published', id: 'Terbit' },
  cancelled: { en: 'Cancelled', id: 'Dibatalkan' },
};

export const serviceTypeSchema = z.object({
  id: idSchema,
  name: z.string(),
  category: z.enum(SERVICE_CATEGORIES),
  defaultTime: z.string().nullable(),
  defaultDurationMinutes: z.number().int().nullable(),
  defaultLocation: z.string().nullable(),
  color: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type ServiceType = z.infer<typeof serviceTypeSchema>;

export const serviceTypeInputSchema = z.object({
  name: requiredText(2, LIMITS.nameMax),
  category: z.enum(SERVICE_CATEGORIES).default('general'),
  defaultTime: timeOfDaySchema.nullable().default(null),
  defaultDurationMinutes: z
    .number()
    .int()
    .min(1)
    .max(WORSHIP_LIMITS.durationMinutesMax)
    .nullable()
    .default(null),
  defaultLocation: optionalText(LIMITS.shortTextMax),
  color: optionalHexColor,
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
});
export type ServiceTypeInput = z.infer<typeof serviceTypeInputSchema>;

export const serviceTypeListSchema = z.object({ items: z.array(serviceTypeSchema) });

export const worshipServiceSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  serviceTypeId: idSchema.nullable(),
  serviceTypeName: z.string().nullable(),
  title: z.string(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable(),
  location: z.string().nullable(),
  theme: z.string().nullable(),
  scriptureReadings: z.array(z.string()),
  preacher: personSummarySchema.nullable(),
  preacherName: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(SERVICE_STATUSES),
  /** Sum of the liturgy item durations, in minutes. */
  totalMinutes: z.number().int().nonnegative(),
  /** Roster progress: accepted / total assignments. */
  rosterAccepted: z.number().int().nonnegative(),
  rosterTotal: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type WorshipService = z.infer<typeof worshipServiceSchema>;

export const worshipServiceInputSchema = z
  .object({
    serviceTypeId: idSchema.nullable().default(null),
    title: requiredText(2, LIMITS.nameMax),
    startsAt: isoDateTimeSchema,
    endsAt: optionalDateTime,
    location: optionalText(LIMITS.shortTextMax),
    theme: optionalText(LIMITS.shortTextMax),
    scriptureReadings: z
      .array(requiredText(1, LIMITS.shortTextMax))
      .max(WORSHIP_LIMITS.scriptureReadingsMax)
      .default([]),
    preacherPersonId: idSchema.nullable().default(null),
    preacherName: optionalText(LIMITS.nameMax),
    notes: optionalText(LIMITS.longTextMax),
    status: z.enum(SERVICE_STATUSES).default('draft'),
  })
  .refine(
    (value) =>
      !value.endsAt || new Date(value.endsAt).getTime() >= new Date(value.startsAt).getTime(),
    { message: 'End time must be after the start time', path: ['endsAt'] },
  );
export type WorshipServiceInput = z.infer<typeof worshipServiceInputSchema>;

export const worshipServiceListQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  serviceTypeId: idSchema.optional(),
  status: z.enum(SERVICE_STATUSES).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type WorshipServiceListQuery = z.infer<typeof worshipServiceListQuerySchema>;

export const worshipServiceListSchema = paginatedSchema(worshipServiceSchema);
export type WorshipServiceList = z.infer<typeof worshipServiceListSchema>;

// ---------------------------------------------------------------------------------------------
// Liturgy and songs
// ---------------------------------------------------------------------------------------------

export const LITURGY_ITEM_TYPES = [
  'song',
  'reading',
  'prayer',
  'sermon',
  'offering',
  'announcement',
  'other',
] as const;
export type LiturgyItemType = (typeof LITURGY_ITEM_TYPES)[number];

export const LITURGY_ITEM_TYPE_LABELS: Record<LiturgyItemType, LocalizedText> = {
  song: { en: 'Song', id: 'Nyanyian' },
  reading: { en: 'Scripture reading', id: 'Pembacaan Alkitab' },
  prayer: { en: 'Prayer', id: 'Doa' },
  sermon: { en: 'Sermon', id: 'Khotbah' },
  offering: { en: 'Offering', id: 'Persembahan' },
  announcement: { en: 'Announcements', id: 'Warta jemaat' },
  other: { en: 'Other', id: 'Lainnya' },
};

export const liturgyItemSchema = z.object({
  id: idSchema,
  serviceId: idSchema,
  position: z.number().int().nonnegative(),
  type: z.enum(LITURGY_ITEM_TYPES),
  title: z.string(),
  durationMinutes: z.number().int().nullable(),
  songId: idSchema.nullable(),
  songTitle: z.string().nullable(),
  songKey: z.string().nullable(),
  person: personSummarySchema.nullable(),
  personName: z.string().nullable(),
  notes: z.string().nullable(),
});
export type LiturgyItem = z.infer<typeof liturgyItemSchema>;

export const liturgyItemInputSchema = z.object({
  type: z.enum(LITURGY_ITEM_TYPES),
  title: requiredText(1, LIMITS.shortTextMax),
  durationMinutes: z
    .number()
    .int()
    .min(0)
    .max(WORSHIP_LIMITS.durationMinutesMax)
    .nullable()
    .default(null),
  songId: idSchema.nullable().default(null),
  songKey: optionalText(10),
  personId: idSchema.nullable().default(null),
  personName: optionalText(LIMITS.nameMax),
  notes: optionalText(LIMITS.longTextMax),
});
export type LiturgyItemInput = z.infer<typeof liturgyItemInputSchema>;

/** Replaces the whole order of service at once (drag to reorder saves the full list). */
export const saveLiturgyBodySchema = z.object({
  items: z.array(liturgyItemInputSchema).max(WORSHIP_LIMITS.liturgyItemsMax),
});
export type SaveLiturgyBody = z.infer<typeof saveLiturgyBodySchema>;

export const reorderLiturgyBodySchema = z.object({
  itemIds: z.array(idSchema).min(1).max(WORSHIP_LIMITS.liturgyItemsMax),
});
export type ReorderLiturgyBody = z.infer<typeof reorderLiturgyBodySchema>;

export const HYMNALS = ['KJ', 'PKJ', 'NKB', 'KPRI', 'BE', 'other'] as const;
export type Hymnal = (typeof HYMNALS)[number];

export const HYMNAL_LABELS: Record<Hymnal, LocalizedText> = {
  KJ: { en: 'Kidung Jemaat (KJ)', id: 'Kidung Jemaat (KJ)' },
  PKJ: { en: 'Pelengkap Kidung Jemaat (PKJ)', id: 'Pelengkap Kidung Jemaat (PKJ)' },
  NKB: { en: 'Nyanyikanlah Kidung Baru (NKB)', id: 'Nyanyikanlah Kidung Baru (NKB)' },
  KPRI: {
    en: 'Kidung Persekutuan Reformed Injili (KPRI)',
    id: 'Kidung Persekutuan Reformed Injili (KPRI)',
  },
  BE: { en: 'Buku Ende (BE)', id: 'Buku Ende (BE)' },
  other: { en: 'Other hymnal', id: 'Buku nyanyian lain' },
};

export const SONG_KEYS = [
  'C',
  'C#',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;

export const songSchema = z.object({
  id: idSchema,
  title: z.string(),
  author: z.string().nullable(),
  defaultKey: z.string().nullable(),
  tempo: z.number().int().nullable(),
  lyrics: z.string().nullable(),
  tags: z.array(z.string()),
  ccliNumber: z.string().nullable(),
  hymnal: z.enum(HYMNALS).nullable(),
  hymnalNumber: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  lastUsedAt: isoDateTimeSchema.nullable(),
  useCount: z.number().int().nonnegative(),
});
export type Song = z.infer<typeof songSchema>;

export const songInputSchema = z.object({
  title: requiredText(1, LIMITS.nameMax),
  author: optionalText(LIMITS.nameMax),
  defaultKey: optionalText(10),
  tempo: z.number().int().min(20).max(WORSHIP_LIMITS.tempoMax).nullable().default(null),
  lyrics: optionalText(WORSHIP_LIMITS.lyricsMax),
  tags: z.array(requiredText(1, 40)).max(WORSHIP_LIMITS.songTagsMax).default([]),
  ccliNumber: optionalText(20),
  hymnal: z.enum(HYMNALS).nullable().default(null),
  hymnalNumber: optionalText(20),
  notes: optionalText(LIMITS.longTextMax),
  isActive: z.boolean().default(true),
});
export type SongInput = z.infer<typeof songInputSchema>;

export const songListQuerySchema = paginationQuerySchema.extend({
  tag: z.string().trim().max(40).optional(),
  hymnal: z.enum(HYMNALS).optional(),
  sort: z.enum(['title', 'last_used', 'most_used']).default('title'),
});
export type SongListQuery = z.infer<typeof songListQuerySchema>;

export const songListSchema = paginatedSchema(songSchema);
export type SongList = z.infer<typeof songListSchema>;

export const songUsageSchema = z.object({
  items: z.array(z.object({ serviceId: idSchema, title: z.string(), startsAt: isoDateTimeSchema })),
});

// ---------------------------------------------------------------------------------------------
// Serving teams, rosters and blockouts
// ---------------------------------------------------------------------------------------------

/** Suggested serving teams and their positions. */
export const DEFAULT_SERVING_TEAMS: readonly { name: string; positions: readonly string[] }[] = [
  { name: 'Pemusik', positions: ['Pianis / Organis', 'Gitar', 'Bass', 'Drum'] },
  { name: 'Singers', positions: ['Worship Leader', 'Singer'] },
  { name: 'Multimedia', positions: ['Operator LCD', 'Sound System', 'Live Streaming'] },
  { name: 'Penerima Tamu', positions: ['Usher', 'Kolektan'] },
  { name: 'Penatua Bertugas', positions: ['Liturgos', 'Pembaca Alkitab', 'Doa Syafaat'] },
  { name: 'Guru Sekolah Minggu', positions: ['Guru Kelas', 'Pendamping'] },
];

export const TEAM_MEMBER_ROLES = ['member', 'leader'] as const;
export type TeamMemberRole = (typeof TEAM_MEMBER_ROLES)[number];

export const ROSTER_STATUSES = ['pending', 'accepted', 'declined'] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

export const ROSTER_STATUS_LABELS: Record<RosterStatus, LocalizedText> = {
  pending: { en: 'Waiting for reply', id: 'Menunggu konfirmasi' },
  accepted: { en: 'Accepted', id: 'Bersedia' },
  declined: { en: 'Declined', id: 'Berhalangan' },
};

export const ROSTER_CONFLICT_KINDS = [
  'double_booked',
  'blockout',
  'declined',
  'not_in_team',
] as const;
export type RosterConflictKind = (typeof ROSTER_CONFLICT_KINDS)[number];

export const ROSTER_CONFLICT_LABELS: Record<RosterConflictKind, LocalizedText> = {
  double_booked: { en: 'Already serving at this time', id: 'Sudah bertugas di waktu yang sama' },
  blockout: { en: 'Marked as unavailable', id: 'Menandai tidak bisa melayani' },
  declined: { en: 'Declined this service', id: 'Berhalangan untuk ibadah ini' },
  not_in_team: { en: 'Not a member of the team', id: 'Bukan anggota tim' },
};

export const servingPositionSchema = z.object({
  id: idSchema,
  teamId: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  needed: z.number().int().min(0),
  sortOrder: z.number().int(),
});
export type ServingPosition = z.infer<typeof servingPositionSchema>;

export const servingPositionInputSchema = z.object({
  name: requiredText(1, LIMITS.nameMax),
  description: optionalText(LIMITS.shortTextMax),
  needed: z.number().int().min(0).max(50).default(1),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});
export type ServingPositionInput = z.infer<typeof servingPositionInputSchema>;

export const servingTeamMemberSchema = personSummarySchema.extend({
  teamMemberId: idSchema,
  role: z.enum(TEAM_MEMBER_ROLES),
  positionIds: z.array(idSchema),
});
export type ServingTeamMember = z.infer<typeof servingTeamMemberSchema>;

export const servingTeamSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  groupId: idSchema.nullable(),
  isActive: z.boolean(),
  positions: z.array(servingPositionSchema),
  memberCount: z.number().int().nonnegative(),
});
export type ServingTeam = z.infer<typeof servingTeamSchema>;

export const servingTeamInputSchema = z.object({
  name: requiredText(2, LIMITS.nameMax),
  description: optionalText(LIMITS.longTextMax),
  color: optionalHexColor,
  groupId: idSchema.nullable().default(null),
  isActive: z.boolean().default(true),
});
export type ServingTeamInput = z.infer<typeof servingTeamInputSchema>;

export const servingTeamMemberInputSchema = z.object({
  personId: idSchema,
  role: z.enum(TEAM_MEMBER_ROLES).default('member'),
  positionIds: z.array(idSchema).max(WORSHIP_LIMITS.positionsPerTeamMax).default([]),
});
export type ServingTeamMemberInput = z.infer<typeof servingTeamMemberInputSchema>;

export const rosterConflictSchema = z.object({
  kind: z.enum(ROSTER_CONFLICT_KINDS),
  /** The other service for `double_booked`. */
  serviceId: idSchema.nullable(),
  detail: z.string().nullable(),
});
export type RosterConflict = z.infer<typeof rosterConflictSchema>;

export const rosterAssignmentSchema = z.object({
  id: idSchema,
  serviceId: idSchema,
  teamId: idSchema,
  teamName: z.string(),
  positionId: idSchema,
  positionName: z.string(),
  person: personSummarySchema,
  status: z.enum(ROSTER_STATUSES),
  declineReason: z.string().nullable(),
  respondedAt: isoDateTimeSchema.nullable(),
  notes: z.string().nullable(),
  conflicts: z.array(rosterConflictSchema),
});
export type RosterAssignment = z.infer<typeof rosterAssignmentSchema>;

export const rosterListSchema = z.object({ items: z.array(rosterAssignmentSchema) });

export const rosterAssignBodySchema = z.object({
  assignments: z
    .array(
      z.object({
        positionId: idSchema,
        personId: idSchema,
        notes: optionalText(LIMITS.shortTextMax),
      }),
    )
    .min(1)
    .max(WORSHIP_LIMITS.rosterBulkMax),
  /** Assign even when a conflict was found (the warning was shown and accepted). */
  ignoreConflicts: z.boolean().default(false),
});
export type RosterAssignBody = z.infer<typeof rosterAssignBodySchema>;

export const rosterRespondBodySchema = z
  .object({
    status: z.enum(['accepted', 'declined']),
    reason: optionalText(LIMITS.shortTextMax),
  })
  .refine((value) => value.status !== 'declined' || !!value.reason, {
    message: 'Tell the scheduler why you cannot serve',
    path: ['reason'],
  });
export type RosterRespondBody = z.infer<typeof rosterRespondBodySchema>;

/** Without `fromServiceId` the latest earlier service of the same type (with a roster) is used. */
export const copyRosterBodySchema = z.object({ fromServiceId: idSchema.optional() });
export type CopyRosterBody = z.infer<typeof copyRosterBodySchema>;

export const rosterSuggestionSchema = z.object({
  positionId: idSchema,
  candidates: z.array(
    personSummarySchema.extend({
      timesServed: z.number().int().nonnegative(),
      lastServedAt: isoDateTimeSchema.nullable(),
      conflicts: z.array(rosterConflictSchema),
    }),
  ),
});
export type RosterSuggestion = z.infer<typeof rosterSuggestionSchema>;

export const volunteerBlockoutSchema = z.object({
  id: idSchema,
  personId: idSchema,
  person: personSummarySchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  reason: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type VolunteerBlockout = z.infer<typeof volunteerBlockoutSchema>;

export const volunteerBlockoutInputSchema = z
  .object({
    personId: idSchema.optional(),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    reason: optionalText(LIMITS.shortTextMax),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  });
export type VolunteerBlockoutInput = z.infer<typeof volunteerBlockoutInputSchema>;

export const myScheduleSchema = z.object({
  items: z.array(
    rosterAssignmentSchema.extend({
      serviceTitle: z.string(),
      serviceStartsAt: isoDateTimeSchema,
      serviceLocation: z.string().nullable(),
    }),
  ),
});
export type MySchedule = z.infer<typeof myScheduleSchema>;

/**
 * Whoever holds `volunteers.schedule` schedules every team; a team leader schedules only the
 * teams they lead. Pass the ids of the teams the caller leads.
 */
export const canScheduleTeam = (
  access: Pick<AccessLike, 'permissions'>,
  ledTeamIds: readonly string[],
  teamId: string,
): boolean => has(access, 'volunteers.schedule') || ledTeamIds.includes(teamId);

// ---------------------------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------------------------

export const serviceTypeResponseSchema = z.object({ serviceType: serviceTypeSchema });

export const worshipServiceResponseSchema = z.object({ service: worshipServiceSchema });

export const worshipServiceDetailSchema = z.object({
  service: worshipServiceSchema,
  liturgy: z.array(liturgyItemSchema),
  roster: z.array(rosterAssignmentSchema),
  /** Whether the caller may edit the plan and the liturgy. */
  canManage: z.boolean(),
  /** Teams the caller may schedule (every team with `volunteers.schedule`, else the ones led). */
  schedulableTeamIds: z.array(idSchema),
});
export type WorshipServiceDetail = z.infer<typeof worshipServiceDetailSchema>;

export const liturgyResponseSchema = z.object({
  items: z.array(liturgyItemSchema),
  totalMinutes: z.number().int().nonnegative(),
});
export type LiturgyResponse = z.infer<typeof liturgyResponseSchema>;

export const songResponseSchema = z.object({ song: songSchema });

export const songDetailSchema = z.object({
  song: songSchema,
  usage: songUsageSchema.shape.items,
});
export type SongDetail = z.infer<typeof songDetailSchema>;

export const songTagsSchema = z.object({
  items: z.array(z.object({ tag: z.string(), count: z.number().int().nonnegative() })),
});

export const servingTeamListSchema = z.object({ items: z.array(servingTeamSchema) });

export const servingTeamResponseSchema = z.object({ team: servingTeamSchema });

export const servingTeamDetailSchema = z.object({
  team: servingTeamSchema,
  members: z.array(servingTeamMemberSchema),
  /** The caller may edit positions and members (`services.manage` or a leader of the team). */
  canManage: z.boolean(),
  /** The caller may put this team on rosters. */
  canSchedule: z.boolean(),
});
export type ServingTeamDetail = z.infer<typeof servingTeamDetailSchema>;

export const servingPositionResponseSchema = z.object({ position: servingPositionSchema });

export const servingTeamMemberUpdateSchema = servingTeamMemberInputSchema.omit({ personId: true });
export type ServingTeamMemberUpdate = z.infer<typeof servingTeamMemberUpdateSchema>;

export const servingTeamMemberResponseSchema = z.object({ member: servingTeamMemberSchema });

export const teamParamsSchema = z.object({ churchId: idSchema, id: idSchema, itemId: idSchema });

export const rosterAssignmentResponseSchema = z.object({ assignment: rosterAssignmentSchema });

export const rosterAssignResultSchema = z.object({
  items: z.array(rosterAssignmentSchema),
  /** Requested assignments that already existed (or, when copying, could not be made). */
  skipped: z.number().int().nonnegative(),
});
export type RosterAssignResult = z.infer<typeof rosterAssignResultSchema>;

export const rosterSuggestionQuerySchema = z.object({ positionId: idSchema.optional() });

export const rosterSuggestionsSchema = z.object({ items: z.array(rosterSuggestionSchema) });

export const autoFillRosterBodySchema = z.object({
  /** Only fill this team's positions; all teams the caller may schedule otherwise. */
  teamId: idSchema.optional(),
});
export type AutoFillRosterBody = z.infer<typeof autoFillRosterBodySchema>;

export const volunteerBlockoutListQuerySchema = z.object({
  /** Defaults to the caller's own person record. */
  personId: idSchema.optional(),
  /** `team` lists the blockouts of everyone the caller schedules. */
  scope: z.enum(['mine', 'team']).default('mine'),
});
export type VolunteerBlockoutListQuery = z.infer<typeof volunteerBlockoutListQuerySchema>;

export const volunteerBlockoutListSchema = z.object({ items: z.array(volunteerBlockoutSchema) });

export const volunteerBlockoutResponseSchema = z.object({ blockout: volunteerBlockoutSchema });

export const myScheduleQuerySchema = z.object({
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
});
export type MyScheduleQuery = z.infer<typeof myScheduleQuerySchema>;

export const myScheduleItemSchema = myScheduleSchema.shape.items.element;
export type MyScheduleItem = z.infer<typeof myScheduleItemSchema>;

export const worshipMeSchema = z.object({
  personId: idSchema.nullable(),
  /** Teams the caller leads (team leader scope). */
  ledTeamIds: z.array(idSchema),
  memberTeamIds: z.array(idSchema),
  /** Upcoming assignments still waiting for the caller's reply. */
  pendingCount: z.number().int().nonnegative(),
});
export type WorshipMe = z.infer<typeof worshipMeSchema>;

export const worshipOverviewSchema = z.object({
  upcoming: z.array(worshipServiceSchema),
  stats: z.object({
    /** Planned services in the next four weeks. */
    upcomingServices: z.number().int().nonnegative(),
    /** Positions still needed in teams already on those rosters. */
    openPositions: z.number().int().nonnegative(),
    pendingResponses: z.number().int().nonnegative(),
    declined: z.number().int().nonnegative(),
    songs: z.number().int().nonnegative(),
    teams: z.number().int().nonnegative(),
  }),
  mySchedule: z.array(myScheduleItemSchema),
  /** Declined or conflicting assignments the caller can fix. */
  attention: z.array(myScheduleItemSchema),
});
export type WorshipOverview = z.infer<typeof worshipOverviewSchema>;

export const worshipPeopleQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const worshipPeopleSchema = z.object({ items: z.array(personSummarySchema) });

export const worshipSetupResultSchema = z.object({
  serviceTypes: z.number().int().nonnegative(),
  teams: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------------------------
// Rules shared by the API and the interface
// ---------------------------------------------------------------------------------------------

/** Plan services, the liturgy, songs and the team structure. */
export const canManageServices = (access: Pick<AccessLike, 'permissions'>): boolean =>
  has(access, 'services.manage');

/**
 * Edit a team's positions and members: `services.manage`, or a leader of that team. Making
 * someone a leader always needs `services.manage`.
 */
export const canManageServingTeam = (
  access: Pick<AccessLike, 'permissions'>,
  ledTeamIds: readonly string[],
  teamId: string,
): boolean => has(access, 'services.manage') || ledTeamIds.includes(teamId);

/** Only the scheduled person answers an assignment; schedulers can record it for them. */
export const canRespondToAssignment = (
  access: Pick<AccessLike, 'permissions' | 'personId'>,
  ledTeamIds: readonly string[],
  assignment: { personId: string; teamId: string },
): boolean =>
  (!!access.personId && access.personId === assignment.personId) ||
  canScheduleTeam(access, ledTeamIds, assignment.teamId);

/** Volunteers keep their own blockout dates; schedulers keep anyone's. */
export const canManageBlockout = (
  access: Pick<AccessLike, 'permissions' | 'personId'>,
  personId: string,
): boolean =>
  (!!access.personId && access.personId === personId) || has(access, 'volunteers.schedule');

/** Fallback length of a service without an end time, in minutes. */
export const DEFAULT_SERVICE_MINUTES = 120;

/** Sum of the liturgy item durations (items without a duration count as zero). */
export const liturgyTotalMinutes = (items: readonly { durationMinutes: number | null }[]): number =>
  items.reduce((total, item) => total + (item.durationMinutes ?? 0), 0);

/** The time a service occupies, as epoch milliseconds. */
export const serviceWindow = (
  service: { startsAt: string; endsAt: string | null },
  fallbackMinutes: number = DEFAULT_SERVICE_MINUTES,
): { start: number; end: number } => {
  const start = new Date(service.startsAt).getTime();
  const end = service.endsAt
    ? new Date(service.endsAt).getTime()
    : start + fallbackMinutes * 60_000;
  return { start, end: Math.max(end, start + 1) };
};

export const windowsOverlap = (
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean => a.start < b.end && b.start < a.end;

/** The calendar day (`YYYY-MM-DD`) of an instant in a time zone. */
export const localDateOf = (iso: string, timeZone: string): string => {
  const date = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

/** Whether a blockout (inclusive day range) covers a day. */
export const blockoutCovers = (
  blockout: { startDate: string; endDate: string },
  day: string,
): boolean => blockout.startDate <= day && day <= blockout.endDate;

/** Weeks a song should rest before it is sung again. */
export const SONG_REST_WEEKS = 4;

/** Whether a song was sung recently enough that choosing it again repeats it. */
export const songRecentlyUsed = (
  lastUsedAt: string | null,
  at: string | number | Date = Date.now(),
  weeks: number = SONG_REST_WEEKS,
): boolean => {
  if (!lastUsedAt) return false;
  const reference = new Date(at).getTime();
  const used = new Date(lastUsedAt).getTime();
  return reference - used < weeks * 7 * 86_400_000 && used <= reference;
};

/**
 * Orders candidates for a position by rotation fairness: people without conflicts first, then
 * whoever served least in the rotation window, then whoever served longest ago, then by name.
 */
export const rankRosterCandidates = <
  T extends {
    timesServed: number;
    lastServedAt: string | null;
    conflicts: readonly unknown[];
    firstName: string;
    lastName: string | null;
  },
>(
  candidates: readonly T[],
): T[] =>
  [...candidates].sort((a, b) => {
    const conflicted = Number(a.conflicts.length > 0) - Number(b.conflicts.length > 0);
    if (conflicted !== 0) return conflicted;
    if (a.timesServed !== b.timesServed) return a.timesServed - b.timesServed;
    const lastA = a.lastServedAt ? new Date(a.lastServedAt).getTime() : 0;
    const lastB = b.lastServedAt ? new Date(b.lastServedAt).getTime() : 0;
    if (lastA !== lastB) return lastA - lastB;
    return `${a.firstName} ${a.lastName ?? ''}`.localeCompare(
      `${b.firstName} ${b.lastName ?? ''}`,
      'id',
    );
  });
