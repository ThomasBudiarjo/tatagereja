// Zod schemas, enums and labels owned by the records module. Only that module edits this file;
// it is already exported from the package index. See docs/ARCHITECTURE-MODULES.md.
import { z } from 'zod';
import { LIMITS, type PersonMembershipStatus } from '../constants';
import type { LocalizedText } from '../localized';
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

export const RECORDS_LIMITS = {
  peoplePerRecordMax: 20,
  numberPatternMax: 60,
  correctionNoteMax: 500,
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

export const REGISTRY_RECORD_STATUSES = ['active', 'voided'] as const;
export type RegistryRecordStatus = (typeof REGISTRY_RECORD_STATUSES)[number];

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

const numberPatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(RECORDS_LIMITS.numberPatternMax)
  .refine((value) => /\{N+\}/.test(value), 'The pattern needs a sequence such as {NNN}');

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
  /** Atestasi: the other church. */
  otherChurchName: optionalText(LIMITS.nameMax),
  otherChurchAddress: optionalText(LIMITS.shortTextMax),
  letterNumber: optionalText(LIMITS.shortTextMax),
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
});
export type RecordDetails = z.infer<typeof recordDetailsSchema>;

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

const subjectCount = (people: readonly RecordPersonInput[], role: RecordPersonRole) =>
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
    /** Apply `recordStatusEffect` to the subject (the user confirmed it). */
    applyStatusEffect: z.boolean().default(false),
  })
  .refine(
    (value) =>
      value.type === 'marriage'
        ? subjectCount(value.people, 'spouse') === 2
        : subjectCount(value.people, 'subject') === 1,
    {
      message: 'A marriage needs two spouses; other records need exactly one person',
      path: ['people'],
    },
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

export const registryRecordListQuerySchema = paginationQuerySchema.extend({
  type: z.enum(REGISTRY_RECORD_TYPES).optional(),
  year: z.coerce.number().int().min(1800).max(3000).optional(),
  status: z.enum(REGISTRY_RECORD_STATUSES).optional(),
  personId: idSchema.optional(),
});
export type RegistryRecordListQuery = z.infer<typeof registryRecordListQuerySchema>;

export const registryRecordListSchema = paginatedSchema(registryRecordSchema);
export type RegistryRecordList = z.infer<typeof registryRecordListSchema>;

/** `GET /people/:personId/records`: what the person page and timeline show. */
export const personRecordsSchema = z.object({
  items: z.array(
    registryRecordSchema.pick({
      id: true,
      type: true,
      subtype: true,
      number: true,
      date: true,
      place: true,
      status: true,
    }),
  ),
});
export type PersonRecords = z.infer<typeof personRecordsSchema>;

export const recordStatusEffectPreviewSchema = z.object({
  personId: idSchema,
  currentStatus: z.string(),
  nextStatus: z.string().nullable(),
});
export type RecordStatusEffectPreview = z.infer<typeof recordStatusEffectPreviewSchema>;
