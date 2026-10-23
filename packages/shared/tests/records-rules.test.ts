import { describe, expect, it } from 'bun:test';
import {
  canViewRegistry,
  canViewRegistryRecord,
  numberPatternSchema,
  recordSideEffects,
  recordSubjectNames,
  recordTypeText,
  registryRecordInputSchema,
  type Permission,
  type SideEffectPerson,
} from '../src';

const access = (permissions: Permission[], personId: string | null = null) => ({
  userId: 'u1',
  personId,
  permissions,
});

const person = (id: string, patch: Partial<SideEffectPerson> = {}): SideEffectPerson => ({
  id,
  name: `Person ${id}`,
  membershipStatus: 'visitor',
  baptismDate: null,
  weddingDate: null,
  maritalStatus: 'single',
  ...patch,
});

describe('records rules', () => {
  it('lets viewers, managers and the people named open a record', () => {
    const record = {
      people: [
        { personId: 'p1', role: 'subject' as const },
        { personId: 'p2', role: 'witness' as const },
        { personId: 'p3', role: 'mother' as const },
      ],
    };
    expect(canViewRegistry(access(['records.manage']))).toBe(true);
    expect(canViewRegistryRecord(access(['records.view']), record)).toBe(true);
    expect(canViewRegistryRecord(access([], 'p1'), record)).toBe(true);
    expect(canViewRegistryRecord(access([], 'p3'), record)).toBe(true);
    expect(canViewRegistryRecord(access([], 'p2'), record)).toBe(false);
    expect(canViewRegistryRecord(access(['people.view'], null), record)).toBe(false);
  });

  it('describes side effects on the people a record is about', () => {
    const persons = new Map([
      ['a', person('a', { membershipStatus: 'member' })],
      ['b', person('b', { maritalStatus: 'married', weddingDate: '2026-05-02' })],
      ['c', person('c')],
    ]);
    expect(
      recordSideEffects(
        {
          type: 'death',
          subtype: null,
          date: '2026-05-02',
          people: [{ personId: 'a', role: 'subject' }],
        },
        persons,
      ),
    ).toEqual([
      {
        personId: 'a',
        name: 'Person a',
        kind: 'membership_status',
        from: 'member',
        to: 'inactive',
      },
    ]);
    const marriage = recordSideEffects(
      {
        type: 'marriage',
        subtype: null,
        date: '2026-05-02',
        people: [
          { personId: 'a', role: 'spouse' },
          { personId: 'b', role: 'spouse' },
          { personId: 'c', role: 'witness' },
        ],
      },
      persons,
    );
    expect(marriage.map((effect) => `${effect.personId}:${effect.kind}`)).toEqual([
      'a:wedding_date',
      'a:marital_status',
    ]);
    const adult = recordSideEffects(
      {
        type: 'baptism',
        subtype: 'adult',
        date: '2026-05-02',
        people: [{ personId: 'c', role: 'subject' }],
      },
      persons,
    );
    expect(adult.map((effect) => [effect.kind, effect.to])).toEqual([
      ['membership_status', 'member'],
      ['baptism_date', '2026-05-02'],
    ]);
    expect(
      recordSideEffects(
        {
          type: 'custom',
          subtype: 'Ulang tahun',
          date: '2026-05-02',
          people: [{ personId: 'c', role: 'subject' }],
        },
        persons,
      ),
    ).toEqual([]);
  });

  it('needs the year and a sequence in number patterns', () => {
    expect(numberPatternSchema.safeParse('B/{YYYY}/{NNN}').success).toBe(true);
    expect(numberPatternSchema.safeParse('{TYPE}-{YY}-{N}').success).toBe(true);
    expect(numberPatternSchema.safeParse('B/{NNN}').success).toBe(false);
    expect(numberPatternSchema.safeParse('B/{YYYY}').success).toBe(false);
  });

  it('checks the roles that fit each kind of record', () => {
    const base = { type: 'death', date: '2026-05-02' };
    expect(
      registryRecordInputSchema.safeParse({
        ...base,
        people: [
          { name: 'A', role: 'subject' },
          { name: 'B', role: 'godparent' },
        ],
      }).success,
    ).toBe(false);
    expect(
      registryRecordInputSchema.safeParse({ ...base, people: [{ name: 'A', role: 'subject' }] })
        .success,
    ).toBe(true);
  });

  it('names records for lists and badges', () => {
    const record = {
      type: 'marriage' as const,
      subtype: null,
      people: [
        { name: 'Sari', role: 'spouse' as const, position: 1 },
        { name: 'Saksi', role: 'witness' as const, position: 2 },
        { name: 'Budi', role: 'spouse' as const, position: 0 },
      ],
    };
    expect(recordSubjectNames(record)).toEqual(['Budi', 'Sari']);
    expect(recordTypeText({ type: 'baptism', subtype: 'adult' }, 'id')).toBe('Baptis dewasa');
    expect(recordTypeText({ type: 'custom', subtype: 'Peneguhan' }, 'en')).toBe('Peneguhan');
    expect(recordTypeText(record, 'en')).toBe('Marriage blessing');
  });
});
