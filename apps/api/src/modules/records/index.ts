import {
  OWN_RECORD_ROLES,
  RECORD_ISSUES,
  RECORDS_LIMITS,
  RECORD_TYPE_CODES,
  REGISTRY_RECORD_TYPES,
  canViewRegistry,
  churchIdParamsSchema,
  churchParamsSchema,
  recordNumberPattern,
  recordsPeopleQuerySchema,
  recordsSettingsSchema,
  type PersonRecordItem,
  type RecordsSettings,
  type RegistryRecordType,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ChurchRow } from '../../db/schema';
import { people, registryRecordPeople, registryRecords } from '../../db/schema';
import type { Deps } from '../../deps';
import { notFound, validationError } from '../../lib/errors';
import { likePattern } from '../../lib/query';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { moduleStatus, saveModuleSettings } from '../../services/modules';
import {
  currentYearIn,
  hydrateRecords,
  nextNumber,
  recordsSettingsOf,
} from '../../services/records';
import { recordEntriesRouter } from './entries';

const view = { module: 'records', permission: ['records.view', 'records.manage'] } as const;
/** Numbering and the certificate signatory: registry managers and church administrators. */
const settingsManagers = ['records.manage', 'settings.manage'] as const;

const nextNumbersOf = (db: Queryable, church: ChurchRow) => {
  const year = currentYearIn(church.timezone);
  return Object.fromEntries(
    REGISTRY_RECORD_TYPES.map((type) => [type, nextNumber(db, church, type, year).number]),
  ) as Record<RegistryRecordType, string>;
};

/**
 * What a pattern prints apart from the year and sequence: `{TYPE}` spelled out and the padding
 * dropped, so `B/{YYYY}/{N}` and `B/{YYYY}/{NNN}` (both "B/2026/100" one day) compare equal.
 */
const patternShape = (pattern: string, type: RegistryRecordType) =>
  pattern.replace(/\{TYPE\}/g, RECORD_TYPE_CODES[type]).replace(/\{N+\}/g, '{N}');

/** Two types whose patterns print the same numbers would hand out the same numbers. */
const assertDistinctPatterns = (settings: RecordsSettings) => {
  const seen = new Map<string, RegistryRecordType>();
  for (const type of REGISTRY_RECORD_TYPES) {
    const pattern = patternShape(recordNumberPattern(settings, type), type);
    const other = seen.get(pattern);
    if (other) {
      throw validationError('Each kind of record needs its own number pattern', [
        {
          path: `numberPatterns.${type}`,
          message: RECORD_ISSUES.patternTaken,
        },
      ]);
    }
    seen.set(pattern, type);
  }
};

/**
 * `status` is the wiring check (200 with the caller's records permissions, or 403
 * MODULE_DISABLED); `overview` feeds the module home; `settings` holds the number patterns
 * and the certificate signatory; `people` is the person search used by the record form.
 */
const recordsHomeRouter = (deps: Deps) => {
  const { db } = deps;
  return new Elysia({ prefix: '/churches/:churchId/records' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'records'), {
      church: 'records',
      params: churchParamsSchema,
    })
    .get(
      '/overview',
      ({ church }) => {
        const year = currentYearIn(church.timezone);
        const counts = db
          .select({
            type: registryRecords.type,
            total: count(),
            thisYear: sql<number>`sum(case when ${registryRecords.year} = ${year} then 1 else 0 end)`,
          })
          .from(registryRecords)
          .where(and(eq(registryRecords.churchId, church.id), eq(registryRecords.status, 'active')))
          .groupBy(registryRecords.type)
          .all();
        // The last number handed out this year per type, voided ones included.
        const lastNumbers = new Map(
          db
            .select({ type: registryRecords.type, number: registryRecords.number })
            .from(registryRecords)
            .where(
              and(
                eq(registryRecords.churchId, church.id),
                eq(registryRecords.year, year),
                sql`${registryRecords.sequence} = (select max(r2.sequence) from registry_records r2 where r2.church_id = ${church.id} and r2.type = ${registryRecords.type} and r2.year = ${year})`,
              ),
            )
            .all()
            .map((row) => [row.type, row.number]),
        );
        const years = db
          .selectDistinct({ year: registryRecords.year })
          .from(registryRecords)
          .where(eq(registryRecords.churchId, church.id))
          .all()
          .map((row) => row.year);
        const voided =
          db
            .select({ value: count() })
            .from(registryRecords)
            .where(
              and(eq(registryRecords.churchId, church.id), eq(registryRecords.status, 'voided')),
            )
            .get()?.value ?? 0;
        const recent = db
          .select()
          .from(registryRecords)
          .where(eq(registryRecords.churchId, church.id))
          .orderBy(desc(registryRecords.createdAt))
          .limit(RECORDS_LIMITS.recentMax)
          .all();
        return {
          year,
          years: [...new Set([year, ...years])].sort((a, b) => b - a),
          types: REGISTRY_RECORD_TYPES.map((type) => {
            const row = counts.find((item) => item.type === type);
            return {
              type,
              total: row?.total ?? 0,
              thisYear: Number(row?.thisYear ?? 0),
              lastNumber: lastNumbers.get(type) ?? null,
            };
          }),
          voided,
          recent: hydrateRecords(db, recent),
        };
      },
      { church: view, params: churchParamsSchema },
    )
    .get(
      '/settings',
      ({ church }) => ({
        settings: recordsSettingsOf(church),
        nextNumbers: nextNumbersOf(db, church),
      }),
      {
        church: { ...view, permission: [...view.permission, ...settingsManagers] },
        params: churchParamsSchema,
      },
    )
    .put(
      '/settings',
      ({ church, audit, body }) => {
        assertDistinctPatterns(body);
        const before = recordsSettingsOf(church);
        db.transaction((tx) => {
          saveModuleSettings(tx, church.id, 'records', body);
          recordAudit(tx, audit, {
            module: 'records',
            action: 'records_settings.update',
            entityType: 'church',
            entityId: church.id,
            summary: 'Updated the church registry settings',
            ...changes(before, body),
          });
        });
        const updated: ChurchRow = { ...church, settings: { ...church.settings, records: body } };
        return { settings: body, nextNumbers: nextNumbersOf(db, updated) };
      },
      {
        church: { module: 'records', permission: settingsManagers },
        params: churchParamsSchema,
        body: recordsSettingsSchema,
      },
    )
    .get(
      '/people',
      ({ church, query }) => {
        const conditions: SQL[] = [eq(people.churchId, church.id)];
        if (query.q) {
          const pattern = likePattern(query.q);
          const text = or(
            like(people.firstName, pattern),
            like(people.lastName, pattern),
            like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
          );
          if (text) conditions.push(text);
        }
        return {
          items: db
            .select({
              id: people.id,
              firstName: people.firstName,
              lastName: people.lastName,
              photoUrl: people.photoUrl,
              membershipStatus: people.membershipStatus,
              birthDate: people.birthDate,
            })
            .from(people)
            .where(and(...conditions))
            .orderBy(asc(people.firstName), asc(people.lastName))
            .limit(query.limit)
            .all(),
        };
      },
      {
        church: { module: 'records', permission: 'records.manage' },
        params: churchParamsSchema,
        query: recordsPeopleQuerySchema,
      },
    );
};

/**
 * The records naming one person, for the person page and timeline. Register viewers see every
 * record the person appears on; the person sees their own (`OWN_RECORD_ROLES`, valid ones only).
 */
const personRecordsRouter = (deps: Deps) => {
  const { db } = deps;
  return new Elysia({ prefix: '/churches/:churchId/people/:id/records' }).use(authPlugin(deps)).get(
    '/',
    ({ church, access, params }) => {
      const person = db
        .select({ id: people.id, userId: people.userId })
        .from(people)
        .where(and(eq(people.id, params.id), eq(people.churchId, church.id)))
        .get();
      if (!person) throw notFound('Person');
      const viewer = canViewRegistry(access);
      const self =
        person.id === access.personId || (!!person.userId && person.userId === access.userId);
      if (!viewer && !self) throw notFound('Person');
      const conditions: SQL[] = [
        eq(registryRecords.churchId, church.id),
        eq(registryRecordPeople.personId, person.id),
      ];
      if (!viewer) {
        conditions.push(
          eq(registryRecords.status, 'active'),
          inArray(registryRecordPeople.role, [...OWN_RECORD_ROLES]),
        );
      }
      const links = db
        .select({ record: registryRecords, role: registryRecordPeople.role })
        .from(registryRecordPeople)
        .innerJoin(registryRecords, eq(registryRecords.id, registryRecordPeople.recordId))
        .where(and(...conditions))
        .orderBy(desc(registryRecords.date), desc(registryRecords.sequence))
        .all();
      const records = hydrateRecords(
        db,
        links.map((link) => link.record),
      );
      const items: PersonRecordItem[] = records.map((record, index) => ({
        id: record.id,
        type: record.type,
        subtype: record.subtype,
        number: record.number,
        date: record.date,
        place: record.place,
        status: record.status,
        people: record.people,
        role: links[index]!.role,
      }));
      return { items };
    },
    // `:id` matches the people router's parameter name for the same path segment.
    { church: 'records', params: churchIdParamsSchema },
  );
};

/**
 * Church registry (catatan gerejawi): baptis, sidi, pemberkatan nikah, penyerahan anak, atestasi,
 * kedukaan.
 *
 * Owned by the records module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'records'` (or
 * `church: { module: 'records', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const recordsModule = (deps: Deps) =>
  new Elysia()
    .use(recordsHomeRouter(deps))
    .use(recordEntriesRouter(deps))
    .use(personRecordsRouter(deps));
