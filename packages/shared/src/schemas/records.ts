// Zod schemas, enums and labels owned by the records module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import {
  LIMITS,
  MARITAL_STATUSES,
  PERSON_MEMBERSHIP_STATUSES,
  type MaritalStatus,
  type PersonMembershipStatus,
} from '../constants';
import type { LocalizedText } from '../localized';
import { has, hasAny, type AccessLike } from '../permissions';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  optionalDate,
  optionalText,
  optionalUrl,
  paginatedSchema,
  paginationQuerySchema,
  requiredText,
} from './common';
import { personSummarySchema } from './person';

export const RECORDS_LIMITS = {
  peoplePerRecordMax: 20,
  numberPatternMax: 60,
  correctionNoteMax: 500,
  recentMax: 8,
  historyMax: 100,
} as const;

export const REGISTRY_RECORD_TYPES = [
  'baptism',
  'sidi',
  'marriage',
  'child_dedication',
  'transfer_in',
  'transfer_out',
  'death',
  'custom',
] as const;
export type RegistryRecordType = (typeof REGISTRY_RECORD_TYPES)[number];

export const REGISTRY_RECORD_TYPE_LABELS: Record<RegistryRecordType, LocalizedText> = {
  baptism: { en: 'Baptism', id: 'Baptis' },
  sidi: { en: 'Confirmation', id: 'Sidi' },
  marriage: { en: 'Marriage blessing', id: 'Pemberkatan nikah' },
  child_dedication: { en: 'Child dedication', id: 'Penyerahan anak' },
  transfer_in: { en: 'Transfer in', id: 'Atestasi masuk' },
  transfer_out: { en: 'Transfer out', id: 'Atestasi keluar' },
  death: { en: 'Death and funeral', id: 'Kedukaan' },
  custom: { en: 'Other milestone', id: 'Peristiwa lain' },
};

export const BAPTISM_KINDS = ['infant', 'adult'] as const;
export type BaptismKind = (typeof BAPTISM_KINDS)[number];

export const BAPTISM_KIND_LABELS: Record<BaptismKind, LocalizedText> = {
  infant: { en: 'Infant baptism', id: 'Baptis anak' },
  adult: { en: 'Adult baptism', id: 'Baptis dewasa' },
};

export const RECORD_PERSON_ROLES = [
  'subject',
  'spouse',
  'father',
  'mother',
  'godparent',
  'witness',
  'other',
] as const;
export type RecordPersonRole = (typeof RECORD_PERSON_ROLES)[number];

export const RECORD_PERSON_ROLE_LABELS: Record<RecordPersonRole, LocalizedText> = {
  subject: { en: 'Person', id: 'Yang bersangkutan' },
  spouse: { en: 'Spouse', id: 'Mempelai' },
  father: { en: 'Father', id: 'Ayah' },
  mother: { en: 'Mother', id: 'Ibu' },
  godparent: { en: 'Godparent', id: 'Saksi baptis / bapak-ibu baptis' },
  witness: { en: 'Witness', id: 'Saksi' },
  other: { en: 'Other', id: 'Lainnya' },
};

/** The roles a record of each type may name. The first is the person the record is about. */
export const RECORD_TYPE_ROLES: Record<RegistryRecordType, readonly RecordPersonRole[]> = {
  baptism: ['subject', 'father', 'mother', 'godparent', 'witness', 'other'],
  sidi: ['subject', 'godparent', 'witness', 'other'],
  marriage: ['spouse', 'father', 'mother', 'witness', 'other'],
  child_dedication: ['subject', 'father', 'mother', 'witness', 'other'],
  transfer_in: ['subject', 'witness', 'other'],
  transfer_out: ['subject', 'witness', 'other'],
  death: ['subject', 'other'],
  custom: ['subject', 'spouse', 'father', 'mother', 'godparent', 'witness', 'other'],
};

/** Who the record is about: two spouses for a marriage, one person otherwise. */
export const recordPrimaryRole = (type: RegistryRecordType): 'subject' | 'spouse' =>
  type === 'marriage' ? 'spouse' : 'subject';

/**
 * Roles that make a record the person's own: they can open it and its certificate without
 * `records.view` (a parent sees their child's baptism; a witness does not).
 */
export const OWN_RECORD_ROLES: readonly RecordPersonRole[] = [
  'subject',
  'spouse',
  'father',
  'mother',
];

/**
 * Sacraments and events recorded once per person. A second active record of these types for
 * the same subject is refused (void the wrong one first).
 */
export const ONCE_PER_PERSON_TYPES: readonly RegistryRecordType[] = [
  'baptism',
  'sidi',
  'child_dedication',
  'death',
];

export const REGISTRY_RECORD_STATUSES = ['active', 'voided'] as const;
export type RegistryRecordStatus = (typeof REGISTRY_RECORD_STATUSES)[number];

export const REGISTRY_RECORD_STATUS_LABELS: Record<RegistryRecordStatus, LocalizedText> = {
  active: { en: 'Valid', id: 'Berlaku' },
  voided: { en: 'Voided', id: 'Dibatalkan' },
};

/**
 * Number patterns. Tokens: `{YYYY}` year, `{YY}` two-digit year, `{N}`…`{NNNNN}` the sequence
 * padded to that many digits, `{TYPE}` the type code below.
 */
export const DEFAULT_RECORD_NUMBER_PATTERNS: Record<RegistryRecordType, string> = {
  baptism: 'B/{YYYY}/{NNN}',
  sidi: 'S/{YYYY}/{NNN}',
  marriage: 'N/{YYYY}/{NNN}',
  child_dedication: 'PA/{YYYY}/{NNN}',
  transfer_in: 'AM/{YYYY}/{NNN}',
  transfer_out: 'AK/{YYYY}/{NNN}',
  death: 'K/{YYYY}/{NNN}',
  custom: 'C/{YYYY}/{NNN}',
};

export const RECORD_TYPE_CODES: Record<RegistryRecordType, string> = {
  baptism: 'B',
  sidi: 'S',
  marriage: 'N',
  child_dedication: 'PA',
  transfer_in: 'AM',
  transfer_out: 'AK',
  death: 'K',
  custom: 'C',
};

export const formatRecordNumber = (
  pattern: string,
  values: { type: RegistryRecordType; year: number; sequence: number },
): string =>
  pattern
    .replace(/\{YYYY\}/g, String(values.year))
    .replace(/\{YY\}/g, String(values.year % 100).padStart(2, '0'))
    .replace(/\{TYPE\}/g, RECORD_TYPE_CODES[values.type])
    .replace(/\{(N+)\}/g, (_match, digits: string) =>
      String(values.sequence).padStart(digits.length, '0'),
    );

/** The numbering year of a record: the year of its date. */
export const recordYearOf = (date: string): number => Number(date.slice(0, 4));

// Sequences restart every year, so a pattern without the year would repeat numbers.
export const numberPatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(RECORDS_LIMITS.numberPatternMax)
  .refine((value) => /\{N+\}/.test(value), 'The pattern needs a sequence such as {NNN}')
  .refine(
    (value) => /\{YYYY\}|\{YY\}/.test(value),
    'The pattern needs the year ({YYYY} or {YY}) because numbers restart every year',
  );

/** Stored in `churches.settings.records`. */
export const recordsSettingsSchema = z.object({
  numberPatterns: z.partialRecord(z.enum(REGISTRY_RECORD_TYPES), numberPatternSchema).default({}),
  /** Printed under the certificate signature line. */
  signatoryName: optionalText(LIMITS.nameMax),
  signatoryTitle: optionalText(LIMITS.nameMax),
  certificateFooter: optionalText(LIMITS.shortTextMax),
});
export type RecordsSettings = z.infer<typeof recordsSettingsSchema>;

export const recordNumberPattern = (settings: RecordsSettings, type: RegistryRecordType): string =>
  settings.numberPatterns[type] ?? DEFAULT_RECORD_NUMBER_PATTERNS[type];

/** `GET`/`PUT .../records/settings`: the settings plus the number each type gets next. */
export const recordsSettingsResponseSchema = z.object({
  settings: recordsSettingsSchema,
  nextNumbers: z.record(z.enum(REGISTRY_RECORD_TYPES), z.string()),
});
export type RecordsSettingsResponse = z.infer<typeof recordsSettingsResponseSchema>;

/**
 * The membership status a record implies for its subject, or null when nothing changes. The
 * API applies it only after the user confirmed the side effect shown in the dialog.
 */
export const recordStatusEffect = (
  type: RegistryRecordType,
  subtype: string | null,
  current: PersonMembershipStatus,
): PersonMembershipStatus | null => {
  switch (type) {
    case 'death':
    case 'transfer_out':
      return current === 'inactive' ? null : 'inactive';
    case 'transfer_in':
    case 'sidi':
      return current === 'member' ? null : 'member';
    case 'baptism':
      if (subtype === 'adult') return current === 'member' ? null : 'member';
      return current === 'visitor' ? 'regular' : null;
    default:
      return null;
  }
};

/** Type-specific fields. All optional; the form shows the ones that fit the type. */
export const recordDetailsSchema = z.object({
  /** Atestasi: the other church and its letter. */
  otherChurchName: optionalText(LIMITS.nameMax),
  otherChurchAddress: optionalText(LIMITS.shortTextMax),
  letterNumber: optionalText(LIMITS.shortTextMax),
  letterDate: optionalDate,
  /** Marriage: civil registration (catatan sipil) number and date. */
  civilRegistrationNumber: optionalText(LIMITS.shortTextMax),
  civilRegistrationDate: optionalDate,
  /** Death: cause, funeral service and burial. */
  causeOfDeath: optionalText(LIMITS.shortTextMax),
  funeralDate: optionalDate,
  burialPlace: optionalText(LIMITS.shortTextMax),
  /** Baptism and dedication: the subject's birth details at the time. */
  birthPlace: optionalText(LIMITS.shortTextMax),
  birthDate: optionalDate,
  /** Sidi and adult baptism: the Bible verse given (nas). */
  verse: optionalText(LIMITS.shortTextMax),
});
export type RecordDetails = z.infer<typeof recordDetailsSchema>;
export type RecordDetailKey = keyof RecordDetails;

/** Which detail fields the form shows for each type. */
export const RECORD_TYPE_DETAILS: Record<RegistryRecordType, readonly RecordDetailKey[]> = {
  baptism: ['birthPlace', 'birthDate', 'verse'],
  sidi: ['verse'],
  marriage: ['civilRegistrationNumber', 'civilRegistrationDate'],
  child_dedication: ['birthPlace', 'birthDate', 'verse'],
  transfer_in: ['otherChurchName', 'otherChurchAddress', 'letterNumber', 'letterDate'],
  transfer_out: ['otherChurchName', 'otherChurchAddress', 'letterNumber', 'letterDate'],
  death: ['causeOfDeath', 'funeralDate', 'burialPlace'],
  custom: [],
};

/** Detail values not shown on certificates or in the audit log. */
export const PRIVATE_RECORD_DETAILS: readonly RecordDetailKey[] = ['causeOfDeath'];

export const recordPersonSchema = z.object({
  id: idSchema,
  personId: idSchema.nullable(),
  name: z.string(),
  role: z.enum(RECORD_PERSON_ROLES),
  position: z.number().int(),
});
export type RecordPerson = z.infer<typeof recordPersonSchema>;

export const recordPersonInputSchema = z
  .object({
    personId: idSchema.nullable().default(null),
    /** Required when `personId` is null; otherwise filled from the person record. */
    name: optionalText(LIMITS.nameMax),
    role: z.enum(RECORD_PERSON_ROLES),
  })
  .refine((value) => value.personId || value.name, {
    message: 'Choose a person or enter a name',
    path: ['name'],
  });
export type RecordPersonInput = z.infer<typeof recordPersonInputSchema>;

export const registryRecordSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  type: z.enum(REGISTRY_RECORD_TYPES),
  subtype: z.string().nullable(),
  year: z.number().int(),
  sequence: z.number().int(),
  number: z.string(),
  date: isoDateSchema,
  place: z.string().nullable(),
  officiantPersonId: idSchema.nullable(),
  officiantName: z.string().nullable(),
  details: recordDetailsSchema,
  documentUrl: z.string().nullable(),
  notes: z.string().nullable(),
  people: z.array(recordPersonSchema),
  status: z.enum(REGISTRY_RECORD_STATUSES),
  voidedAt: isoDateTimeSchema.nullable(),
  voidReason: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type RegistryRecord = z.infer<typeof registryRecordSchema>;

const roleCount = (people: readonly RecordPersonInput[], role: RecordPersonRole) =>
  people.filter((person) => person.role === role).length;

export const registryRecordInputSchema = z
  .object({
    type: z.enum(REGISTRY_RECORD_TYPES),
    subtype: optionalText(LIMITS.nameMax),
    date: isoDateSchema,
    place: optionalText(LIMITS.shortTextMax),
    officiantPersonId: idSchema.nullable().default(null),
    officiantName: optionalText(LIMITS.nameMax),
    details: recordDetailsSchema.prefault({}),
    documentUrl: optionalUrl,
    notes: optionalText(LIMITS.longTextMax),
    people: z.array(recordPersonInputSchema).min(1).max(RECORDS_LIMITS.peoplePerRecordMax),
    /** Apply `recordSideEffects` to the people named (the user confirmed them). */
    applyStatusEffect: z.boolean().default(false),
  })
  .refine(
    (value) =>
      value.type === 'marriage'
        ? roleCount(value.people, 'spouse') === 2
        : roleCount(value.people, 'subject') === 1,
    {
      message: 'A marriage needs two spouses; other records need exactly one person',
      path: ['people'],
    },
  )
  .refine(
    (value) => value.people.every((person) => RECORD_TYPE_ROLES[value.type].includes(person.role)),
    { message: 'A person has a role that does not fit this kind of record', path: ['people'] },
  )
  .refine(
    (value) => {
      const ids = value.people.flatMap((person) => (person.personId ? [person.personId] : []));
      return new Set(ids).size === ids.length;
    },
    { message: 'The same person is named twice', path: ['people'] },
  )
  .refine(
    (value) => value.type !== 'baptism' || value.subtype === 'infant' || value.subtype === 'adult',
    {
      message: 'Choose infant or adult baptism',
      path: ['subtype'],
    },
  )
  .refine((value) => value.type !== 'custom' || !!value.subtype, {
    message: 'Name the milestone',
    path: ['subtype'],
  })
  .refine((value) => !value.details.funeralDate || value.details.funeralDate >= value.date, {
    message: 'The funeral cannot be before the death',
    path: ['details', 'funeralDate'],
  });
export type RegistryRecordInput = z.infer<typeof registryRecordInputSchema>;

/** Corrections keep the number and require a note for the audit trail. */
export const registryRecordCorrectionSchema = z.object({
  record: registryRecordInputSchema,
  correctionNote: requiredText(3, RECORDS_LIMITS.correctionNoteMax),
});
export type RegistryRecordCorrection = z.infer<typeof registryRecordCorrectionSchema>;

export const voidRegistryRecordBodySchema = z.object({
  reason: requiredText(3, RECORDS_LIMITS.correctionNoteMax),
});
export type VoidRegistryRecordBody = z.infer<typeof voidRegistryRecordBodySchema>;

export const REGISTRY_RECORD_SORTS = ['date_desc', 'date_asc', 'number'] as const;
export type RegistryRecordSort = (typeof REGISTRY_RECORD_SORTS)[number];

export const registryRecordListQuerySchema = paginationQuerySchema.extend({
  type: z.enum(REGISTRY_RECORD_TYPES).optional(),
  year: z.coerce.number().int().min(1800).max(3000).optional(),
  status: z.enum(REGISTRY_RECORD_STATUSES).optional(),
  personId: idSchema.optional(),
  sort: z.enum(REGISTRY_RECORD_SORTS).default('date_desc'),
});
export type RegistryRecordListQuery = z.infer<typeof registryRecordListQuerySchema>;

export const registryRecordListSchema = paginatedSchema(registryRecordSchema);
export type RegistryRecordList = z.infer<typeof registryRecordListSchema>;

// ---------------------------------------------------------------------------------------------
// Side effects on the people named
// ---------------------------------------------------------------------------------------------

export const RECORD_SIDE_EFFECT_KINDS = [
  'membership_status',
  'baptism_date',
  'wedding_date',
  'marital_status',
] as const;
export type RecordSideEffectKind = (typeof RECORD_SIDE_EFFECT_KINDS)[number];

export const recordSideEffectSchema = z.object({
  personId: idSchema,
  name: z.string(),
  kind: z.enum(RECORD_SIDE_EFFECT_KINDS),
  from: z.string().nullable(),
  to: z.string(),
});
export type RecordSideEffect = z.infer<typeof recordSideEffectSchema>;

/** What `recordSideEffects` needs to know about each linked person. */
export type SideEffectPerson = {
  id: string;
  name: string;
  membershipStatus: PersonMembershipStatus;
  baptismDate: string | null;
  weddingDate: string | null;
  maritalStatus: MaritalStatus;
};

/**
 * The changes a record makes to the people it names, shown in the confirmation dialog and
 * applied by the API only when the user agreed (`applyStatusEffect`): the subject's membership
 * status (death and transfer out make them inactive; transfer in, sidi and baptism can upgrade
 * it), the baptism date on their profile, and the wedding date and marital status of a couple.
 */
export const recordSideEffects = (
  record: {
    type: RegistryRecordType;
    subtype: string | null;
    date: string;
    people: readonly { personId: string | null; role: RecordPersonRole }[];
  },
  persons: ReadonlyMap<string, SideEffectPerson>,
): RecordSideEffect[] => {
  const effects: RecordSideEffect[] = [];
  const primary = recordPrimaryRole(record.type);
  for (const entry of record.people) {
    if (entry.role !== primary || !entry.personId) continue;
    const person = persons.get(entry.personId);
    if (!person) continue;
    const add = (kind: RecordSideEffectKind, from: string | null, to: string) =>
      effects.push({ personId: person.id, name: person.name, kind, from, to });
    const status = recordStatusEffect(record.type, record.subtype, person.membershipStatus);
    if (status) add('membership_status', person.membershipStatus, status);
    if (record.type === 'baptism' && person.baptismDate !== record.date) {
      add('baptism_date', person.baptismDate, record.date);
    }
    if (record.type === 'marriage') {
      if (person.weddingDate !== record.date) add('wedding_date', person.weddingDate, record.date);
      if (person.maritalStatus !== 'married')
        add('marital_status', person.maritalStatus, 'married');
    }
  }
  return effects;
};

export const recordPreviewBodySchema = z.object({
  record: registryRecordInputSchema,
  /** When correcting: the record keeps its number. */
  recordId: idSchema.optional(),
});
export type RecordPreviewBody = z.infer<typeof recordPreviewBodySchema>;

export const recordPreviewSchema = z.object({
  /** The number the record will get (or keeps when correcting). */
  number: z.string(),
  effects: z.array(recordSideEffectSchema),
  /** An active record of a once-per-person type already exists for the subject. */
  duplicate: z.object({ id: idSchema, number: z.string() }).nullable(),
});
export type RecordPreview = z.infer<typeof recordPreviewSchema>;

// ---------------------------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------------------------

export const registryRecordResponseSchema = z.object({
  record: registryRecordSchema,
  effects: z.array(recordSideEffectSchema).default([]),
});
export type RegistryRecordResponse = z.infer<typeof registryRecordResponseSchema>;

export const RECORD_HISTORY_ACTIONS = ['create', 'correct', 'void'] as const;
export type RecordHistoryAction = (typeof RECORD_HISTORY_ACTIONS)[number];

export const recordHistoryEntrySchema = z.object({
  id: idSchema,
  action: z.enum(RECORD_HISTORY_ACTIONS),
  actorName: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  /** The correction note or void reason. */
  note: z.string().nullable(),
  /** Fields a correction changed (`date`, `people`, `details.burialPlace`, ...). */
  fields: z.array(z.string()),
  effects: z.array(recordSideEffectSchema),
});
export type RecordHistoryEntry = z.infer<typeof recordHistoryEntrySchema>;

export const recordCertificateSchema = z.object({
  signatoryName: z.string().nullable(),
  signatoryTitle: z.string().nullable(),
  footer: z.string().nullable(),
});
export type RecordCertificate = z.infer<typeof recordCertificateSchema>;

export const registryRecordDetailSchema = z.object({
  record: registryRecordSchema,
  canManage: z.boolean(),
  certificate: recordCertificateSchema,
  /** Only for people who may view the register; empty for someone opening their own record. */
  history: z.array(recordHistoryEntrySchema),
});
export type RegistryRecordDetail = z.infer<typeof registryRecordDetailSchema>;

export const recordsOverviewSchema = z.object({
  year: z.number().int(),
  /** Years that have records, newest first (always includes the current year). */
  years: z.array(z.number().int()),
  types: z.array(
    z.object({
      type: z.enum(REGISTRY_RECORD_TYPES),
      total: z.number().int().nonnegative(),
      thisYear: z.number().int().nonnegative(),
      lastNumber: z.string().nullable(),
    }),
  ),
  voided: z.number().int().nonnegative(),
  recent: z.array(registryRecordSchema),
});
export type RecordsOverview = z.infer<typeof recordsOverviewSchema>;

/** `GET /people/:personId/records`: what the person page and timeline show. */
export const personRecordsSchema = z.object({
  items: z.array(
    registryRecordSchema
      .pick({
        id: true,
        type: true,
        subtype: true,
        number: true,
        date: true,
        place: true,
        status: true,
        people: true,
      })
      .extend({ role: z.enum(RECORD_PERSON_ROLES) }),
  ),
});
export type PersonRecords = z.infer<typeof personRecordsSchema>;
export type PersonRecordItem = PersonRecords['items'][number];

export const recordsPeopleQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type RecordsPeopleQuery = z.infer<typeof recordsPeopleQuerySchema>;

export const recordsPeopleSchema = z.object({
  items: z.array(personSummarySchema.extend({ birthDate: isoDateSchema.nullable() })),
});
export type RecordsPeople = z.infer<typeof recordsPeopleSchema>;

// ---------------------------------------------------------------------------------------------
// Rules shared by the API and the interface
// ---------------------------------------------------------------------------------------------

/** See the register books; managing implies viewing. */
export const canViewRegistry = (access: Pick<AccessLike, 'permissions'>): boolean =>
  hasAny(access, ['records.view', 'records.manage']);

export const canManageRecords = (access: Pick<AccessLike, 'permissions'>): boolean =>
  has(access, 'records.manage');

/** The caller is named on the record in one of `OWN_RECORD_ROLES`. */
export const isOwnRecord = (
  access: Pick<AccessLike, 'personId'>,
  record: { people: readonly { personId: string | null; role: RecordPersonRole }[] },
): boolean =>
  access.personId !== null &&
  record.people.some(
    (person) => person.personId === access.personId && OWN_RECORD_ROLES.includes(person.role),
  );

/** Open a record and print its certificate: register viewers, and members for their own. */
export const canViewRegistryRecord = (
  access: Pick<AccessLike, 'permissions' | 'personId'>,
  record: { people: readonly { personId: string | null; role: RecordPersonRole }[] },
): boolean => canViewRegistry(access) || isOwnRecord(access, record);

/** The names of the people a record is about, in order ("Budi & Sari" for a couple). */
export const recordSubjectNames = (record: {
  type: RegistryRecordType;
  people: readonly { name: string; role: RecordPersonRole; position: number }[];
}): string[] => {
  const primary = recordPrimaryRole(record.type);
  return [...record.people]
    .filter((person) => person.role === primary)
    .sort((a, b) => a.position - b.position)
    .map((person) => person.name);
};

/** Shown on the type badge: "Baptis dewasa", the milestone name, or the type label. */
export const recordTypeText = (
  record: { type: RegistryRecordType; subtype: string | null },
  locale: 'id' | 'en',
): string => {
  if (record.type === 'baptism' && (record.subtype === 'infant' || record.subtype === 'adult')) {
    return BAPTISM_KIND_LABELS[record.subtype][locale];
  }
  if (record.type === 'custom' && record.subtype) return record.subtype;
  return REGISTRY_RECORD_TYPE_LABELS[record.type][locale];
};

export const isPersonMembershipStatus = (value: string): value is PersonMembershipStatus =>
  (PERSON_MEMBERSHIP_STATUSES as readonly string[]).includes(value);

export const isMaritalStatus = (value: string): value is MaritalStatus =>
  (MARITAL_STATUSES as readonly string[]).includes(value);
