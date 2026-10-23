// Zod schemas, enums and labels owned by the care module. Only that module edits this file;
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
  optionalEmail,
  optionalText,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
} from './common';
import { personSummarySchema } from './person';

export const CARE_LIMITS = {
  caregiversMax: 20,
  visitorsPerVisitMax: 20,
  prayerTitleMax: 120,
  prayerBodyMax: 2000,
  noteBodyMax: 10_000,
  testimonyMax: 2000,
} as const;

// ---------------------------------------------------------------------------------------------
// Enumerations and labels
// ---------------------------------------------------------------------------------------------

export const CARE_CATEGORIES = [
  'visitation',
  'counseling',
  'hospital',
  'grief',
  'financial_aid',
  'other',
] as const;
export type CareCategory = (typeof CARE_CATEGORIES)[number];

export const CARE_CATEGORY_LABELS: Record<CareCategory, LocalizedText> = {
  visitation: { en: 'Visitation', id: 'Perkunjungan' },
  counseling: { en: 'Counseling', id: 'Konseling' },
  hospital: { en: 'Illness / hospital', id: 'Sakit / rumah sakit' },
  grief: { en: 'Grief', id: 'Penghiburan duka' },
  financial_aid: { en: 'Financial aid', id: 'Bantuan diakonia' },
  other: { en: 'Other', id: 'Lainnya' },
};

export const CARE_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type CarePriority = (typeof CARE_PRIORITIES)[number];

export const CARE_PRIORITY_LABELS: Record<CarePriority, LocalizedText> = {
  low: { en: 'Low', id: 'Rendah' },
  normal: { en: 'Normal', id: 'Normal' },
  high: { en: 'High', id: 'Tinggi' },
  urgent: { en: 'Urgent', id: 'Mendesak' },
};

export const CARE_STATUSES = ['open', 'in_progress', 'closed'] as const;
export type CareStatus = (typeof CARE_STATUSES)[number];

export const isCareStatus = (value: string): value is CareStatus =>
  (CARE_STATUSES as readonly string[]).includes(value);

export const CARE_STATUS_LABELS: Record<CareStatus, LocalizedText> = {
  open: { en: 'Open', id: 'Baru' },
  in_progress: { en: 'In progress', id: 'Sedang didampingi' },
  closed: { en: 'Closed', id: 'Selesai' },
};

export const CARE_CONFIDENTIALITY_LEVELS = ['normal', 'confidential'] as const;
export type CareConfidentiality = (typeof CARE_CONFIDENTIALITY_LEVELS)[number];

export const CARE_CONFIDENTIALITY_LABELS: Record<CareConfidentiality, LocalizedText> = {
  normal: { en: 'Care team', id: 'Tim pastoral' },
  confidential: {
    en: 'Confidential: assigned caregivers only',
    id: 'Rahasia: hanya pendamping yang ditugaskan',
  },
};

export const CARE_NOTE_KINDS = ['note', 'call', 'visit', 'meeting', 'status_change'] as const;
export type CareNoteKind = (typeof CARE_NOTE_KINDS)[number];

export const CARE_NOTE_KIND_LABELS: Record<CareNoteKind, LocalizedText> = {
  note: { en: 'Note', id: 'Catatan' },
  call: { en: 'Phone call', id: 'Telepon' },
  visit: { en: 'Visit', id: 'Kunjungan' },
  meeting: { en: 'Meeting', id: 'Pertemuan' },
  status_change: { en: 'Status change', id: 'Perubahan status' },
};

export const PRAYER_VISIBILITIES = ['church', 'care_team', 'pastors'] as const;
export type PrayerVisibility = (typeof PRAYER_VISIBILITIES)[number];

export const PRAYER_VISIBILITY_LABELS: Record<PrayerVisibility, LocalizedText> = {
  church: { en: 'Whole church (after review)', id: 'Seluruh jemaat (setelah ditinjau)' },
  care_team: { en: 'Care team only', id: 'Hanya tim pastoral' },
  pastors: { en: 'Pastors only', id: 'Hanya pendeta' },
};

export const PRAYER_MODERATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type PrayerModerationStatus = (typeof PRAYER_MODERATION_STATUSES)[number];

export const PRAYER_MODERATION_LABELS: Record<PrayerModerationStatus, LocalizedText> = {
  pending: { en: 'Waiting for review', id: 'Menunggu ditinjau' },
  approved: { en: 'Shared', id: 'Dibagikan' },
  rejected: { en: 'Not shared', id: 'Tidak dibagikan' },
};

export const FOLLOW_UP_STAGES = ['new', 'contacted', 'visited', 'joined', 'closed'] as const;
export type FollowUpStage = (typeof FOLLOW_UP_STAGES)[number];

export const FOLLOW_UP_STAGE_LABELS: Record<FollowUpStage, LocalizedText> = {
  new: { en: 'New visitor', id: 'Tamu baru' },
  contacted: { en: 'Contacted', id: 'Sudah dihubungi' },
  visited: { en: 'Visited', id: 'Sudah dikunjungi' },
  joined: { en: 'Joined', id: 'Bergabung' },
  closed: { en: 'Closed', id: 'Ditutup' },
};

export const CARE_TASK_STATUSES = ['open', 'done', 'cancelled'] as const;
export type CareTaskStatus = (typeof CARE_TASK_STATUSES)[number];

export const CARE_TASK_STATUS_LABELS: Record<CareTaskStatus, LocalizedText> = {
  open: { en: 'To do', id: 'Belum selesai' },
  done: { en: 'Done', id: 'Selesai' },
  cancelled: { en: 'Cancelled', id: 'Dibatalkan' },
};

export const DIAKONIA_CATEGORIES = [
  'food',
  'health',
  'education',
  'housing',
  'emergency',
  'funeral',
  'other',
] as const;
export type DiakoniaCategory = (typeof DIAKONIA_CATEGORIES)[number];

export const DIAKONIA_CATEGORY_LABELS: Record<DiakoniaCategory, LocalizedText> = {
  food: { en: 'Food', id: 'Sembako' },
  health: { en: 'Health', id: 'Kesehatan' },
  education: { en: 'Education', id: 'Pendidikan' },
  housing: { en: 'Housing', id: 'Tempat tinggal' },
  emergency: { en: 'Emergency', id: 'Darurat / bencana' },
  funeral: { en: 'Funeral', id: 'Kedukaan' },
  other: { en: 'Other', id: 'Lainnya' },
};

export const DIAKONIA_FORMS = ['cash', 'goods', 'service'] as const;
export type DiakoniaForm = (typeof DIAKONIA_FORMS)[number];

export const DIAKONIA_FORM_LABELS: Record<DiakoniaForm, LocalizedText> = {
  cash: { en: 'Money', id: 'Uang' },
  goods: { en: 'Goods', id: 'Barang' },
  service: { en: 'Service', id: 'Jasa' },
};

// ---------------------------------------------------------------------------------------------
// Access rules
// ---------------------------------------------------------------------------------------------

/** The care team: anyone who may see normal care cases, visits and follow-ups. */
export const CARE_TEAM_PERMISSIONS = ['care.view', 'care.manage', 'care.confidential'] as const;

export const isCareTeam = (access: Pick<AccessLike, 'permissions'>): boolean =>
  hasAny(access, CARE_TEAM_PERMISSIONS);

/** Prayer moderators approve requests before the whole church sees them. */
export const canModeratePrayer = (access: Pick<AccessLike, 'permissions'>): boolean =>
  hasAny(access, ['prayer.moderate', 'care.manage']);

export const canViewDiakonia = (access: Pick<AccessLike, 'permissions'>): boolean =>
  hasAny(access, ['diakonia.view', 'diakonia.manage']);

export const canManageDiakonia = (access: Pick<AccessLike, 'permissions'>): boolean =>
  has(access, 'diakonia.manage');

/**
 * Who may open a care case and read its notes. Confidential cases are limited to their assigned
 * caregivers and `care.confidential` holders; administrators get no exception.
 */
export const canReadCareCase = (
  access: AccessLike,
  careCase: { confidentiality: CareConfidentiality },
  caregiverUserIds: readonly string[],
): boolean => {
  if (caregiverUserIds.includes(access.userId)) return true;
  if (careCase.confidentiality === 'confidential') return has(access, 'care.confidential');
  return isCareTeam(access);
};

/** Who may change a case, add notes and record visits for it. */
export const canManageCareCase = (
  access: AccessLike,
  careCase: { confidentiality: CareConfidentiality },
  caregiverUserIds: readonly string[],
): boolean =>
  caregiverUserIds.includes(access.userId) ||
  (has(access, 'care.manage') &&
    (careCase.confidentiality === 'normal' || has(access, 'care.confidential')));

/**
 * Who may assign caregivers and delete the case. Assigning grants access to the case, so it
 * needs `care.manage` as well as access to the case itself.
 */
export const canAdministerCareCase = (
  access: AccessLike,
  careCase: { confidentiality: CareConfidentiality },
  caregiverUserIds: readonly string[],
): boolean =>
  has(access, 'care.manage') &&
  (careCase.confidentiality === 'normal' ||
    has(access, 'care.confidential') ||
    caregiverUserIds.includes(access.userId));

/**
 * Lowering a confidential case to the care team exposes its notes to everyone holding
 * `care.view`, so only `care.confidential` holders may do it.
 */
export const canChangeCareConfidentiality = (
  access: AccessLike,
  from: CareConfidentiality,
  to: CareConfidentiality,
): boolean => from === to || to === 'confidential' || has(access, 'care.confidential');

/**
 * Who may read a visit and its summary. A visit is readable by the care team (confidential ones
 * only by `care.confidential` holders), by whoever recorded it, by the visitors themselves and by
 * the caregivers of its case.
 */
export const canReadCareVisit = (
  access: AccessLike,
  visit: {
    confidentiality: CareConfidentiality;
    createdBy: string | null;
    visitorPersonIds: readonly string[];
  },
  caseCaregiverUserIds: readonly string[] = [],
): boolean => {
  if (visit.createdBy === access.userId) return true;
  if (access.personId && visit.visitorPersonIds.includes(access.personId)) return true;
  if (caseCaregiverUserIds.includes(access.userId)) return true;
  if (visit.confidentiality === 'confidential') return has(access, 'care.confidential');
  return isCareTeam(access);
};

/**
 * Who may change or delete a visit: whoever recorded it, the caregivers of its case, and care
 * managers (for confidential visits only with `care.confidential`).
 */
export const canManageCareVisit = (
  access: AccessLike,
  visit: { confidentiality: CareConfidentiality; createdBy: string | null },
  caseCaregiverUserIds: readonly string[] = [],
): boolean =>
  visit.createdBy === access.userId ||
  caseCaregiverUserIds.includes(access.userId) ||
  (has(access, 'care.manage') &&
    (visit.confidentiality === 'normal' || has(access, 'care.confidential')));

/** Whether a prayer request is visible to the caller. */
export const canViewPrayerRequest = (
  access: AccessLike,
  request: {
    submittedBy: string | null;
    visibility: PrayerVisibility;
    moderationStatus: PrayerModerationStatus;
  },
): boolean => {
  if (request.submittedBy === access.userId) return true;
  if (request.visibility === 'pastors') return has(access, 'care.confidential');
  if (request.visibility === 'care_team') {
    return hasAny(access, [...CARE_TEAM_PERMISSIONS, 'prayer.moderate']);
  }
  if (request.moderationStatus === 'approved') return true;
  return canModeratePrayer(access);
};

/** Anonymous requests show the requester only to moderators and the requester. */
export const canSeePrayerRequester = (
  access: AccessLike,
  request: { submittedBy: string | null; isAnonymous: boolean },
): boolean =>
  !request.isAnonymous || request.submittedBy === access.userId || canModeratePrayer(access);

/** Requesters edit, answer and withdraw their own requests; moderators any they can see. */
export const canManagePrayerRequest = (
  access: AccessLike,
  request: { submittedBy: string | null },
): boolean => request.submittedBy === access.userId || canModeratePrayer(access);

/** Whether a request is shown to the whole church (approved and public). */
export const isPrayerRequestPublic = (request: {
  visibility: PrayerVisibility;
  moderationStatus: PrayerModerationStatus;
}): boolean => request.visibility === 'church' && request.moderationStatus === 'approved';

/** Who may move a visitor through the pipeline: care managers and the assigned person. */
export const canManageFollowUp = (
  access: AccessLike,
  followUp: { assignedUserId: string | null },
): boolean => has(access, 'care.manage') || followUp.assignedUserId === access.userId;

/** Who may edit or delete a task; assignees may only mark it done or reopen it. */
export const canEditCareTask = (access: AccessLike, task: { createdBy: string | null }): boolean =>
  has(access, 'care.manage') || task.createdBy === access.userId;

export const canCompleteCareTask = (
  access: AccessLike,
  task: { createdBy: string | null; assignedUserId: string | null },
): boolean => task.assignedUserId === access.userId || canEditCareTask(access, task);

// ---------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------

export const caregiverSchema = z.object({
  userId: idSchema,
  name: z.string(),
  avatarUrl: z.string().nullable(),
});
export type Caregiver = z.infer<typeof caregiverSchema>;

export const householdRefSchema = z.object({ id: idSchema, name: z.string() });
export type HouseholdRef = z.infer<typeof householdRefSchema>;

/** A member who can be assigned as caregiver, visitor follow-up owner or task assignee. */
export const careTeamMemberSchema = caregiverSchema.extend({
  personId: idSchema.nullable(),
  /** Holds a care permission (sees normal cases); others only see what they are assigned. */
  isCareTeam: z.boolean(),
  canReadConfidential: z.boolean(),
});
export type CareTeamMember = z.infer<typeof careTeamMemberSchema>;

export const careTeamListSchema = z.object({ items: z.array(careTeamMemberSchema) });

export const householdLookupQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
});

export const householdLookupListSchema = z.object({ items: z.array(householdRefSchema) });

export const careTeamQuerySchema = z.object({
  /** `all` lists every active member (care managers only); `team` the care team. */
  scope: z.enum(['team', 'all']).default('team'),
});
export type CareTeamQuery = z.infer<typeof careTeamQuerySchema>;

export const careNoteParamsSchema = z.object({
  churchId: idSchema,
  id: idSchema,
  noteId: idSchema,
});

const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

// ---------------------------------------------------------------------------------------------
// Care cases and notes
// ---------------------------------------------------------------------------------------------

/** List rows never carry the description or notes. */
export const careCaseSummarySchema = z.object({
  id: idSchema,
  person: personSummarySchema.nullable(),
  household: householdRefSchema.nullable(),
  category: z.enum(CARE_CATEGORIES),
  priority: z.enum(CARE_PRIORITIES),
  status: z.enum(CARE_STATUSES),
  confidentiality: z.enum(CARE_CONFIDENTIALITY_LEVELS),
  title: z.string(),
  nextActionDate: isoDateSchema.nullable(),
  caregivers: z.array(caregiverSchema),
  noteCount: z.number().int().nonnegative(),
  updatedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});
export type CareCaseSummary = z.infer<typeof careCaseSummarySchema>;

export const careCaseSchema = careCaseSummarySchema.extend({
  description: z.string().nullable(),
  nextActionNote: z.string().nullable(),
  closedAt: isoDateTimeSchema.nullable(),
  closedReason: z.string().nullable(),
  openedBy: caregiverSchema.nullable(),
  /** Change the case, add notes, record visits. */
  canManage: z.boolean(),
  /** Assign caregivers and delete the case. */
  canAdminister: z.boolean(),
  /** Make a confidential case visible to the whole care team. */
  canLowerConfidentiality: z.boolean(),
});
export type CareCase = z.infer<typeof careCaseSchema>;

export const careCaseInputSchema = z.object({
  personId: idSchema.nullable().default(null),
  householdId: idSchema.nullable().default(null),
  category: z.enum(CARE_CATEGORIES),
  priority: z.enum(CARE_PRIORITIES).default('normal'),
  status: z.enum(CARE_STATUSES).default('open'),
  confidentiality: z.enum(CARE_CONFIDENTIALITY_LEVELS).default('normal'),
  title: requiredText(2, LIMITS.nameMax),
  description: optionalText(CARE_LIMITS.noteBodyMax),
  nextActionDate: optionalDate,
  nextActionNote: optionalText(LIMITS.shortTextMax),
  caregiverUserIds: z.array(idSchema).max(CARE_LIMITS.caregiversMax).default([]),
});
export type CareCaseInput = z.infer<typeof careCaseInputSchema>;

export const careCaseUpdateSchema = careCaseInputSchema
  .omit({ caregiverUserIds: true })
  .extend({ closedReason: optionalText(LIMITS.shortTextMax) });
export type CareCaseUpdate = z.infer<typeof careCaseUpdateSchema>;

export const CARE_CASE_SORTS = ['updated', 'next_action', 'priority'] as const;
export type CareCaseSort = (typeof CARE_CASE_SORTS)[number];

export const careCaseListQuerySchema = paginationQuerySchema.extend({
  /** `active` is every status except closed. */
  status: z.enum([...CARE_STATUSES, 'active']).optional(),
  category: z.enum(CARE_CATEGORIES).optional(),
  priority: z.enum(CARE_PRIORITIES).optional(),
  confidentiality: z.enum(CARE_CONFIDENTIALITY_LEVELS).optional(),
  personId: idSchema.optional(),
  /** Only cases assigned to the caller. */
  mine: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  sort: z.enum(CARE_CASE_SORTS).default('updated'),
});
export type CareCaseListQuery = z.infer<typeof careCaseListQuerySchema>;

export const careCaseListSchema = paginatedSchema(careCaseSummarySchema);
export type CareCaseList = z.infer<typeof careCaseListSchema>;

export const careCaseResponseSchema = z.object({ case: careCaseSchema });

export const setCaregiversBodySchema = z.object({
  userIds: z.array(idSchema).max(CARE_LIMITS.caregiversMax),
});
export type SetCaregiversBody = z.infer<typeof setCaregiversBodySchema>;

export const careNoteSchema = z.object({
  id: idSchema,
  caseId: idSchema,
  kind: z.enum(CARE_NOTE_KINDS),
  /** For `status_change` notes, the new status. */
  body: z.string(),
  author: caregiverSchema.nullable(),
  canEdit: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type CareNote = z.infer<typeof careNoteSchema>;

/** People write notes, calls, visits and meetings; status changes are recorded automatically. */
export const CARE_NOTE_INPUT_KINDS = ['note', 'call', 'visit', 'meeting'] as const;

export const careNoteInputSchema = z.object({
  kind: z.enum(CARE_NOTE_INPUT_KINDS).default('note'),
  body: requiredText(1, CARE_LIMITS.noteBodyMax),
});
export type CareNoteInput = z.infer<typeof careNoteInputSchema>;

export const careNoteUpdateSchema = z.object({ body: requiredText(1, CARE_LIMITS.noteBodyMax) });
export type CareNoteUpdate = z.infer<typeof careNoteUpdateSchema>;

export const careNoteListSchema = z.object({ items: z.array(careNoteSchema) });

export const careNoteResponseSchema = z.object({ note: careNoteSchema });

// ---------------------------------------------------------------------------------------------
// Visits (perkunjungan)
// ---------------------------------------------------------------------------------------------

export const careVisitSchema = z.object({
  id: idSchema,
  caseId: idSchema.nullable(),
  person: personSummarySchema.nullable(),
  household: householdRefSchema.nullable(),
  visitDate: isoDateSchema,
  location: z.string().nullable(),
  /** Null in lists; only the detail carries it, for callers who may read the visit. */
  summary: z.string().nullable(),
  confidentiality: z.enum(CARE_CONFIDENTIALITY_LEVELS),
  followUpNeeded: z.boolean(),
  followUpNote: z.string().nullable(),
  visitors: z.array(personSummarySchema),
  otherVisitors: z.string().nullable(),
  createdBy: caregiverSchema.nullable(),
  canManage: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type CareVisit = z.infer<typeof careVisitSchema>;

export const careVisitInputSchema = z
  .object({
    caseId: idSchema.nullable().default(null),
    personId: idSchema.nullable().default(null),
    householdId: idSchema.nullable().default(null),
    visitDate: isoDateSchema,
    location: optionalText(LIMITS.shortTextMax),
    summary: optionalText(CARE_LIMITS.noteBodyMax),
    confidentiality: z.enum(CARE_CONFIDENTIALITY_LEVELS).default('normal'),
    followUpNeeded: z.boolean().default(false),
    followUpNote: optionalText(LIMITS.shortTextMax),
    visitorPersonIds: z.array(idSchema).max(CARE_LIMITS.visitorsPerVisitMax).default([]),
    otherVisitors: optionalText(LIMITS.shortTextMax),
  })
  .refine((value) => value.personId || value.householdId || value.caseId, {
    message: 'Choose who was visited',
    path: ['personId'],
  });
export type CareVisitInput = z.infer<typeof careVisitInputSchema>;

export const careVisitListQuerySchema = paginationQuerySchema.extend({
  personId: idSchema.optional(),
  householdId: idSchema.optional(),
  caseId: idSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  followUpNeeded: booleanQuery,
  /** Only visits the caller made. */
  mine: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type CareVisitListQuery = z.infer<typeof careVisitListQuerySchema>;

export const careVisitListSchema = paginatedSchema(careVisitSchema);
export type CareVisitList = z.infer<typeof careVisitListSchema>;

export const careVisitResponseSchema = z.object({ visit: careVisitSchema });

// ---------------------------------------------------------------------------------------------
// Prayer requests (pokok doa)
// ---------------------------------------------------------------------------------------------

export const prayerRequestSchema = z.object({
  id: idSchema,
  title: z.string(),
  body: z.string(),
  visibility: z.enum(PRAYER_VISIBILITIES),
  isAnonymous: z.boolean(),
  /** Null when anonymous and the caller may not see the requester. */
  requesterName: z.string().nullable(),
  requesterAvatarUrl: z.string().nullable(),
  moderationStatus: z.enum(PRAYER_MODERATION_STATUSES),
  /** Shown to the requester and moderators only. */
  moderationNote: z.string().nullable(),
  prayedCount: z.number().int().nonnegative(),
  prayedByMe: z.boolean(),
  answeredAt: isoDateTimeSchema.nullable(),
  testimony: z.string().nullable(),
  isMine: z.boolean(),
  canManage: z.boolean(),
  canModerate: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type PrayerRequest = z.infer<typeof prayerRequestSchema>;

export const prayerRequestInputSchema = z.object({
  title: requiredText(2, CARE_LIMITS.prayerTitleMax),
  body: requiredText(1, CARE_LIMITS.prayerBodyMax),
  visibility: z.enum(PRAYER_VISIBILITIES).default('church'),
  isAnonymous: z.boolean().default(false),
});
export type PrayerRequestInput = z.infer<typeof prayerRequestInputSchema>;

export const PRAYER_SCOPES = ['wall', 'mine', 'answered', 'moderation'] as const;
export type PrayerScope = (typeof PRAYER_SCOPES)[number];

export const prayerRequestListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PRAYER_MODERATION_STATUSES).optional(),
  scope: z.enum(PRAYER_SCOPES).default('wall'),
  visibility: z.enum(PRAYER_VISIBILITIES).optional(),
});
export type PrayerRequestListQuery = z.infer<typeof prayerRequestListQuerySchema>;

export const prayerRequestListSchema = paginatedSchema(prayerRequestSchema);
export type PrayerRequestList = z.infer<typeof prayerRequestListSchema>;

export const prayerRequestResponseSchema = z.object({ request: prayerRequestSchema });

export const moderatePrayerRequestBodySchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: optionalText(LIMITS.shortTextMax),
});
export type ModeratePrayerRequestBody = z.infer<typeof moderatePrayerRequestBodySchema>;

export const answerPrayerRequestBodySchema = z.object({
  testimony: optionalText(CARE_LIMITS.testimonyMax),
});
export type AnswerPrayerRequestBody = z.infer<typeof answerPrayerRequestBodySchema>;

export const prayResultSchema = z.object({
  prayedCount: z.number().int().nonnegative(),
  prayedByMe: z.boolean(),
});
export type PrayResult = z.infer<typeof prayResultSchema>;

/** One member's "I prayed" counts once per this many seconds, so a double tap is not two. */
export const PRAYER_REPEAT_SECONDS = 60;

// ---------------------------------------------------------------------------------------------
// Visitor follow-up and tasks
// ---------------------------------------------------------------------------------------------

/** Stages still in the pipeline; joined and closed are its two endings. */
export const FOLLOW_UP_ACTIVE_STAGES = ['new', 'contacted', 'visited'] as const;

export const visitorFollowUpSchema = z.object({
  id: idSchema,
  person: personSummarySchema,
  phone: z.string().nullable(),
  email: z.string().nullable(),
  stage: z.enum(FOLLOW_UP_STAGES),
  source: z.string().nullable(),
  firstVisitDate: isoDateSchema.nullable(),
  assignee: caregiverSchema.nullable(),
  notes: z.string().nullable(),
  closedReason: z.string().nullable(),
  stageChangedAt: isoDateTimeSchema,
  openTaskCount: z.number().int().nonnegative(),
  nextDueDate: isoDateSchema.nullable(),
  hasOverdueTask: z.boolean(),
  canManage: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type VisitorFollowUp = z.infer<typeof visitorFollowUpSchema>;

/** A first-time guest without a person record yet; it is created as a visitor. */
export const newVisitorSchema = z.object({
  firstName: requiredText(LIMITS.nameMin, LIMITS.nameMax),
  lastName: optionalText(LIMITS.nameMax),
  phone: optionalText(LIMITS.phoneMax),
  email: optionalEmail,
});
export type NewVisitor = z.infer<typeof newVisitorSchema>;

export const visitorFollowUpInputSchema = z
  .object({
    personId: idSchema.nullable().default(null),
    newVisitor: newVisitorSchema.nullable().default(null),
    stage: z.enum(FOLLOW_UP_STAGES).default('new'),
    source: optionalText(LIMITS.shortTextMax),
    firstVisitDate: optionalDate,
    assignedUserId: idSchema.nullable().default(null),
    notes: optionalText(LIMITS.longTextMax),
  })
  .refine((value) => !!value.personId !== !!value.newVisitor, {
    message: 'Choose a person or enter the new visitor',
    path: ['personId'],
  });
export type VisitorFollowUpInput = z.infer<typeof visitorFollowUpInputSchema>;

export const visitorFollowUpUpdateSchema = z.object({
  source: optionalText(LIMITS.shortTextMax),
  firstVisitDate: optionalDate,
  assignedUserId: idSchema.nullable().default(null),
  notes: optionalText(LIMITS.longTextMax),
});
export type VisitorFollowUpUpdate = z.infer<typeof visitorFollowUpUpdateSchema>;

export const moveFollowUpBodySchema = z
  .object({
    stage: z.enum(FOLLOW_UP_STAGES),
    closedReason: optionalText(LIMITS.shortTextMax),
  })
  .refine((value) => value.stage !== 'closed' || !!value.closedReason, {
    message: 'Say why the follow-up is closed',
    path: ['closedReason'],
  });
export type MoveFollowUpBody = z.infer<typeof moveFollowUpBodySchema>;

/** Joined and closed follow-ups stay on the board this long. */
export const FOLLOW_UP_ENDED_VISIBLE_DAYS = 60;

export const visitorFollowUpListQuerySchema = z.object({
  stage: z.enum(FOLLOW_UP_STAGES).optional(),
  assignedUserId: idSchema.optional(),
  /** Only follow-ups assigned to the caller. */
  mine: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
});
export type VisitorFollowUpListQuery = z.infer<typeof visitorFollowUpListQuerySchema>;

export const visitorFollowUpListSchema = z.object({
  items: z.array(visitorFollowUpSchema),
  /** Follow-ups per stage, ignoring the stage filter. */
  counts: z.record(z.enum(FOLLOW_UP_STAGES), z.number().int().nonnegative()),
});
export type VisitorFollowUpList = z.infer<typeof visitorFollowUpListSchema>;

export const visitorFollowUpResponseSchema = z.object({ followUp: visitorFollowUpSchema });

export const careTaskSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  dueDate: isoDateSchema.nullable(),
  status: z.enum(CARE_TASK_STATUSES),
  isOverdue: z.boolean(),
  assignee: caregiverSchema.nullable(),
  followUpId: idSchema.nullable(),
  caseId: idSchema.nullable(),
  /** The linked case title, or null when the caller may not read the case. */
  caseTitle: z.string().nullable(),
  person: personSummarySchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  canEdit: z.boolean(),
  canComplete: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type CareTask = z.infer<typeof careTaskSchema>;

export const careTaskInputSchema = z.object({
  title: requiredText(2, LIMITS.shortTextMax),
  description: optionalText(LIMITS.longTextMax),
  dueDate: optionalDate,
  assignedUserId: idSchema.nullable().default(null),
  followUpId: idSchema.nullable().default(null),
  caseId: idSchema.nullable().default(null),
  personId: idSchema.nullable().default(null),
});
export type CareTaskInput = z.infer<typeof careTaskInputSchema>;

/** A task stays linked to its case or follow-up; everything else can change. */
export const careTaskUpdateSchema = careTaskInputSchema.omit({ followUpId: true, caseId: true });
export type CareTaskUpdate = z.infer<typeof careTaskUpdateSchema>;

export const updateCareTaskStatusBodySchema = z.object({ status: z.enum(CARE_TASK_STATUSES) });
export type UpdateCareTaskStatusBody = z.infer<typeof updateCareTaskStatusBodySchema>;

export const careTaskListQuerySchema = z.object({
  scope: z.enum(['mine', 'all']).default('mine'),
  status: z.enum(CARE_TASK_STATUSES).optional(),
  overdue: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  followUpId: idSchema.optional(),
  caseId: idSchema.optional(),
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
});
export type CareTaskListQuery = z.infer<typeof careTaskListQuerySchema>;

/** Largest task list returned at once; open tasks first, by due date. */
export const CARE_TASK_LIST_MAX = 200;

export const careTaskListSchema = z.object({ items: z.array(careTaskSchema) });
export type CareTaskList = z.infer<typeof careTaskListSchema>;

export const careTaskResponseSchema = z.object({ task: careTaskSchema });

/** Overdue when open and due before `today` (YYYY-MM-DD in the church time zone). */
export const isCareTaskOverdue = (
  task: { status: CareTaskStatus; dueDate: string | null },
  today: string,
): boolean => task.status === 'open' && !!task.dueDate && task.dueDate < today;

// ---------------------------------------------------------------------------------------------
// Diakonia aid
// ---------------------------------------------------------------------------------------------

export const diakoniaAidSchema = z.object({
  id: idSchema,
  person: personSummarySchema.nullable(),
  household: householdRefSchema.nullable(),
  caseId: idSchema.nullable(),
  recipientName: z.string().nullable(),
  category: z.enum(DIAKONIA_CATEGORIES),
  form: z.enum(DIAKONIA_FORMS),
  description: z.string().nullable(),
  amount: z.number().int().nullable(),
  givenAt: isoDateSchema,
  financeReference: z.string().nullable(),
  voidedAt: isoDateTimeSchema.nullable(),
  voidReason: z.string().nullable(),
  createdBy: caregiverSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type DiakoniaAid = z.infer<typeof diakoniaAidSchema>;

export const diakoniaAidInputSchema = z
  .object({
    personId: idSchema.nullable().default(null),
    householdId: idSchema.nullable().default(null),
    caseId: idSchema.nullable().default(null),
    recipientName: optionalText(LIMITS.nameMax),
    category: z.enum(DIAKONIA_CATEGORIES),
    form: z.enum(DIAKONIA_FORMS).default('cash'),
    description: optionalText(LIMITS.longTextMax),
    amount: moneySchema.nullable().default(null),
    givenAt: isoDateSchema,
    financeReference: optionalText(LIMITS.shortTextMax),
  })
  .refine((value) => value.personId || value.householdId || value.recipientName, {
    message: 'Choose the recipient',
    path: ['personId'],
  });
export type DiakoniaAidInput = z.infer<typeof diakoniaAidInputSchema>;

export const voidDiakoniaAidBodySchema = z.object({
  reason: requiredText(3, LIMITS.shortTextMax),
});
export type VoidDiakoniaAidBody = z.infer<typeof voidDiakoniaAidBodySchema>;

export const diakoniaAidListQuerySchema = paginationQuerySchema.extend({
  category: z.enum(DIAKONIA_CATEGORIES).optional(),
  form: z.enum(DIAKONIA_FORMS).optional(),
  personId: idSchema.optional(),
  caseId: idSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  includeVoided: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type DiakoniaAidListQuery = z.infer<typeof diakoniaAidListQuerySchema>;

export const diakoniaAidListSchema = paginatedSchema(diakoniaAidSchema).extend({
  /** Totals of the filtered, non-voided records (all pages). */
  summary: z.object({
    count: z.number().int().nonnegative(),
    amount: z.number().int().nonnegative(),
    recipients: z.number().int().nonnegative(),
  }),
});
export type DiakoniaAidList = z.infer<typeof diakoniaAidListSchema>;

export const diakoniaAidResponseSchema = z.object({ aid: diakoniaAidSchema });

// ---------------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------------

export const careOverviewSchema = z.object({
  today: isoDateSchema,
  cases: z.object({
    active: z.number().int().nonnegative(),
    urgent: z.number().int().nonnegative(),
    mine: z.number().int().nonnegative(),
    /** Next actions due today or earlier. */
    due: z.number().int().nonnegative(),
  }),
  /** Readable active cases with a next action in the coming week (or overdue). */
  upcoming: z.array(careCaseSummarySchema),
  tasks: z.object({
    open: z.number().int().nonnegative(),
    overdue: z.number().int().nonnegative(),
    dueToday: z.number().int().nonnegative(),
  }),
  prayer: z.object({
    active: z.number().int().nonnegative(),
    answered: z.number().int().nonnegative(),
    mine: z.number().int().nonnegative(),
    /** Null unless the caller moderates. */
    pending: z.number().int().nonnegative().nullable(),
  }),
  /** Null unless the caller is on the care team. */
  visits: z
    .object({
      thisMonth: z.number().int().nonnegative(),
      followUpNeeded: z.number().int().nonnegative(),
    })
    .nullable(),
  followUps: z.record(z.enum(FOLLOW_UP_STAGES), z.number().int().nonnegative()).nullable(),
  /** Null unless the caller may view diakonia. */
  diakonia: z
    .object({
      thisMonthCount: z.number().int().nonnegative(),
      thisMonthAmount: z.number().int().nonnegative(),
    })
    .nullable(),
});
export type CareOverview = z.infer<typeof careOverviewSchema>;
