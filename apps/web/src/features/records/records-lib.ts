import {
  PERSON_STATUS_TEXT,
  RECORD_ISSUES,
  REGISTRY_RECORD_TYPES,
  isMaritalStatus,
  isPersonMembershipStatus,
  localize,
  recordSubjectNames,
  type RecordDetailKey,
  type RecordPersonRole,
  type RecordSideEffect,
  type RecordSideEffectKind,
  type RegistryRecordType,
} from '@tatagereja/shared';
import {
  Baby,
  BookCheck,
  Droplets,
  Flower2,
  Gem,
  LogIn,
  LogOut,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleTone } from '@/components/ui/tone';
import { useI18n, type MessageKey } from '@/lib/i18n';

export const RECORDS_TONE: ModuleTone = 'indigo';

/** Icon, colour and wording of each kind of record. */
export const RECORD_TYPE_META: Record<
  RegistryRecordType,
  {
    icon: LucideIcon;
    tone: ModuleTone;
    /** "Record a baptism" */
    newKey: MessageKey;
    /** One line under the type card in the picker. */
    hintKey: MessageKey;
    /** The certificate heading ("SURAT BAPTIS"). */
    certificateKey: MessageKey;
  }
> = {
  baptism: {
    icon: Droplets,
    tone: 'sky',
    newKey: 'records.newBaptism',
    hintKey: 'records.hintBaptism',
    certificateKey: 'records.certBaptism',
  },
  sidi: {
    icon: BookCheck,
    tone: 'violet',
    newKey: 'records.newSidi',
    hintKey: 'records.hintSidi',
    certificateKey: 'records.certSidi',
  },
  marriage: {
    icon: Gem,
    tone: 'rose',
    newKey: 'records.newMarriage',
    hintKey: 'records.hintMarriage',
    certificateKey: 'records.certMarriage',
  },
  child_dedication: {
    icon: Baby,
    tone: 'amber',
    newKey: 'records.newDedication',
    hintKey: 'records.hintDedication',
    certificateKey: 'records.certDedication',
  },
  transfer_in: {
    icon: LogIn,
    tone: 'emerald',
    newKey: 'records.newTransferIn',
    hintKey: 'records.hintTransferIn',
    certificateKey: 'records.certTransferIn',
  },
  transfer_out: {
    icon: LogOut,
    tone: 'teal',
    newKey: 'records.newTransferOut',
    hintKey: 'records.hintTransferOut',
    certificateKey: 'records.certTransferOut',
  },
  death: {
    icon: Flower2,
    tone: 'slate',
    newKey: 'records.newDeath',
    hintKey: 'records.hintDeath',
    certificateKey: 'records.certDeath',
  },
  custom: {
    icon: Sparkles,
    tone: 'olive',
    newKey: 'records.newCustom',
    hintKey: 'records.hintCustom',
    certificateKey: 'records.certCustom',
  },
};

export const isRecordType = (value: string): value is RegistryRecordType =>
  (REGISTRY_RECORD_TYPES as readonly string[]).includes(value);

/** Labels of the detail fields, shared by the form, the record page and the history. */
export const DETAIL_LABEL_KEYS: Record<RecordDetailKey, MessageKey> = {
  otherChurchName: 'records.fieldOtherChurch',
  otherChurchAddress: 'records.fieldOtherChurchAddress',
  letterNumber: 'records.fieldLetterNumber',
  letterDate: 'records.fieldLetterDate',
  civilRegistrationNumber: 'records.fieldCivilNumber',
  civilRegistrationDate: 'records.fieldCivilDate',
  causeOfDeath: 'records.fieldCauseOfDeath',
  funeralDate: 'records.fieldFuneralDate',
  burialPlace: 'records.fieldBurialPlace',
  birthPlace: 'records.fieldBirthPlace',
  birthDate: 'records.fieldBirthDate',
  verse: 'records.fieldVerse',
};

/** For transfers the other church is where they came from or where they go. */
export const otherChurchLabelKey = (type: RegistryRecordType): MessageKey =>
  type === 'transfer_in'
    ? 'records.fieldOriginChurch'
    : type === 'transfer_out'
      ? 'records.fieldDestinationChurch'
      : 'records.fieldOtherChurch';

export const DATE_DETAILS: readonly RecordDetailKey[] = [
  'letterDate',
  'civilRegistrationDate',
  'funeralDate',
  'birthDate',
];

/** The other fields a correction can change, by audit name. */
export const FIELD_LABEL_KEYS: Record<string, MessageKey> = {
  subtype: 'records.fieldSubtype',
  date: 'records.fieldDate',
  place: 'records.fieldPlace',
  officiantName: 'records.fieldOfficiant',
  documentUrl: 'records.fieldDocument',
  notes: 'records.fieldNotes',
  people: 'records.sectionPeople',
};

export const SIDE_EFFECT_KEYS: Record<RecordSideEffectKind, MessageKey> = {
  membership_status: 'records.effectStatus',
  baptism_date: 'records.effectBaptismDate',
  wedding_date: 'records.effectWeddingDate',
  marital_status: 'records.effectMarital',
};

/** How each role is called on a record of a given type ("Ahli waris" on a death record). */
export const roleLabelKey = (type: RegistryRecordType, role: RecordPersonRole): MessageKey => {
  if (role === 'subject') {
    if (type === 'death') return 'records.roleDeceased';
    if (type === 'baptism') return 'records.roleBaptised';
    if (type === 'child_dedication') return 'records.roleChild';
    return 'records.roleSubject';
  }
  if (role === 'other' && type === 'death') return 'records.roleFamily';
  return (
    {
      spouse: 'records.roleSpouse',
      father: 'records.roleFather',
      mother: 'records.roleMother',
      godparent: type === 'sidi' ? 'records.roleMentor' : 'records.roleGodparent',
      witness: 'records.roleWitness',
      other: 'records.roleOther',
    } as const
  )[role];
};

/** "Budi Santoso" or "Andreas & Ruth"; the number when nobody is named. */
export const recordTitle = (
  record: Parameters<typeof recordSubjectNames>[0] & { number: string },
) => recordSubjectNames(record).join(' & ') || record.number;

/** The current year in the church's time zone, for default filters. */
export const yearNow = (timezone: string): number => {
  try {
    return Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric' }).format(new Date()),
    );
  } catch {
    return new Date().getFullYear();
  }
};

/** A side effect value in words ("Anggota", "16 Agustus 2026", "Menikah"). */
export function useEffectValue() {
  const { t, locale, formatDate } = useI18n();
  return (effect: Pick<RecordSideEffect, 'kind'>, value: string | null): string => {
    if (value === null) return t('records.effectEmpty');
    if (effect.kind === 'membership_status' && isPersonMembershipStatus(value)) {
      return localize(PERSON_STATUS_TEXT[value], locale);
    }
    if (effect.kind === 'marital_status' && isMaritalStatus(value)) {
      return t(`records.marital_${value}` as MessageKey);
    }
    if (effect.kind === 'baptism_date' || effect.kind === 'wedding_date') {
      return formatDate(value, 'dateShort');
    }
    return value;
  };
}

const ISSUE_BY_MESSAGE = new Map<string, MessageKey>(
  Object.entries(RECORD_ISSUES).map(([issue, message]) => [
    message,
    `records.issue_${issue}` as MessageKey,
  ]),
);

/** Shows the registry's own validation messages (from the schema or the API) in the locale. */
export function useIssueText() {
  const { t } = useI18n();
  return (message: string | undefined): string | undefined => {
    if (!message) return message;
    const key = ISSUE_BY_MESSAGE.get(message);
    return key ? t(key) : message;
  };
}
