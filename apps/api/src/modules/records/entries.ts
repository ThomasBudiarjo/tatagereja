import {
  OWN_RECORD_ROLES,
  REGISTRY_RECORD_TYPE_LABELS,
  canManageRecords,
  canViewRegistry,
  canViewRegistryRecord,
  churchIdParamsSchema,
  churchParamsSchema,
  recordPreviewBodySchema,
  recordSideEffectSchema,
  recordYearOf,
  registryRecordCorrectionSchema,
  registryRecordInputSchema,
  registryRecordListQuerySchema,
  voidRegistryRecordBodySchema,
  type RecordHistoryEntry,
  type RegistryRecord,
  type RegistryRecordInput,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, exists, inArray, like, or, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';
import type { ChurchRow } from '../../db/schema';
import { auditLogs, people, registryRecordPeople, registryRecords, users } from '../../db/schema';
import type { Deps } from '../../deps';
import type { Queryable } from '../../db/client';
import { conflict, notFound, validationError } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { notify } from '../../services/notifications';
import {
  applySideEffects,
  assertNoDuplicate,
  auditSnapshot,
  changedFields,
  findDuplicate,
  hydrateRecord,
  hydrateRecords,
  insertRecordPeople,
  loadRecordRow,
  nextNumber,
  normalizeSubtype,
  previewSideEffects,
  recordsSettingsOf,
  redactRecordSnapshot,
  resolveRecordPeople,
} from '../../services/records';

const view = { module: 'records', permission: ['records.view', 'records.manage'] } as const;
const manage = { module: 'records', permission: 'records.manage' } as const;

const HISTORY_ACTIONS = {
  'registry_record.create': 'create',
  'registry_record.correct': 'correct',
  'registry_record.void': 'void',
} as const;

const storedHistorySchema = z
  .object({
    correctionNote: z.string().nullish(),
    voidReason: z.string().nullish(),
    fields: z.array(z.string()).nullish(),
    effects: z.array(recordSideEffectSchema).nullish(),
  })
  .catch({});

/** Linked accounts of the people a record is about (not the deceased), for notifications. */
const recipientsOf = (db: Queryable, record: RegistryRecord): string[] => {
  const personIds = record.people
    .filter(
      (person) =>
        person.personId &&
        OWN_RECORD_ROLES.includes(person.role) &&
        !(record.type === 'death' && person.role === 'subject'),
    )
    .map((person) => person.personId!);
  if (personIds.length === 0) return [];
  return db
    .select({ userId: people.userId })
    .from(people)
    .where(and(eq(people.churchId, record.churchId), inArray(people.id, personIds)))
    .all()
    .flatMap((row) => (row.userId ? [row.userId] : []));
};

const notifyPeople = (
  db: Queryable,
  church: ChurchRow,
  record: RegistryRecord,
  actorUserId: string,
  corrected: boolean,
) => {
  const userIds = recipientsOf(db, record);
  if (userIds.length === 0) return;
  const label = REGISTRY_RECORD_TYPE_LABELS[record.type].en;
  notify(db, {
    churchId: church.id,
    userIds,
    excludeUserIds: [actorUserId],
    type: 'record.added',
    title: corrected
      ? `Your ${label.toLowerCase()} record was corrected`
      : `Your ${label.toLowerCase()} record was entered`,
    body: `${record.number} · ${record.date}`,
    link: `/c/${church.id}/records/${record.id}`,
    entityType: 'registry_record',
    entityId: record.id,
  });
};

/** The register: list, enter, correct and void registry records. */
export const recordEntriesRouter = (deps: Deps) => {
  const { db } = deps;

  const history = (churchId: string, recordId: string): RecordHistoryEntry[] =>
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        after: auditLogs.after,
        createdAt: auditLogs.createdAt,
        actorName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(
        and(
          eq(auditLogs.churchId, churchId),
          eq(auditLogs.module, 'records'),
          eq(auditLogs.entityType, 'registry_record'),
          eq(auditLogs.entityId, recordId),
        ),
      )
      .orderBy(asc(auditLogs.createdAt))
      .limit(100)
      .all()
      .flatMap((row) => {
        const action = HISTORY_ACTIONS[row.action as keyof typeof HISTORY_ACTIONS];
        if (!action) return [];
        const stored = storedHistorySchema.parse(row.after ?? {});
        return [
          {
            id: row.id,
            action,
            actorName: row.actorName ?? null,
            createdAt: row.createdAt,
            note: stored.correctionNote ?? stored.voidReason ?? null,
            fields: stored.fields ?? [],
            effects: stored.effects ?? [],
          },
        ];
      });

  /** Shared by create and correct: people resolved inside the church, the normalized row. */
  const prepare = (church: ChurchRow, input: RegistryRecordInput) => {
    const resolved = resolveRecordPeople(db, church.id, input);
    return {
      resolved,
      values: {
        type: input.type,
        subtype: normalizeSubtype(input),
        date: input.date,
        place: input.place,
        officiantPersonId: input.officiantPersonId,
        officiantName: resolved.officiantName,
        details: input.details,
        documentUrl: input.documentUrl,
        notes: input.notes,
      },
    };
  };

  return new Elysia({ prefix: '/churches/:churchId/records/entries' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, query }) => {
        const conditions: SQL[] = [eq(registryRecords.churchId, church.id)];
        if (query.type) conditions.push(eq(registryRecords.type, query.type));
        if (query.year) conditions.push(eq(registryRecords.year, query.year));
        if (query.status) conditions.push(eq(registryRecords.status, query.status));
        if (query.personId) {
          conditions.push(
            exists(
              db
                .select({ id: registryRecordPeople.id })
                .from(registryRecordPeople)
                .where(
                  and(
                    eq(registryRecordPeople.recordId, registryRecords.id),
                    eq(registryRecordPeople.personId, query.personId),
                  ),
                ),
            ),
          );
        }
        if (query.q) {
          const pattern = likePattern(query.q);
          const text = or(
            like(registryRecords.number, pattern),
            like(registryRecords.place, pattern),
            like(registryRecords.officiantName, pattern),
            exists(
              db
                .select({ id: registryRecordPeople.id })
                .from(registryRecordPeople)
                .where(
                  and(
                    eq(registryRecordPeople.recordId, registryRecords.id),
                    like(registryRecordPeople.name, pattern),
                  ),
                ),
            ),
          );
          if (text) conditions.push(text);
        }
        const where = and(...conditions);
        const total =
          db.select({ value: count() }).from(registryRecords).where(where).get()?.value ?? 0;
        const order =
          query.sort === 'number'
            ? [
                asc(registryRecords.type),
                desc(registryRecords.year),
                desc(registryRecords.sequence),
              ]
            : query.sort === 'date_asc'
              ? [asc(registryRecords.date), asc(registryRecords.sequence)]
              : [desc(registryRecords.date), desc(registryRecords.sequence)];
        const rows = db
          .select()
          .from(registryRecords)
          .where(where)
          .orderBy(...order)
          .limit(query.limit)
          .offset(offsetOf(query))
          .all();
        return { items: hydrateRecords(db, rows), total, page: query.page, limit: query.limit };
      },
      { church: view, params: churchParamsSchema, query: registryRecordListQuerySchema },
    )
    .post(
      '/preview',
      ({ church, body }) => {
        const input = body.record;
        const existing = body.recordId ? loadRecordRow(db, church.id, body.recordId) : null;
        if (existing && existing.type !== input.type) {
          throw validationError('The type of a record cannot be changed', [
            { path: 'type', message: 'Void this record and enter a new one instead' },
          ]);
        }
        resolveRecordPeople(db, church.id, input);
        return {
          number:
            existing?.number ?? nextNumber(db, church, input.type, recordYearOf(input.date)).number,
          effects: previewSideEffects(db, church.id, input),
          duplicate: findDuplicate(db, church.id, input, existing?.id),
        };
      },
      { church: manage, params: churchParamsSchema, body: recordPreviewBodySchema },
    )
    .post(
      '/',
      ({ church, auth, audit, body, set }) => {
        const { resolved, values } = prepare(church, body);
        const year = recordYearOf(body.date);
        const result = db.transaction((tx) => {
          assertNoDuplicate(tx, church.id, body);
          const { sequence, number } = nextNumber(tx, church, body.type, year);
          const taken = tx
            .select({ id: registryRecords.id })
            .from(registryRecords)
            .where(and(eq(registryRecords.churchId, church.id), eq(registryRecords.number, number)))
            .get();
          if (taken) {
            throw conflict(
              `The number ${number} is already used. Give each kind of record its own number pattern.`,
            );
          }
          const now = nowIso();
          const row = tx
            .insert(registryRecords)
            .values({
              id: newId(),
              churchId: church.id,
              ...values,
              year,
              sequence,
              number,
              createdBy: auth.user.id,
              updatedBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          insertRecordPeople(tx, church.id, row.id, resolved.people);
          const effects = body.applyStatusEffect ? previewSideEffects(tx, church.id, body) : [];
          applySideEffects(tx, church.id, effects);
          const record = hydrateRecord(tx, row);
          recordAudit(tx, audit, {
            module: 'records',
            action: 'registry_record.create',
            entityType: 'registry_record',
            entityId: row.id,
            summary: `Entered ${REGISTRY_RECORD_TYPE_LABELS[row.type].en.toLowerCase()} record ${row.number}`,
            after: { ...redactRecordSnapshot(auditSnapshot(record)), effects },
          });
          notifyPeople(tx, church, record, auth.user.id, false);
          return { record, effects };
        });
        set.status = 201;
        return result;
      },
      { church: manage, params: churchParamsSchema, body: registryRecordInputSchema },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const record = hydrateRecord(db, loadRecordRow(db, church.id, params.id));
        // Someone who may not see the register learns nothing about other people's records.
        if (!canViewRegistryRecord(access, record)) throw notFound('Record');
        const settings = recordsSettingsOf(church);
        return {
          record,
          canManage: canManageRecords(access),
          certificate: {
            signatoryName: settings.signatoryName,
            signatoryTitle: settings.signatoryTitle,
            footer: settings.certificateFooter,
          },
          history: canViewRegistry(access) ? history(church.id, record.id) : [],
        };
      },
      { church: 'records', params: churchIdParamsSchema },
    )
    .put(
      '/:id',
      ({ church, auth, audit, params, body }) => {
        const row = loadRecordRow(db, church.id, params.id);
        if (row.status === 'voided') throw conflict('A voided record cannot be corrected');
        const input = body.record;
        if (input.type !== row.type) {
          throw validationError('The type of a record cannot be changed', [
            { path: 'record.type', message: 'Void this record and enter a new one instead' },
          ]);
        }
        const before = hydrateRecord(db, row);
        const { resolved, values } = prepare(church, input);
        const result = db.transaction((tx) => {
          assertNoDuplicate(tx, church.id, input, row.id);
          // The number, year and sequence stay: a correction never renumbers the register.
          const updated = tx
            .update(registryRecords)
            .set({ ...values, updatedBy: auth.user.id, updatedAt: nowIso() })
            .where(eq(registryRecords.id, row.id))
            .returning()
            .get();
          if (!updated) throw notFound('Record');
          insertRecordPeople(tx, church.id, row.id, resolved.people);
          const effects = input.applyStatusEffect ? previewSideEffects(tx, church.id, input) : [];
          applySideEffects(tx, church.id, effects);
          const record = hydrateRecord(tx, updated);
          const beforeSnapshot = auditSnapshot(before);
          const afterSnapshot = auditSnapshot(record);
          const diff = changes(beforeSnapshot, afterSnapshot);
          recordAudit(tx, audit, {
            module: 'records',
            action: 'registry_record.correct',
            entityType: 'registry_record',
            entityId: row.id,
            summary: `Corrected record ${row.number}`,
            before: redactRecordSnapshot(diff.before),
            after: {
              ...redactRecordSnapshot(diff.after ?? {}),
              correctionNote: body.correctionNote,
              fields: changedFields(beforeSnapshot, afterSnapshot),
              effects,
            },
          });
          notifyPeople(tx, church, record, auth.user.id, true);
          return { record, effects };
        });
        return result;
      },
      { church: manage, params: churchIdParamsSchema, body: registryRecordCorrectionSchema },
    )
    .post(
      '/:id/void',
      ({ church, auth, audit, params, body }) => {
        const row = loadRecordRow(db, church.id, params.id);
        if (row.status === 'voided') throw conflict('This record is already voided');
        const record = db.transaction((tx) => {
          const now = nowIso();
          const updated = tx
            .update(registryRecords)
            .set({
              status: 'voided',
              voidedAt: now,
              voidedBy: auth.user.id,
              voidReason: body.reason,
              updatedBy: auth.user.id,
              updatedAt: now,
            })
            .where(eq(registryRecords.id, row.id))
            .returning()
            .get();
          if (!updated) throw notFound('Record');
          recordAudit(tx, audit, {
            module: 'records',
            action: 'registry_record.void',
            entityType: 'registry_record',
            entityId: row.id,
            summary: `Voided record ${row.number}`,
            before: { status: row.status },
            after: { status: 'voided', voidReason: body.reason },
          });
          return hydrateRecord(tx, updated);
        });
        return { record, effects: [] };
      },
      { church: manage, params: churchIdParamsSchema, body: voidRegistryRecordBodySchema },
    );
};
