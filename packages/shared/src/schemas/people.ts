// Zod schemas, enums and labels owned by the people module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import {
  GENDERS,
  GROUP_TYPES,
  LIMITS,
  type Gender,
  type GroupType,
  type MaritalStatus,
  type PersonMembershipStatus,
} from '../constants';
import type { LocalizedText } from '../localized';
import { canGrant, has, type AccessLike, type Permission } from '../permissions';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  optionalHexColor,
  optionalText,
  optionalUrl,
  paginatedSchema,
  requiredText,
} from './common';
import { groupInputSchema, groupListQuerySchema, groupMemberSchema, groupSchema } from './group';
import {
  personDetailSchema,
  personInputSchema,
  personListQuerySchema,
  personSchema,
  personSummarySchema,
} from './person';

export const PEOPLE_LIMITS = {
  householdMembersMax: 30,
  tagsPerPersonMax: 30,
  tagsMax: 200,
  areasMax: 500,
  customFieldsMax: 50,
  customFieldOptionsMax: 50,
  customFieldKeyMax: 40,
  customFieldValueMax: 1000,
  importRowsMax: LIMITS.csvRowsMax,
  joinRequestMessageMax: 500,
  groupCapacityMax: 10_000,
} as const;

// ---------------------------------------------------------------------------------------------
// Labels shared by the directory, groups and households
// ---------------------------------------------------------------------------------------------

export const GROUP_TYPE_TEXT: Record<GroupType, LocalizedText> = {
  komisi: { en: 'Commission', id: 'Komisi' },
  ministry: { en: 'Ministry', id: 'Pelayanan' },
  small_group: { en: 'Small group', id: 'Kelompok kecil / PA' },
  committee: { en: 'Committee', id: 'Kepanitiaan' },
  choir: { en: 'Choir', id: 'Paduan suara' },
  area: { en: 'Area group', id: 'Kelompok wilayah' },
  other: { en: 'Other', id: 'Lainnya' },
};

export const PERSON_STATUS_TEXT: Record<PersonMembershipStatus, LocalizedText> = {
  visitor: { en: 'Visitor', id: 'Simpatisan / tamu' },
  regular: { en: 'Regular attendee', id: 'Jemaat tetap' },
  member: { en: 'Member', id: 'Anggota jemaat' },
  inactive: { en: 'Inactive', id: 'Tidak aktif' },
};

export const GENDER_TEXT: Record<Gender, LocalizedText> = {
  male: { en: 'Male', id: 'Laki-laki' },
  female: { en: 'Female', id: 'Perempuan' },
  unspecified: { en: 'Not specified', id: 'Tidak disebutkan' },
};

export const MARITAL_STATUS_TEXT: Record<MaritalStatus, LocalizedText> = {
  single: { en: 'Single', id: 'Belum menikah' },
  married: { en: 'Married', id: 'Menikah' },
  widowed: { en: 'Widowed', id: 'Janda / duda' },
  divorced: { en: 'Divorced', id: 'Bercerai' },
  unspecified: { en: 'Not specified', id: 'Tidak disebutkan' },
};

export const WEEKDAY_TEXT: readonly LocalizedText[] = [
  { en: 'Sunday', id: 'Minggu' },
  { en: 'Monday', id: 'Senin' },
  { en: 'Tuesday', id: 'Selasa' },
  { en: 'Wednesday', id: 'Rabu' },
  { en: 'Thursday', id: 'Kamis' },
  { en: 'Friday', id: 'Jumat' },
  { en: 'Saturday', id: 'Sabtu' },
];

export const HOUSEHOLD_RELATIONSHIPS = [
  'head',
  'spouse',
  'child',
  'parent',
  'relative',
  'other',
] as const;
export type HouseholdRelationship = (typeof HOUSEHOLD_RELATIONSHIPS)[number];

export const HOUSEHOLD_RELATIONSHIP_LABELS: Record<HouseholdRelationship, LocalizedText> = {
  head: { en: 'Head of household', id: 'Kepala keluarga' },
  spouse: { en: 'Spouse', id: 'Suami / istri' },
  child: { en: 'Child', id: 'Anak' },
  parent: { en: 'Parent', id: 'Orang tua' },
  relative: { en: 'Relative', id: 'Kerabat' },
  other: { en: 'Other', id: 'Lainnya' },
};

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select', 'checkbox'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, LocalizedText> = {
  text: { en: 'Text', id: 'Teks' },
  number: { en: 'Number', id: 'Angka' },
  date: { en: 'Date', id: 'Tanggal' },
  select: { en: 'Choice list', id: 'Pilihan' },
  checkbox: { en: 'Yes / no', id: 'Ya / tidak' },
};

export const MEETING_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'irregular'] as const;
export type MeetingFrequency = (typeof MEETING_FREQUENCIES)[number];

export const MEETING_FREQUENCY_LABELS: Record<MeetingFrequency, LocalizedText> = {
  weekly: { en: 'Every week', id: 'Setiap minggu' },
  biweekly: { en: 'Every two weeks', id: 'Dua minggu sekali' },
  monthly: { en: 'Every month', id: 'Sebulan sekali' },
  irregular: { en: 'Irregular', id: 'Tidak tentu' },
};

export const GROUP_VISIBILITIES = ['public', 'private'] as const;
export type GroupVisibility = (typeof GROUP_VISIBILITIES)[number];

export const GROUP_VISIBILITY_LABELS: Record<GroupVisibility, LocalizedText> = {
  public: { en: 'Public: every member can find it', id: 'Terbuka: semua anggota dapat melihat' },
  private: { en: 'Private: members and leaders only', id: 'Tertutup: hanya anggota dan pemimpin' },
};

export const GROUP_JOIN_POLICIES = ['request', 'closed'] as const;
export type GroupJoinPolicy = (typeof GROUP_JOIN_POLICIES)[number];

export const GROUP_JOIN_REQUEST_STATUSES = [
  'pending',
  'approved',
  'declined',
  'cancelled',
] as const;
export type GroupJoinRequestStatus = (typeof GROUP_JOIN_REQUEST_STATUSES)[number];

export const GROUP_JOIN_REQUEST_STATUS_LABELS: Record<GroupJoinRequestStatus, LocalizedText> = {
  pending: { en: 'Waiting', id: 'Menunggu' },
  approved: { en: 'Approved', id: 'Disetujui' },
  declined: { en: 'Declined', id: 'Ditolak' },
  cancelled: { en: 'Cancelled', id: 'Dibatalkan' },
};

export const CELEBRATION_KINDS = ['birthday', 'anniversary', 'any'] as const;
export type CelebrationKind = (typeof CELEBRATION_KINDS)[number];

/** Contact fields a person can hide from the member directory. */
export const PERSON_PRIVACY_FIELDS = ['phone', 'email', 'address', 'birthday'] as const;
export type PersonPrivacyField = (typeof PERSON_PRIVACY_FIELDS)[number];

export const DEFAULT_PERSON_PRIVACY = {
  showPhone: true,
  showEmail: true,
  showAddress: false,
  showBirthday: true,
} as const;

// ---------------------------------------------------------------------------------------------
// Date helpers for birthdays and anniversaries
// ---------------------------------------------------------------------------------------------

const parseYmd = (value: string): [number, number, number] => {
  const [year, month, day] = value.split('-').map(Number);
  return [year ?? 0, month ?? 1, day ?? 1];
};

/** Whole years between `date` and `today` (both YYYY-MM-DD). */
export const ageOn = (date: string, today: string): number => {
  const [y1, m1, d1] = parseYmd(date);
  const [y2, m2, d2] = parseYmd(today);
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
};

/** Days from `today` to the next anniversary of `date` (0 = today). 29 February falls on 1 March. */
export const daysUntilAnniversary = (date: string, today: string): number => {
  const [, month, day] = parseYmd(date);
  const [year, todayMonth, todayDay] = parseYmd(today);
  const start = Date.UTC(year, todayMonth - 1, todayDay);
  let next = Date.UTC(year, month - 1, day);
  if (next < start) next = Date.UTC(year + 1, month - 1, day);
  return Math.round((next - start) / 86_400_000);
};

// ---------------------------------------------------------------------------------------------
// Areas (wilayah / sektor)
// ---------------------------------------------------------------------------------------------

export const areaSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  householdCount: z.number().int().nonnegative(),
  personCount: z.number().int().nonnegative(),
  coordinators: z.array(
    z.object({ userId: idSchema, name: z.string(), avatarUrl: z.string().nullable() }),
  ),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Area = z.infer<typeof areaSchema>;

export const areaSummarySchema = areaSchema.pick({ id: true, name: true, code: true, color: true });
export type AreaSummary = z.infer<typeof areaSummarySchema>;

export const areaInputSchema = z.object({
  name: requiredText(LIMITS.nameMin, LIMITS.nameMax),
  code: optionalText(20),
  description: optionalText(LIMITS.longTextMax),
  color: optionalHexColor,
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
});
export type AreaInput = z.infer<typeof areaInputSchema>;

export const areaListSchema = z.object({ items: z.array(areaSchema) });
export type AreaList = z.infer<typeof areaListSchema>;

export const areaCoordinatorBodySchema = z.object({ userId: idSchema });
export type AreaCoordinatorBody = z.infer<typeof areaCoordinatorBodySchema>;

export const assignAreaBodySchema = z.object({ areaId: idSchema.nullable() });
export type AssignAreaBody = z.infer<typeof assignAreaBodySchema>;

/**
 * Area coordinators act on the people of their own areas only. Pass the area ids the caller
 * coordinates and the area of the person being changed.
 */
export const canManageAreaPerson = (
  access: Pick<AccessLike, 'permissions'>,
  coordinatedAreaIds: readonly string[],
  personAreaId: string | null,
): boolean =>
  has(access, 'people.edit') || (!!personAreaId && coordinatedAreaIds.includes(personAreaId));

// ---------------------------------------------------------------------------------------------
// Households
// ---------------------------------------------------------------------------------------------

export const householdMemberSchema = personSummarySchema.extend({
  relationship: z.enum(HOUSEHOLD_RELATIONSHIPS),
  isPrimaryContact: z.boolean(),
  birthDate: isoDateSchema.nullable(),
  gender: z.enum(GENDERS),
});
export type HouseholdMember = z.infer<typeof householdMemberSchema>;

export const householdSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  name: z.string(),
  areaId: idSchema.nullable(),
  area: areaSummarySchema.nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  phone: z.string().nullable(),
  photoUrl: z.string().nullable(),
  notes: z.string().nullable(),
  members: z.array(householdMemberSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Household = z.infer<typeof householdSchema>;

export const householdInputSchema = z.object({
  name: requiredText(LIMITS.nameMin, LIMITS.nameMax),
  areaId: idSchema.nullable().default(null),
  address: optionalText(LIMITS.shortTextMax),
  city: optionalText(LIMITS.shortTextMax),
  postalCode: optionalText(20),
  phone: optionalText(LIMITS.phoneMax),
  photoUrl: optionalUrl,
  notes: optionalText(LIMITS.longTextMax),
});
export type HouseholdInput = z.infer<typeof householdInputSchema>;

export const householdListQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  areaId: idSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(LIMITS.pageSizeDefault),
});
export type HouseholdListQuery = z.infer<typeof householdListQuerySchema>;

export const householdListSchema = paginatedSchema(householdSchema);
export type HouseholdList = z.infer<typeof householdListSchema>;

/** Adds an existing person to the household; a person in another household is moved. */
export const addHouseholdMemberBodySchema = z.object({
  personId: idSchema,
  relationship: z.enum(HOUSEHOLD_RELATIONSHIPS),
  isPrimaryContact: z.boolean().default(false),
});
export type AddHouseholdMemberBody = z.infer<typeof addHouseholdMemberBodySchema>;

/** "Add family member": creates the person and adds them in one step. */
export const createFamilyMemberBodySchema = z.object({
  person: personInputSchema,
  relationship: z.enum(HOUSEHOLD_RELATIONSHIPS),
  /** Copy the household address and phone to the new person. */
  copyContact: z.boolean().default(true),
});
export type CreateFamilyMemberBody = z.infer<typeof createFamilyMemberBodySchema>;

export const updateHouseholdMemberBodySchema = z.object({
  relationship: z.enum(HOUSEHOLD_RELATIONSHIPS),
  isPrimaryContact: z.boolean(),
});
export type UpdateHouseholdMemberBody = z.infer<typeof updateHouseholdMemberBodySchema>;

// ---------------------------------------------------------------------------------------------
// Tags and custom fields
// ---------------------------------------------------------------------------------------------

export const personTagSchema = z.object({
  id: idSchema,
  name: z.string(),
  color: z.string().nullable(),
  personCount: z.number().int().nonnegative(),
});
export type PersonTag = z.infer<typeof personTagSchema>;

export const personTagInputSchema = z.object({
  name: requiredText(1, 40),
  color: optionalHexColor,
});
export type PersonTagInput = z.infer<typeof personTagInputSchema>;

export const personTagListSchema = z.object({ items: z.array(personTagSchema) });

export const setPersonTagsBodySchema = z.object({
  tagIds: z.array(idSchema).max(PEOPLE_LIMITS.tagsPerPersonMax),
});
export type SetPersonTagsBody = z.infer<typeof setPersonTagsBodySchema>;

export const customFieldDefinitionSchema = z.object({
  id: idSchema,
  key: z.string(),
  label: z.string(),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(z.string()),
  helpText: z.string().nullable(),
  isRequired: z.boolean(),
  isPrivate: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type CustomFieldDefinition = z.infer<typeof customFieldDefinitionSchema>;

export const customFieldDefinitionInputSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(PEOPLE_LIMITS.customFieldKeyMax)
      .regex(/^[a-z][a-z0-9_]*$/, 'Use lower-case letters, digits and underscores'),
    label: requiredText(1, LIMITS.nameMax),
    type: z.enum(CUSTOM_FIELD_TYPES),
    options: z
      .array(requiredText(1, LIMITS.nameMax))
      .max(PEOPLE_LIMITS.customFieldOptionsMax)
      .default([]),
    helpText: optionalText(LIMITS.shortTextMax),
    isRequired: z.boolean().default(false),
    isPrivate: z.boolean().default(false),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .refine((value) => value.type !== 'select' || value.options.length > 0, {
    message: 'A choice list needs at least one option',
    path: ['options'],
  });
export type CustomFieldDefinitionInput = z.infer<typeof customFieldDefinitionInputSchema>;

export const customFieldDefinitionListSchema = z.object({
  items: z.array(customFieldDefinitionSchema),
});

/** Values are sent as strings; the API checks them against the field type. Null clears. */
export const setCustomFieldValuesBodySchema = z.object({
  values: z
    .record(idSchema, z.string().max(PEOPLE_LIMITS.customFieldValueMax).nullable())
    .refine((value) => Object.keys(value).length <= PEOPLE_LIMITS.customFieldsMax, {
      message: 'Too many fields',
    }),
});
export type SetCustomFieldValuesBody = z.infer<typeof setCustomFieldValuesBodySchema>;

/** Checks one stored or submitted custom field value against its definition. */
export const isValidCustomFieldValue = (
  definition: Pick<CustomFieldDefinition, 'type' | 'options'>,
  value: string,
): boolean => {
  switch (definition.type) {
    case 'text':
      return value.length <= PEOPLE_LIMITS.customFieldValueMax;
    case 'number':
      return /^-?\d+(\.\d+)?$/.test(value);
    case 'date':
      return isoDateSchema.safeParse(value).success;
    case 'select':
      return definition.options.includes(value);
    case 'checkbox':
      return value === 'true' || value === 'false';
  }
};

// ---------------------------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------------------------

export const personPrivacySchema = z.object({
  showPhone: z.boolean(),
  showEmail: z.boolean(),
  showAddress: z.boolean(),
  showBirthday: z.boolean(),
});
export type PersonPrivacy = z.infer<typeof personPrivacySchema>;

export const personPrivacyInputSchema = personPrivacySchema;
export type PersonPrivacyInput = z.infer<typeof personPrivacyInputSchema>;

/**
 * Whether the caller sees a person's contact fields regardless of their privacy choices: their
 * own profile, or `people.private.view`.
 */
export const canSeeHiddenContact = (
  access: AccessLike,
  person: { id: string; userId: string | null },
): boolean =>
  has(access, 'people.private.view') ||
  person.userId === access.userId ||
  (access.personId !== null && access.personId === person.id);

/** Strips the contact fields a person hid, unless the caller may see them. */
export const applyPersonPrivacy = <
  T extends {
    id: string;
    userId: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    birthDate: string | null;
  },
>(
  access: AccessLike,
  person: T,
  privacy: PersonPrivacy,
): T => {
  if (canSeeHiddenContact(access, person)) return person;
  return {
    ...person,
    phone: privacy.showPhone ? person.phone : null,
    email: privacy.showEmail ? person.email : null,
    address: privacy.showAddress ? person.address : null,
    birthDate: privacy.showBirthday ? person.birthDate : null,
  };
};

// ---------------------------------------------------------------------------------------------
// Directory, import/export and merge
// ---------------------------------------------------------------------------------------------

export const DIRECTORY_SORTS = ['name', 'created', 'birthday', 'anniversary', 'joined'] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

export const directoryQuerySchema = personListQuerySchema.extend({
  gender: z.enum(GENDERS).optional(),
  minAge: z.coerce.number().int().min(0).max(150).optional(),
  maxAge: z.coerce.number().int().min(0).max(150).optional(),
  areaId: idSchema.optional(),
  tagId: idSchema.optional(),
  householdId: idSchema.optional(),
  hasAccount: booleanQuery,
  /** Custom field filter: `fieldId` with an exact `fieldValue`. */
  fieldId: idSchema.optional(),
  fieldValue: z.string().trim().max(PEOPLE_LIMITS.customFieldValueMax).optional(),
  /** People whose birthday or wedding anniversary falls within the next `withinDays` days. */
  celebration: z.enum(CELEBRATION_KINDS).optional(),
  withinDays: z.coerce.number().int().min(0).max(366).default(7),
  sort: z.enum(DIRECTORY_SORTS).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

/** The directory filters without paging, used by the CSV export. */
export const directoryExportQuerySchema = directoryQuerySchema.omit({ page: true, limit: true });
export type DirectoryExportQuery = z.infer<typeof directoryExportQuerySchema>;

export const directoryPersonSchema = personSchema.extend({
  weddingDate: isoDateSchema.nullable(),
  householdId: idSchema.nullable(),
  householdName: z.string().nullable(),
  relationship: z.enum(HOUSEHOLD_RELATIONSHIPS).nullable(),
  /** The person's own area, or their household's. */
  areaId: idSchema.nullable(),
  tagIds: z.array(idSchema),
  hasAccount: z.boolean(),
});
export type DirectoryPerson = z.infer<typeof directoryPersonSchema>;

export const directoryListSchema = paginatedSchema(directoryPersonSchema);
export type DirectoryList = z.infer<typeof directoryListSchema>;

/** One CSV row after the client mapped its columns. Custom fields use their `key`. */
export const personImportRowSchema = personInputSchema.extend({
  householdName: optionalText(LIMITS.nameMax),
  relationship: z.enum(HOUSEHOLD_RELATIONSHIPS).nullish(),
  areaName: optionalText(LIMITS.nameMax),
  tags: z.array(requiredText(1, 40)).max(PEOPLE_LIMITS.tagsPerPersonMax).default([]),
  customFields: z.record(z.string(), z.string().max(PEOPLE_LIMITS.customFieldValueMax)).default({}),
});
export type PersonImportRow = z.infer<typeof personImportRowSchema>;

export const personImportBodySchema = z.object({
  /** Raw rows; each is validated separately so one bad row does not reject the file. */
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(PEOPLE_LIMITS.importRowsMax),
  /** With `dryRun` the API only validates and reports duplicates. */
  dryRun: z.boolean().default(true),
  /** Rows whose duplicate warning the user accepted. */
  allowDuplicateRows: z.array(z.number().int().min(0)).max(PEOPLE_LIMITS.importRowsMax).default([]),
});
export type PersonImportBody = z.infer<typeof personImportBodySchema>;

/** Why an import row needs attention; the interface translates these. */
export const PERSON_IMPORT_ISSUE_CODES = [
  'missing',
  'invalid',
  'unknown_area',
  'household_ignored',
  'unknown_tag',
  'unknown_field',
  'field_not_allowed',
  'invalid_field_value',
  'duplicate_in_file',
] as const;
export type PersonImportIssueCode = (typeof PERSON_IMPORT_ISSUE_CODES)[number];

export const personImportResultSchema = z.object({
  dryRun: z.boolean(),
  created: z.number().int().nonnegative(),
  rows: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      status: z.enum(['ok', 'invalid', 'duplicate', 'created', 'skipped']),
      issues: z.array(
        z.object({
          path: z.string(),
          code: z.enum(PERSON_IMPORT_ISSUE_CODES),
          message: z.string(),
        }),
      ),
      duplicateOf: z.array(idSchema),
    }),
  ),
});
export type PersonImportResult = z.infer<typeof personImportResultSchema>;

export const duplicateCandidateSchema = z.object({
  people: z.array(personSummarySchema).length(2),
  /** Why they look alike: same name, phone, e-mail or birth date. */
  reasons: z.array(z.enum(['name', 'phone', 'email', 'birthDate'])),
  score: z.number().min(0).max(1),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

export const duplicateListSchema = z.object({ items: z.array(duplicateCandidateSchema) });

/** Merges `mergeId` into `keepId`; every reference moves to `keepId` and `mergeId` is deleted. */
export const mergePeopleBodySchema = z
  .object({
    keepId: idSchema,
    mergeId: idSchema,
    /** Fields to take from the merged record instead of the kept one. */
    takeFields: z
      .array(
        z.enum([
          'lastName',
          'gender',
          'birthDate',
          'email',
          'phone',
          'address',
          'photoUrl',
          'membershipStatus',
          'joinedAt',
          'weddingDate',
          'notes',
        ]),
      )
      .max(20)
      .default([]),
  })
  .refine((value) => value.keepId !== value.mergeId, {
    message: 'Choose two different people',
    path: ['mergeId'],
  });
export type MergePeopleBody = z.infer<typeof mergePeopleBodySchema>;

// ---------------------------------------------------------------------------------------------
// Person profile timeline
// ---------------------------------------------------------------------------------------------

export const PERSON_TIMELINE_KINDS = [
  'joined',
  'record',
  'group_joined',
  'attendance',
  'household',
  'note',
] as const;
export type PersonTimelineKind = (typeof PERSON_TIMELINE_KINDS)[number];

export const personTimelineItemSchema = z.object({
  kind: z.enum(PERSON_TIMELINE_KINDS),
  date: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  link: z.string().nullable(),
});
export type PersonTimelineItem = z.infer<typeof personTimelineItemSchema>;

export const personTimelineSchema = z.object({
  items: z.array(personTimelineItemSchema),
  attendance: z.object({
    present: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    lastPresentAt: isoDateTimeSchema.nullable(),
  }),
});
export type PersonTimeline = z.infer<typeof personTimelineSchema>;

// ---------------------------------------------------------------------------------------------
// Groups upgrade
// ---------------------------------------------------------------------------------------------

const meetingTimeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

/** The full group form: the base fields plus schedule, location, capacity and visibility. */
export const groupDetailsInputSchema = groupInputSchema.extend({
  type: z.enum(GROUP_TYPES).default('ministry'),
  meetingDay: z.number().int().min(0).max(6).nullable().default(null),
  meetingTime: meetingTimeSchema.nullable().default(null),
  meetingFrequency: z.enum(MEETING_FREQUENCIES).nullable().default(null),
  location: optionalText(LIMITS.shortTextMax),
  capacity: z.number().int().min(1).max(PEOPLE_LIMITS.groupCapacityMax).nullable().default(null),
  coverColor: optionalHexColor,
  visibility: z.enum(GROUP_VISIBILITIES).default('public'),
  joinPolicy: z.enum(GROUP_JOIN_POLICIES).default('request'),
});
export type GroupDetailsInput = z.infer<typeof groupDetailsInputSchema>;

export const groupScheduleSchema = z.object({
  meetingDay: z.number().int().min(0).max(6).nullable(),
  meetingTime: z.string().nullable(),
  meetingFrequency: z.enum(MEETING_FREQUENCIES).nullable(),
  location: z.string().nullable(),
  capacity: z.number().int().nullable(),
  coverColor: z.string().nullable(),
  visibility: z.enum(GROUP_VISIBILITIES),
  joinPolicy: z.enum(GROUP_JOIN_POLICIES),
});
export type GroupSchedule = z.infer<typeof groupScheduleSchema>;

export const groupJoinRequestSchema = z.object({
  id: idSchema,
  groupId: idSchema,
  groupName: z.string(),
  person: personSummarySchema,
  message: z.string().nullable(),
  status: z.enum(GROUP_JOIN_REQUEST_STATUSES),
  decidedAt: isoDateTimeSchema.nullable(),
  decisionNote: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type GroupJoinRequest = z.infer<typeof groupJoinRequestSchema>;

export const groupJoinRequestInputSchema = z.object({
  message: optionalText(PEOPLE_LIMITS.joinRequestMessageMax),
});
export type GroupJoinRequestInput = z.infer<typeof groupJoinRequestInputSchema>;

export const decideGroupJoinRequestBodySchema = z.object({
  decision: z.enum(['approved', 'declined']),
  note: optionalText(PEOPLE_LIMITS.joinRequestMessageMax),
});
export type DecideGroupJoinRequestBody = z.infer<typeof decideGroupJoinRequestBodySchema>;

export const groupJoinRequestListSchema = z.object({ items: z.array(groupJoinRequestSchema) });

// ---------------------------------------------------------------------------------------------
// Extended responses: areas, households, the person profile and groups
// ---------------------------------------------------------------------------------------------

export const areaListQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  includeInactive: booleanQuery,
});
export type AreaListQuery = z.infer<typeof areaListQuerySchema>;

export const areaResponseSchema = z.object({ area: areaSchema });

/** Assigns households and people to an area in one step. A person row overrides their household. */
export const areaAssignBodySchema = z
  .object({
    householdIds: z.array(idSchema).max(LIMITS.bulkIdsMax).default([]),
    personIds: z.array(idSchema).max(LIMITS.bulkIdsMax).default([]),
  })
  .refine((value) => value.householdIds.length + value.personIds.length > 0, {
    message: 'Choose at least one household or person',
    path: ['personIds'],
  });
export type AreaAssignBody = z.infer<typeof areaAssignBodySchema>;

const countRowSchema = z.object({ key: z.string(), count: z.number().int().nonnegative() });

export const upcomingCelebrationSchema = z.object({
  person: personSummarySchema,
  kind: z.enum(['birthday', 'anniversary']),
  date: isoDateSchema,
  /** 0 = today. */
  inDays: z.number().int().nonnegative(),
  /** The age or the number of years married on that day. */
  years: z.number().int().nonnegative(),
});
export type UpcomingCelebration = z.infer<typeof upcomingCelebrationSchema>;

/** Counts shown on the directory and area pages. */
export const peopleStatsSchema = z.object({
  people: z.number().int().nonnegative(),
  households: z.number().int().nonnegative(),
  byStatus: z.array(countRowSchema),
  byGender: z.array(countRowSchema),
  /** Age bands: `0-12`, `13-17`, `18-30`, `31-50`, `51-65`, `66+`, `unknown`. */
  byAge: z.array(countRowSchema),
  newThisMonth: z.number().int().nonnegative(),
  celebrations: z.array(upcomingCelebrationSchema),
});
export type PeopleStats = z.infer<typeof peopleStatsSchema>;

export const PEOPLE_AGE_BANDS = [
  '0-12',
  '13-17',
  '18-30',
  '31-50',
  '51-65',
  '66+',
  'unknown',
] as const;
export type PeopleAgeBand = (typeof PEOPLE_AGE_BANDS)[number];

export const PEOPLE_AGE_BAND_LABELS: Record<PeopleAgeBand, LocalizedText> = {
  '0-12': { en: 'Children (0–12)', id: 'Anak (0–12)' },
  '13-17': { en: 'Teens (13–17)', id: 'Remaja (13–17)' },
  '18-30': { en: 'Young adults (18–30)', id: 'Pemuda (18–30)' },
  '31-50': { en: 'Adults (31–50)', id: 'Dewasa (31–50)' },
  '51-65': { en: 'Older adults (51–65)', id: 'Madya (51–65)' },
  '66+': { en: 'Seniors (66+)', id: 'Lansia (66+)' },
  unknown: { en: 'Unknown', id: 'Tidak diketahui' },
};

export const peopleAgeBandOf = (birthDate: string | null, today: string): PeopleAgeBand => {
  if (!birthDate) return 'unknown';
  const age = ageOn(birthDate, today);
  if (age <= 12) return '0-12';
  if (age <= 17) return '13-17';
  if (age <= 30) return '18-30';
  if (age <= 50) return '31-50';
  if (age <= 65) return '51-65';
  return '66+';
};

export const areaDetailSchema = z.object({
  area: areaSchema,
  stats: peopleStatsSchema,
  canManage: z.boolean(),
  /** The caller coordinates this area. */
  isCoordinator: z.boolean(),
});
export type AreaDetail = z.infer<typeof areaDetailSchema>;

export const householdMemberInputSchema = z.object({
  personId: idSchema,
  relationship: z.enum(HOUSEHOLD_RELATIONSHIPS),
  isPrimaryContact: z.boolean().default(false),
});

/** Creates a household, optionally with its first members (people in another household move). */
export const householdCreateSchema = householdInputSchema.extend({
  members: z.array(householdMemberInputSchema).max(PEOPLE_LIMITS.householdMembersMax).default([]),
});
export type HouseholdCreateInput = z.infer<typeof householdCreateSchema>;

export const householdResponseSchema = z.object({ household: householdSchema });

export const householdDetailSchema = z.object({
  household: householdSchema,
  canManage: z.boolean(),
  canAddPeople: z.boolean(),
});
export type HouseholdDetail = z.infer<typeof householdDetailSchema>;

export const householdMemberResultSchema = z.object({
  household: householdSchema,
  /** The household the person left, when they moved. */
  movedFrom: z.object({ id: idSchema, name: z.string() }).nullable(),
});

export const familyMemberResultSchema = z.object({
  household: householdSchema,
  person: directoryPersonSchema,
});

/** "Add family member" from a person page: the household is created when the person has none. */
export const addFamilyMemberBodySchema = createFamilyMemberBodySchema.extend({
  /** The relationship of the person whose page it is, when a new household is created. */
  anchorRelationship: z.enum(HOUSEHOLD_RELATIONSHIPS).default('head'),
});
export type AddFamilyMemberBody = z.infer<typeof addFamilyMemberBodySchema>;

export const customFieldValueSchema = z.object({
  field: customFieldDefinitionSchema,
  value: z.string().nullable(),
});
export type CustomFieldValue = z.infer<typeof customFieldValueSchema>;

export const personTagResponseSchema = z.object({ tag: personTagSchema });
export const customFieldDefinitionResponseSchema = z.object({ field: customFieldDefinitionSchema });

/** The full person page: the base detail plus family, area, tags, fields and privacy. */
export const personProfileSchema = personDetailSchema.extend({
  person: directoryPersonSchema,
  groups: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      type: z.enum(GROUP_TYPES),
      coverColor: z.string().nullable(),
      isLeader: z.boolean(),
      addedAt: isoDateTimeSchema,
    }),
  ),
  household: householdSchema.nullable(),
  area: areaSummarySchema.nullable(),
  /** Where the area comes from: the person's own assignment or their household. */
  areaSource: z.enum(['person', 'household']).nullable(),
  tags: z.array(personTagSchema.pick({ id: true, name: true, color: true })),
  customFields: z.array(customFieldValueSchema),
  /** The person's directory choices; only for callers who may change them. */
  privacy: personPrivacySchema.nullable(),
  /** Contact fields hidden from the caller by the person's privacy choices. */
  hiddenFields: z.array(z.enum(PERSON_PRIVACY_FIELDS)),
  /** Counts from other modules, present only when the caller may open them. */
  links: z.object({
    care: z.object({ open: z.number().int().nonnegative() }).nullable(),
    giving: z.object({ count: z.number().int().nonnegative() }).nullable(),
    records: z.object({ count: z.number().int().nonnegative() }).nullable(),
  }),
  canEditPrivacy: z.boolean(),
  canEditTags: z.boolean(),
  canEditFields: z.boolean(),
  canManageHousehold: z.boolean(),
  canAddFamily: z.boolean(),
  canAssignArea: z.boolean(),
  canMerge: z.boolean(),
  canViewAttendance: z.boolean(),
});
export type PersonProfile = z.infer<typeof personProfileSchema>;

export const directoryPersonResponseSchema = z.object({ person: directoryPersonSchema });
export const personPrivacyResponseSchema = z.object({ privacy: personPrivacySchema });

/** What the caller coordinates and leads, for scoping actions in the interface. */
export const directoryMeSchema = z.object({
  personId: idSchema.nullable(),
  coordinatedAreaIds: z.array(idSchema),
  leaderGroupIds: z.array(idSchema),
  /** Pending join requests in the groups the caller decides on. */
  pendingJoinRequests: z.number().int().nonnegative(),
});
export type DirectoryMe = z.infer<typeof directoryMeSchema>;

export const mergeResultSchema = z.object({
  person: directoryPersonSchema,
  /** Rows moved to the kept record, by table. */
  moved: z.record(z.string(), z.number().int().nonnegative()),
});
export type MergeResult = z.infer<typeof mergeResultSchema>;

export const GROUP_MEMBER_STATES = ['leader', 'member', 'pending', 'none'] as const;
export type GroupMemberState = (typeof GROUP_MEMBER_STATES)[number];

export const groupDetailsSchema = groupSchema.extend({
  ...groupScheduleSchema.shape,
  /** The caller's relationship to the group. */
  myState: z.enum(GROUP_MEMBER_STATES),
  /** Pending join requests; 0 for callers who cannot decide on them. */
  pendingRequestCount: z.number().int().nonnegative(),
});
export type GroupDetails = z.infer<typeof groupDetailsSchema>;

export const groupDetailsListSchema = z.object({ items: z.array(groupDetailsSchema) });
export type GroupDetailsList = z.infer<typeof groupDetailsListSchema>;

export const groupDetailsResponseSchema = z.object({ group: groupDetailsSchema });

export const groupDetailsListQuerySchema = groupListQuerySchema.extend({
  type: z.enum(GROUP_TYPES).optional(),
  /** Only the groups the caller belongs to or leads. */
  mine: booleanQuery,
});
export type GroupDetailsListQuery = z.infer<typeof groupDetailsListQuerySchema>;

/** Partial update: only the fields sent change. */
export const groupDetailsPatchSchema = z.object({
  name: requiredText(2, LIMITS.nameMax).optional(),
  description: optionalText(LIMITS.longTextMax).optional(),
  type: z.enum(GROUP_TYPES).optional(),
  meetingSchedule: optionalText(LIMITS.shortTextMax).optional(),
  isActive: z.boolean().optional(),
  meetingDay: z.number().int().min(0).max(6).nullable().optional(),
  meetingTime: meetingTimeSchema.nullable().optional(),
  meetingFrequency: z.enum(MEETING_FREQUENCIES).nullable().optional(),
  location: optionalText(LIMITS.shortTextMax).optional(),
  capacity: z.number().int().min(1).max(PEOPLE_LIMITS.groupCapacityMax).nullable().optional(),
  coverColor: optionalHexColor.optional(),
  visibility: z.enum(GROUP_VISIBILITIES).optional(),
  joinPolicy: z.enum(GROUP_JOIN_POLICIES).optional(),
});
export type GroupDetailsPatch = z.infer<typeof groupDetailsPatchSchema>;

export const groupRosterMemberSchema = groupMemberSchema.extend({
  phone: z.string().nullable(),
  email: z.string().nullable(),
  isLeader: z.boolean(),
});
export type GroupRosterMember = z.infer<typeof groupRosterMemberSchema>;

export const groupPageSchema = z.object({
  group: groupDetailsSchema,
  members: z.array(groupRosterMemberSchema),
  myRequest: groupJoinRequestSchema.nullable(),
  /** Pending requests, for callers who decide on them. */
  joinRequests: z.array(groupJoinRequestSchema),
  stats: z.object({
    upcomingEvents: z.array(
      z.object({ id: idSchema, title: z.string(), startsAt: isoDateTimeSchema }),
    ),
    eventCount: z.number().int().nonnegative(),
    attendance: z
      .object({
        sessions: z.number().int().nonnegative(),
        /** Present ÷ marked over the last sessions, 0–1; null without records. */
        rate: z.number().min(0).max(1).nullable(),
        lastSessionAt: isoDateTimeSchema.nullable(),
      })
      .nullable(),
    recentAnnouncements: z.array(
      z.object({ id: idSchema, title: z.string(), publishedAt: isoDateTimeSchema.nullable() }),
    ),
  }),
  canManage: z.boolean(),
  canDelete: z.boolean(),
  canAssignLeaders: z.boolean(),
  canRequestToJoin: z.boolean(),
  canLeave: z.boolean(),
  canExport: z.boolean(),
});
export type GroupPage = z.infer<typeof groupPageSchema>;

export const groupJoinRequestResponseSchema = z.object({ request: groupJoinRequestSchema });

// ---------------------------------------------------------------------------------------------
// Rules shared by the API and the interface
// ---------------------------------------------------------------------------------------------

const isSelfPerson = (access: AccessLike, person: { id: string; userId: string | null }) =>
  person.userId === access.userId || (access.personId !== null && access.personId === person.id);

/**
 * Who may edit a person's basic profile: `people.edit`, the person themselves, leaders of their
 * groups, and coordinators of their area. Leaders can add anyone to their group, so the scoped
 * rights stop at people whose account holds permissions the caller lacks (`linkedPermissions`,
 * the effective permissions of the linked member account): a leader cannot rewrite the
 * pastor's or an administrator's contact details by adding them to a group first.
 */
export const canEditPersonProfile = (
  access: AccessLike,
  person: { id: string; userId: string | null },
  scope: {
    groupIds: readonly string[];
    coordinatedAreaIds: readonly string[];
    areaId: string | null;
    linkedPermissions?: readonly Permission[] | null;
  },
): boolean =>
  has(access, 'people.edit') ||
  isSelfPerson(access, person) ||
  ((!scope.linkedPermissions || canGrant(access, scope.linkedPermissions)) &&
    (scope.groupIds.some((groupId) => access.leaderGroupIds.includes(groupId)) ||
      canManageAreaPerson(access, scope.coordinatedAreaIds, scope.areaId)));

/** Each person controls their own directory privacy; `people.private.edit` can change it too. */
export const canEditPersonPrivacy = (
  access: AccessLike,
  person: { id: string; userId: string | null },
): boolean => has(access, 'people.private.edit') || isSelfPerson(access, person);

/** Private custom fields follow the private details rules. */
export const canViewPrivateField = (
  access: AccessLike,
  person: { id: string; userId: string | null },
): boolean => has(access, 'people.private.view') || isSelfPerson(access, person);

export const canEditPrivateField = (
  access: AccessLike,
  person: { id: string; userId: string | null },
): boolean => has(access, 'people.private.edit') || isSelfPerson(access, person);

/** Private groups are visible to their members and leaders and to `groups.manage`. */
export const canSeeGroup = (
  access: AccessLike,
  group: { id: string; visibility: GroupVisibility },
  isMember: boolean,
): boolean =>
  group.visibility === 'public' ||
  isMember ||
  has(access, 'groups.manage') ||
  access.leaderGroupIds.includes(group.id);

/** A member with a person record may ask to join an active public group that accepts requests. */
export const canRequestToJoinGroup = (
  access: AccessLike,
  group: { visibility: GroupVisibility; joinPolicy: GroupJoinPolicy; isActive: boolean },
  state: GroupMemberState,
): boolean =>
  has(access, 'groups.view') &&
  access.personId !== null &&
  group.isActive &&
  group.visibility === 'public' &&
  group.joinPolicy === 'request' &&
  state === 'none';

/** Leaders of the group and holders of `groups.manage` decide on join requests. */
export const canDecideJoinRequests = (access: AccessLike, groupId: string): boolean =>
  has(access, 'groups.manage') || access.leaderGroupIds.includes(groupId);

// ---------------------------------------------------------------------------------------------
// Person form and CSV import helpers
// ---------------------------------------------------------------------------------------------

/**
 * The person form: the profile plus, optionally, tags and custom field values saved in the same
 * request. Omitted extras are left unchanged.
 */
export const personFormSchema = personInputSchema.extend({
  tagIds: setPersonTagsBodySchema.shape.tagIds.optional(),
  customFields: setCustomFieldValuesBodySchema.shape.values.optional(),
});
export type PersonFormInput = z.infer<typeof personFormSchema>;

/** CSV columns the export writes and the import understands, in order. */
export const PERSON_CSV_COLUMNS = [
  'firstName',
  'lastName',
  'gender',
  'birthDate',
  'email',
  'phone',
  'address',
  'membershipStatus',
  'joinedAt',
  'weddingDate',
  'householdName',
  'relationship',
  'areaName',
  'tags',
  'notes',
] as const;
export type PersonCsvColumn = (typeof PERSON_CSV_COLUMNS)[number];

const IMPORT_VALUE_ALIASES: Record<string, Record<string, string>> = {
  gender: {
    l: 'male',
    'laki-laki': 'male',
    'laki laki': 'male',
    pria: 'male',
    m: 'male',
    male: 'male',
    p: 'female',
    perempuan: 'female',
    wanita: 'female',
    f: 'female',
    female: 'female',
  },
  membershipStatus: {
    anggota: 'member',
    'anggota jemaat': 'member',
    member: 'member',
    jemaat: 'member',
    simpatisan: 'visitor',
    tamu: 'visitor',
    visitor: 'visitor',
    tetap: 'regular',
    'jemaat tetap': 'regular',
    regular: 'regular',
    'tidak aktif': 'inactive',
    inactive: 'inactive',
  },
  relationship: {
    'kepala keluarga': 'head',
    kk: 'head',
    head: 'head',
    suami: 'spouse',
    istri: 'spouse',
    pasangan: 'spouse',
    spouse: 'spouse',
    anak: 'child',
    child: 'child',
    'orang tua': 'parent',
    ayah: 'parent',
    ibu: 'parent',
    parent: 'parent',
    kerabat: 'relative',
    saudara: 'relative',
    relative: 'relative',
    lainnya: 'other',
    other: 'other',
  },
};

const DATE_COLUMNS = new Set(['birthDate', 'joinedAt', 'weddingDate']);

/** `25/12/1990`, `25-12-1990` and `1990/12/25` become `1990-12-25`; other text is kept. */
export const normalizeImportDate = (value: string): string => {
  const trimmed = value.trim();
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (dmy) return `${dmy[3]}-${dmy[2]?.padStart(2, '0')}-${dmy[1]?.padStart(2, '0')}`;
  const ymd = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(trimmed);
  if (ymd) return `${ymd[1]}-${ymd[2]?.padStart(2, '0')}-${ymd[3]?.padStart(2, '0')}`;
  return trimmed;
};

/**
 * Turns one mapped CSV row (strings keyed by column, custom fields as `field:<key>`) into the
 * shape `personImportRowSchema` validates: Indonesian values such as "L"/"P" or "Anggota" are
 * understood, dates in day/month/year order are converted, and tags are split on `;` or `,`.
 */
export const normalizeImportRow = (raw: Record<string, unknown>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  const customFields: Record<string, string> = {};
  for (const [key, input] of Object.entries(raw)) {
    if (input === null || input === undefined) continue;
    if (key === 'customFields' && typeof input === 'object') {
      for (const [fieldKey, value] of Object.entries(input as Record<string, unknown>)) {
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          customFields[fieldKey] = String(value).trim();
        }
      }
      continue;
    }
    if (key === 'tags') {
      row.tags = Array.isArray(input)
        ? input.map(String)
        : String(input)
            .split(/[;,]/)
            .map((tag) => tag.trim())
            .filter(Boolean);
      continue;
    }
    if (typeof input !== 'string') {
      row[key] = input;
      continue;
    }
    const value = input.trim();
    if (key.startsWith('field:')) {
      if (value) customFields[key.slice('field:'.length)] = value;
      continue;
    }
    if (!value) continue;
    const aliases = IMPORT_VALUE_ALIASES[key];
    if (aliases) row[key] = aliases[value.toLowerCase()] ?? value;
    else if (DATE_COLUMNS.has(key)) row[key] = normalizeImportDate(value);
    else row[key] = value;
  }
  if (Object.keys(customFields).length > 0) row.customFields = customFields;
  return row;
};

/** Phone numbers compared without spaces or punctuation, with +62 and a leading 0 treated alike. */
export const normalizePhone = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return null;
  return digits.startsWith('62') ? digits.slice(2) : digits.replace(/^0/, '');
};

/** Names compared case- and accent-insensitively with single spaces. */
export const normalizeName = (person: { firstName: string; lastName?: string | null }): string =>
  [person.firstName, person.lastName ?? '']
    .join(' ')
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Member accounts offered when linking a person or choosing leaders and coordinators. */
export const directoryAccountSchema = z.object({
  userId: idSchema,
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
  /** The person record already linked to the account. */
  personId: idSchema.nullable(),
});
export type DirectoryAccount = z.infer<typeof directoryAccountSchema>;
export const directoryAccountListSchema = z.object({ items: z.array(directoryAccountSchema) });
