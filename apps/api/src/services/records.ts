import {
  ONCE_PER_PERSON_TYPES,
  PRIVATE_RECORD_DETAILS,
  formatRecordNumber,
  recordDetailsSchema,
  recordNumberPattern,
  recordPrimaryRole,
  recordSideEffects,
  recordsSettingsSchema,
  type RecordSideEffect,
  type RecordsSettings,
  type RegistryRecord,
  type RegistryRecordInput,
  type RegistryRecordType,
  type SideEffectPerson,
} from '@tatagereja/shared';
import { and, asc, eq, inArray, max, ne } from 'drizzle-orm';
import type { Queryable } from '../db/client';
import type { ChurchRow, RegistryRecordPersonRow, RegistryRecordRow } from '../db/schema';
import { people, personPrivateDetails, registryRecordPeople, registryRecords } from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';
import { redact } from './audit';
import { moduleSettings } from './modules';

/*
 * Church registry helpers shared by the records routers: numbering, the people named on a
 * record, side effects on their profiles and audit snapshots.
 */

export const recordsSettingsOf = (church: Pick<ChurchRow, 'settings'>): RecordsSettings =>
  moduleSettings(church, 'records', recordsSettingsSchema);

export const fullName = (person: { firstName: string; lastName: string | null }): string =>
  [person.firstName, person.lastName].filter(Boolean).join(' ');

export const loadRecordRow = (db: Queryable, churchId: string, id: string): RegistryRecordRow => {
  const row = db
    .select()
    .from(registryRecords)
    .where(and(eq(registryRecords.id, id), eq(registryRecords.churchId, churchId)))
    .get();
  if (!row) throw notFound('Record');
  return row;
};

export const toRegistryRecord = (
  row: RegistryRecordRow,
  personRows: RegistryRecordPersonRow[],
): RegistryRecord => {
  const details = recordDetailsSchema.safeParse(row.details ?? {});
  return {
    id: row.id,
    churchId: row.churchId,
    type: row.type,
    subtype: row.subtype,
    year: row.year,
    sequence: row.sequence,
    number: row.number,
    date: row.date,
    place: row.place,
    officiantPersonId: row.officiantPersonId,
    officiantName: row.officiantName,
    details: details.success ? details.data : recordDetailsSchema.parse({}),
    documentUrl: row.documentUrl,
    notes: row.notes,
    people: personRows
      .sort((a, b) => a.position - b.position)
      .map((person) => ({
        id: person.id,
        personId: person.personId,
        name: person.name,
        role: person.role,
        position: person.position,
      })),
    status: row.status,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

/** Records with their people, in the order given. */
export const hydrateRecords = (db: Queryable, rows: RegistryRecordRow[]): RegistryRecord[] => {
  if (rows.length === 0) return [];
  const byRecord = new Map<string, RegistryRecordPersonRow[]>();
  for (const person of db
    .select()
    .from(registryRecordPeople)
    .where(
      inArray(
        registryRecordPeople.recordId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(registryRecordPeople.position))
    .all()) {
    const list = byRecord.get(person.recordId) ?? [];
    list.push(person);
    byRecord.set(person.recordId, list);
  }
  return rows.map((row) => toRegistryRecord(row, byRecord.get(row.id) ?? []));
};

export const hydrateRecord = (db: Queryable, row: RegistryRecordRow): RegistryRecord =>
  hydrateRecords(db, [row])[0]!;

/** The next sequence of a type in a year. Voided records keep their numbers, so they count. */
export const nextSequence = (
  db: Queryable,
  churchId: string,
  type: RegistryRecordType,
  year: number,
): number =>
  (db
    .select({ value: max(registryRecords.sequence) })
    .from(registryRecords)
    .where(
      and(
        eq(registryRecords.churchId, churchId),
        eq(registryRecords.type, type),
        eq(registryRecords.year, year),
      ),
    )
    .get()?.value ?? 0) + 1;

export const nextNumber = (
  db: Queryable,
  church: Pick<ChurchRow, 'id' | 'settings'>,
  type: RegistryRecordType,
  year: number,
): { sequence: number; number: string } => {
  const sequence = nextSequence(db, church.id, type, year);
  const number = formatRecordNumber(recordNumberPattern(recordsSettingsOf(church), type), {
    type,
    year,
    sequence,
  });
  return { sequence, number };
};

/** The year in the church's time zone. */
export const currentYearIn = (timezone: string): number => {
  try {
    return Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric' }).format(new Date()),
    );
  } catch {
    return new Date().getUTCFullYear();
  }
};

type ResolvedPerson = {
  personId: string | null;
  name: string;
  role: RegistryRecordInput['people'][number]['role'];
  position: number;
};

/**
 * Loads every linked person (and the officiant) inside the church, answering 404 for an id
 * from elsewhere, and fills in names from the person records.
 */
export const resolveRecordPeople = (
  db: Queryable,
  churchId: string,
  input: Pick<RegistryRecordInput, 'people' | 'officiantPersonId' | 'officiantName'>,
): { people: ResolvedPerson[]; officiantName: string | null } => {
  const ids = [
    ...new Set([
      ...input.people.flatMap((person) => (person.personId ? [person.personId] : [])),
      ...(input.officiantPersonId ? [input.officiantPersonId] : []),
    ]),
  ];
  const found = new Map(
    (ids.length
      ? db
          .select({ id: people.id, firstName: people.firstName, lastName: people.lastName })
          .from(people)
          .where(and(eq(people.churchId, churchId), inArray(people.id, ids)))
          .all()
      : []
    ).map((row) => [row.id, fullName(row)]),
  );
  if (found.size !== ids.length) throw notFound('Person');
  return {
    people: input.people.map((person, position) => ({
      personId: person.personId,
      name: person.personId ? found.get(person.personId)! : (person.name ?? ''),
      role: person.role,
      position,
    })),
    officiantName: input.officiantPersonId
      ? found.get(input.officiantPersonId)!
      : input.officiantName,
  };
};

export const insertRecordPeople = (
  db: Queryable,
  churchId: string,
  recordId: string,
  persons: ResolvedPerson[],
) => {
  db.delete(registryRecordPeople).where(eq(registryRecordPeople.recordId, recordId)).run();
  if (persons.length === 0) return;
  db.insert(registryRecordPeople)
    .values(persons.map((person) => ({ id: newId(), churchId, recordId, ...person })))
    .run();
};

/** Subtypes only mean something for baptism (infant/adult) and custom milestones. */
export const normalizeSubtype = (input: Pick<RegistryRecordInput, 'type' | 'subtype'>) =>
  input.type === 'baptism' || input.type === 'custom' ? input.subtype : null;

/**
 * An active record of a once-per-person type for the same subject, other than `exceptId`.
 * Baptism, sidi, child dedication and death happen once.
 */
export const findDuplicate = (
  db: Queryable,
  churchId: string,
  input: Pick<RegistryRecordInput, 'type' | 'people'>,
  exceptId?: string,
): { id: string; number: string } | null => {
  if (!ONCE_PER_PERSON_TYPES.includes(input.type)) return null;
  const subject = input.people.find((person) => person.role === recordPrimaryRole(input.type));
  if (!subject?.personId) return null;
  const conditions = [
    eq(registryRecords.churchId, churchId),
    eq(registryRecords.type, input.type),
    eq(registryRecords.status, 'active'),
    eq(registryRecordPeople.personId, subject.personId),
    eq(registryRecordPeople.role, 'subject'),
  ];
  if (exceptId) conditions.push(ne(registryRecords.id, exceptId));
  return (
    db
      .select({ id: registryRecords.id, number: registryRecords.number })
      .from(registryRecords)
      .innerJoin(registryRecordPeople, eq(registryRecordPeople.recordId, registryRecords.id))
      .where(and(...conditions))
      .get() ?? null
  );
};

export const assertNoDuplicate = (...args: Parameters<typeof findDuplicate>) => {
  const duplicate = findDuplicate(...args);
  if (duplicate) {
    throw conflict(
      `This person already has an active record of this kind (${duplicate.number}). Correct or void it instead.`,
    );
  }
};

/** What the side effects need to know about the linked people. */
const sideEffectPeople = (
  db: Queryable,
  churchId: string,
  personIds: string[],
): Map<string, SideEffectPerson> => {
  if (personIds.length === 0) return new Map();
  return new Map(
    db
      .select({
        id: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
        membershipStatus: people.membershipStatus,
        weddingDate: people.weddingDate,
        baptismDate: personPrivateDetails.baptismDate,
        maritalStatus: personPrivateDetails.maritalStatus,
      })
      .from(people)
      .leftJoin(personPrivateDetails, eq(personPrivateDetails.personId, people.id))
      .where(and(eq(people.churchId, churchId), inArray(people.id, personIds)))
      .all()
      .map((row) => [
        row.id,
        {
          id: row.id,
          name: fullName(row),
          membershipStatus: row.membershipStatus,
          weddingDate: row.weddingDate,
          baptismDate: row.baptismDate ?? null,
          maritalStatus: row.maritalStatus ?? 'unspecified',
        },
      ]),
  );
};

export const previewSideEffects = (
  db: Queryable,
  churchId: string,
  input: Pick<RegistryRecordInput, 'type' | 'subtype' | 'date' | 'people'>,
): RecordSideEffect[] => {
  const record = { ...input, subtype: normalizeSubtype(input) };
  const ids = input.people.flatMap((person) => (person.personId ? [person.personId] : []));
  return recordSideEffects(record, sideEffectPeople(db, churchId, ids));
};

/** Applies confirmed side effects to the people's profiles. Call inside the record's transaction. */
export const applySideEffects = (db: Queryable, churchId: string, effects: RecordSideEffect[]) => {
  const now = nowIso();
  for (const effect of effects) {
    const where = and(eq(people.id, effect.personId), eq(people.churchId, churchId));
    switch (effect.kind) {
      case 'membership_status':
        db.update(people)
          .set({
            membershipStatus: effect.to as SideEffectPerson['membershipStatus'],
            updatedAt: now,
          })
          .where(where)
          .run();
        break;
      case 'wedding_date':
        db.update(people).set({ weddingDate: effect.to, updatedAt: now }).where(where).run();
        break;
      case 'baptism_date':
      case 'marital_status': {
        const patch =
          effect.kind === 'baptism_date'
            ? { baptismDate: effect.to }
            : { maritalStatus: effect.to as SideEffectPerson['maritalStatus'] };
        db.insert(personPrivateDetails)
          .values({ personId: effect.personId, churchId, ...patch, updatedAt: now })
          .onConflictDoUpdate({
            target: personPrivateDetails.personId,
            set: { ...patch, updatedAt: now },
          })
          .run();
        break;
      }
    }
  }
};

/** The record as the audit log keeps it, without private details and notes. */
export const auditSnapshot = (record: RegistryRecord) => ({
  type: record.type,
  subtype: record.subtype,
  number: record.number,
  date: record.date,
  place: record.place,
  officiantName: record.officiantName,
  details: record.details,
  documentUrl: record.documentUrl,
  notes: record.notes,
  people: record.people.map((person) => `${person.role}: ${person.name}`),
  status: record.status,
});

/** Redacts the notes and private details of a snapshot (or a part of one). */
export const redactRecordSnapshot = <T>(value: T): T =>
  redact(value, ['notes', ...PRIVATE_RECORD_DETAILS]);

/**
 * The fields that differ between two snapshots, with detail fields as `details.<key>`. Taken
 * from the raw values, before redaction hides what changed.
 */
export const changedFields = (
  before: ReturnType<typeof auditSnapshot>,
  after: ReturnType<typeof auditSnapshot>,
): string[] => {
  const fields: string[] = [];
  for (const key of Object.keys(after) as (keyof typeof after)[]) {
    if (key === 'details') {
      const keys = new Set([...Object.keys(before.details), ...Object.keys(after.details)]);
      for (const detail of keys) {
        const a = before.details[detail as keyof typeof before.details] ?? null;
        const b = after.details[detail as keyof typeof after.details] ?? null;
        if (a !== b) fields.push(`details.${detail}`);
      }
    } else if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      fields.push(key);
    }
  }
  return fields;
};
