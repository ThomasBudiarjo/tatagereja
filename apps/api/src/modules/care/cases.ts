import {
  canAdministerCareCase,
  canChangeCareConfidentiality,
  canManageCareCase,
  canReadCareCase,
  careCaseInputSchema,
  careCaseListQuerySchema,
  careCaseUpdateSchema,
  careNoteInputSchema,
  careNoteParamsSchema,
  careNoteUpdateSchema,
  churchIdParamsSchema,
  churchParamsSchema,
  fullName,
  has,
  setCaregiversBodySchema,
  type AccessLike,
  type CareCaseInput,
  type CareConfidentiality,
  type CareCaseUpdate,
} from '@tatagereja/shared';
import { and, asc, count, desc, eq, inArray, like, ne, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { CareCaseRow, ChurchRow } from '../../db/schema';
import { careCaseCaregivers, careCases, careNotes, careVisits, people } from '../../db/schema';
import type { Deps } from '../../deps';
import { forbidden, notFound } from '../../lib/errors';
import { likePattern, offsetOf } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit, redact } from '../../services/audit';
import type { AuditContext } from '../../services/audit';
import {
  assertActiveMembers,
  caregiverIdsOf,
  caseLabel,
  loadHouseholdInChurch,
  loadPersonInChurch,
  readableCaseCondition,
  sendDueCareReminders,
  redactedChanges,
} from '../../services/care';
import { notify } from '../../services/notifications';
import { hydrateCases, hydrateNotes, toCareCaseDetail } from './serializers';

/** Free-text fields never reach the audit log; titles of confidential cases neither. */
const TEXT_FIELDS = ['description', 'nextActionNote', 'closedReason'];

const auditable = (row: CareCaseRow) => ({
  personId: row.personId,
  householdId: row.householdId,
  category: row.category,
  priority: row.priority,
  status: row.status,
  confidentiality: row.confidentiality,
  title: row.title,
  description: row.description,
  nextActionDate: row.nextActionDate,
  nextActionNote: row.nextActionNote,
  closedReason: row.closedReason,
});

const secretFields = (confidentiality: CareConfidentiality) =>
  confidentiality === 'confidential' ? [...TEXT_FIELDS, 'title'] : TEXT_FIELDS;

const PRIORITY_ORDER = sql`case ${careCases.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`;

export const careCasesRouter = (deps: Deps) => {
  const { db } = deps;

  /** Loads a case the caller may read; anything else is 404, so existence does not leak. */
  const loadReadable = (churchId: string, access: AccessLike, id: string) => {
    const row = db
      .select()
      .from(careCases)
      .where(and(eq(careCases.id, id), eq(careCases.churchId, churchId)))
      .get();
    if (!row) throw notFound('Care case');
    const caregiverIds = caregiverIdsOf(db, row.id);
    if (!canReadCareCase(access, row, caregiverIds)) throw notFound('Care case');
    return { row, caregiverIds };
  };

  const loadManageable = (churchId: string, access: AccessLike, id: string) => {
    const loaded = loadReadable(churchId, access, id);
    if (!canManageCareCase(access, loaded.row, loaded.caregiverIds)) {
      throw forbidden('You cannot change this care case');
    }
    return loaded;
  };

  const resolveSubject = (churchId: string, body: CareCaseInput | CareCaseUpdate) => {
    const person = body.personId ? loadPersonInChurch(db, churchId, body.personId) : null;
    const household = body.householdId
      ? loadHouseholdInChurch(db, churchId, body.householdId)
      : null;
    return { person, household };
  };

  const subjectName = (row: CareCaseRow) => {
    if (row.confidentiality === 'confidential') return 'a confidential case';
    const person = row.personId
      ? db
          .select({ firstName: people.firstName, lastName: people.lastName })
          .from(people)
          .where(eq(people.id, row.personId))
          .get()
      : null;
    return person ? fullName(person) : row.title;
  };

  const notifyAssigned = (
    tx: Queryable,
    church: ChurchRow,
    row: CareCaseRow,
    userIds: readonly string[],
    actorId: string,
  ) =>
    notify(tx, {
      churchId: church.id,
      userIds,
      excludeUserIds: [actorId],
      type: 'care.case_assigned',
      title: 'Anda ditugaskan mendampingi',
      body: caseLabel(row),
      link: `/c/${church.id}/care/cases/${row.id}`,
      entityType: 'care_case',
      entityId: row.id,
    });

  const addStatusNote = (tx: Queryable, row: CareCaseRow, userId: string, now: string) =>
    tx
      .insert(careNotes)
      .values({
        id: newId(),
        churchId: row.churchId,
        caseId: row.id,
        kind: 'status_change',
        body: row.status,
        authorUserId: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

  const touch = (tx: Queryable, caseId: string, now: string) =>
    tx.update(careCases).set({ updatedAt: now }).where(eq(careCases.id, caseId)).run();

  const auditNote = (
    tx: Queryable,
    audit: AuditContext,
    row: CareCaseRow,
    action: string,
    noteId: string,
    verb: string,
  ) =>
    recordAudit(tx, audit, {
      module: 'care',
      action,
      entityType: 'care_note',
      entityId: noteId,
      summary: `${verb} a note on ${subjectName(row)}`,
      after: { caseId: row.id },
    });

  return new Elysia({ prefix: '/churches/:churchId/care/cases' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        sendDueCareReminders(db, church);
        const conditions: SQL[] = [eq(careCases.churchId, church.id)];
        const readable = readableCaseCondition(db, access);
        if (readable) conditions.push(readable);
        if (query.status === 'active') conditions.push(ne(careCases.status, 'closed'));
        else if (query.status) conditions.push(eq(careCases.status, query.status));
        if (query.category) conditions.push(eq(careCases.category, query.category));
        if (query.priority) conditions.push(eq(careCases.priority, query.priority));
        if (query.confidentiality) {
          conditions.push(eq(careCases.confidentiality, query.confidentiality));
        }
        if (query.personId) conditions.push(eq(careCases.personId, query.personId));
        if (query.mine) {
          conditions.push(
            inArray(
              careCases.id,
              db
                .select({ id: careCaseCaregivers.caseId })
                .from(careCaseCaregivers)
                .where(eq(careCaseCaregivers.userId, access.userId)),
            ),
          );
        }
        if (query.q) {
          // Titles and names only: descriptions and notes are never searched.
          const pattern = likePattern(query.q);
          const match = or(
            like(careCases.title, pattern),
            like(sql`${people.firstName} || ' ' || coalesce(${people.lastName}, '')`, pattern),
          );
          if (match) conditions.push(match);
        }
        const where = and(...conditions);
        const total =
          db
            .select({ value: count() })
            .from(careCases)
            .leftJoin(people, eq(people.id, careCases.personId))
            .where(where)
            .get()?.value ?? 0;
        const order =
          query.sort === 'next_action'
            ? [sql`${careCases.nextActionDate} is null`, asc(careCases.nextActionDate)]
            : query.sort === 'priority'
              ? [PRIORITY_ORDER, desc(careCases.updatedAt)]
              : [desc(careCases.updatedAt)];
        const rows = db
          .select({ row: careCases })
          .from(careCases)
          .leftJoin(people, eq(people.id, careCases.personId))
          .where(where)
          .orderBy(...order, desc(careCases.createdAt))
          .limit(query.limit)
          .offset(offsetOf(query))
          .all()
          .map((entry) => entry.row);
        return {
          items: hydrateCases(db, church.id, rows),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      { church: 'care', params: churchParamsSchema, query: careCaseListQuerySchema },
    )
    .post(
      '/',
      ({ church, access, auth, audit, body, set }) => {
        const { person, household } = resolveSubject(church.id, body);
        const caregiverIds = [...new Set(body.caregiverUserIds)];
        // Without care.confidential the author keeps access by caring for the case themselves.
        if (
          body.confidentiality === 'confidential' &&
          !has(access, 'care.confidential') &&
          !caregiverIds.includes(auth.user.id)
        ) {
          caregiverIds.push(auth.user.id);
        }
        assertActiveMembers(db, church.id, caregiverIds);
        const now = nowIso();
        const created = db.transaction((tx) => {
          const row = tx
            .insert(careCases)
            .values({
              id: newId(),
              churchId: church.id,
              personId: person?.id ?? null,
              householdId: household?.id ?? null,
              category: body.category,
              priority: body.priority,
              status: body.status,
              confidentiality: body.confidentiality,
              title: body.title,
              description: body.description,
              nextActionDate: body.nextActionDate,
              nextActionNote: body.nextActionNote,
              closedAt: body.status === 'closed' ? now : null,
              openedBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          if (caregiverIds.length > 0) {
            tx.insert(careCaseCaregivers)
              .values(
                caregiverIds.map((userId) => ({
                  caseId: row.id,
                  userId,
                  churchId: church.id,
                  assignedBy: auth.user.id,
                  assignedAt: now,
                })),
              )
              .run();
          }
          recordAudit(tx, audit, {
            module: 'care',
            action: 'care_case.create',
            entityType: 'care_case',
            entityId: row.id,
            summary: `Opened a care case for ${subjectName(row)}`,
            after: {
              ...redact(auditable(row), secretFields(row.confidentiality)),
              caregiverUserIds: caregiverIds,
            },
          });
          notifyAssigned(tx, church, row, caregiverIds, auth.user.id);
          return row;
        });
        set.status = 201;
        return { case: toCareCaseDetail(db, church.id, access, created) };
      },
      {
        church: { module: 'care', permission: 'care.manage' },
        params: churchParamsSchema,
        body: careCaseInputSchema,
      },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const { row } = loadReadable(church.id, access, params.id);
        return { case: toCareCaseDetail(db, church.id, access, row) };
      },
      { church: 'care', params: churchIdParamsSchema },
    )
    .patch(
      '/:id',
      ({ church, access, auth, audit, params, body }) => {
        const { row } = loadManageable(church.id, access, params.id);
        if (!canChangeCareConfidentiality(access, row.confidentiality, body.confidentiality)) {
          throw forbidden('Only holders of confidential care access can lower confidentiality');
        }
        const { person, household } = resolveSubject(church.id, body);
        const now = nowIso();
        const statusChanged = body.status !== row.status;
        const updated = db.transaction((tx) => {
          const next = tx
            .update(careCases)
            .set({
              personId: person?.id ?? null,
              householdId: household?.id ?? null,
              category: body.category,
              priority: body.priority,
              status: body.status,
              confidentiality: body.confidentiality,
              title: body.title,
              description: body.description,
              nextActionDate: body.nextActionDate,
              nextActionNote: body.nextActionNote,
              reminderSentAt:
                body.nextActionDate === row.nextActionDate ? row.reminderSentAt : null,
              closedAt: body.status === 'closed' ? (row.closedAt ?? now) : null,
              closedReason: body.status === 'closed' ? body.closedReason : null,
              updatedAt: now,
            })
            .where(eq(careCases.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Care case');
          if (statusChanged) addStatusNote(tx, next, auth.user.id, now);
          // Visits of a case that became confidential become confidential with it.
          if (next.confidentiality === 'confidential' && row.confidentiality !== 'confidential') {
            tx.update(careVisits)
              .set({ confidentiality: 'confidential', updatedAt: now })
              .where(and(eq(careVisits.caseId, row.id), eq(careVisits.churchId, church.id)))
              .run();
          }
          // Redact by the stricter of both levels so a lowered case never exposes its old title.
          const level = next.confidentiality === 'confidential' ? next : row;
          recordAudit(tx, audit, {
            module: 'care',
            action: 'care_case.update',
            entityType: 'care_case',
            entityId: row.id,
            summary: `Updated the care case for ${subjectName(level)}`,
            ...redactedChanges(
              auditable(row),
              auditable(next),
              secretFields(level.confidentiality),
            ),
          });
          return next;
        });
        return { case: toCareCaseDetail(db, church.id, access, updated) };
      },
      { church: 'care', params: churchIdParamsSchema, body: careCaseUpdateSchema },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        const { row, caregiverIds } = loadReadable(church.id, access, params.id);
        if (!canAdministerCareCase(access, row, caregiverIds)) {
          throw forbidden('You cannot delete this care case');
        }
        db.transaction((tx) => {
          tx.delete(careCases).where(eq(careCases.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'care',
            action: 'care_case.delete',
            entityType: 'care_case',
            entityId: row.id,
            summary: `Deleted the care case for ${subjectName(row)}`,
            before: redact(auditable(row), secretFields(row.confidentiality)),
          });
        });
        return { ok: true as const };
      },
      { church: 'care', params: churchIdParamsSchema },
    )
    .put(
      '/:id/caregivers',
      ({ church, access, auth, audit, params, body }) => {
        const { row, caregiverIds } = loadReadable(church.id, access, params.id);
        if (!canAdministerCareCase(access, row, caregiverIds)) {
          throw forbidden('You cannot assign caregivers to this care case');
        }
        const next = [...new Set(body.userIds)];
        assertActiveMembers(db, church.id, next);
        const added = next.filter((userId) => !caregiverIds.includes(userId));
        const removed = caregiverIds.filter((userId) => !next.includes(userId));
        const now = nowIso();
        db.transaction((tx) => {
          if (removed.length > 0) {
            tx.delete(careCaseCaregivers)
              .where(
                and(
                  eq(careCaseCaregivers.caseId, row.id),
                  inArray(careCaseCaregivers.userId, removed),
                ),
              )
              .run();
          }
          if (added.length > 0) {
            tx.insert(careCaseCaregivers)
              .values(
                added.map((userId) => ({
                  caseId: row.id,
                  userId,
                  churchId: church.id,
                  assignedBy: auth.user.id,
                  assignedAt: now,
                })),
              )
              .run();
          }
          if (added.length > 0 || removed.length > 0) {
            touch(tx, row.id, now);
            recordAudit(tx, audit, {
              module: 'care',
              action: 'care_case.assign',
              entityType: 'care_case',
              entityId: row.id,
              summary: `Changed the caregivers of ${subjectName(row)}`,
              before: { caregiverUserIds: caregiverIds },
              after: { caregiverUserIds: next },
            });
            notifyAssigned(tx, church, row, added, auth.user.id);
          }
        });
        const fresh = loadReadable(church.id, access, row.id).row;
        return { case: toCareCaseDetail(db, church.id, access, fresh) };
      },
      { church: 'care', params: churchIdParamsSchema, body: setCaregiversBodySchema },
    )
    .get(
      '/:id/notes',
      ({ church, access, params }) => {
        const { row, caregiverIds } = loadReadable(church.id, access, params.id);
        const rows = db
          .select()
          .from(careNotes)
          .where(and(eq(careNotes.caseId, row.id), eq(careNotes.churchId, church.id)))
          .orderBy(desc(careNotes.createdAt))
          .limit(500)
          .all();
        return {
          items: hydrateNotes(db, access, canManageCareCase(access, row, caregiverIds), rows),
        };
      },
      { church: 'care', params: churchIdParamsSchema },
    )
    .post(
      '/:id/notes',
      ({ church, access, auth, audit, params, body, set }) => {
        const { row } = loadManageable(church.id, access, params.id);
        const now = nowIso();
        const note = db.transaction((tx) => {
          const created = tx
            .insert(careNotes)
            .values({
              id: newId(),
              churchId: church.id,
              caseId: row.id,
              kind: body.kind,
              body: body.body,
              authorUserId: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          touch(tx, row.id, now);
          auditNote(tx, audit, row, 'care_note.create', created.id, 'Added');
          return created;
        });
        set.status = 201;
        const [hydrated] = hydrateNotes(db, access, true, [note]);
        return { note: hydrated };
      },
      { church: 'care', params: churchIdParamsSchema, body: careNoteInputSchema },
    )
    .patch(
      '/:id/notes/:noteId',
      ({ church, access, auth, audit, params, body }) => {
        const { row } = loadManageable(church.id, access, params.id);
        const note = db
          .select()
          .from(careNotes)
          .where(and(eq(careNotes.id, params.noteId), eq(careNotes.caseId, row.id)))
          .get();
        if (!note) throw notFound('Note');
        if (note.authorUserId !== auth.user.id || note.kind === 'status_change') {
          throw forbidden('Only the author can edit a note');
        }
        const now = nowIso();
        const updated = db.transaction((tx) => {
          const next = tx
            .update(careNotes)
            .set({ body: body.body, updatedAt: now })
            .where(eq(careNotes.id, note.id))
            .returning()
            .get();
          if (!next) throw notFound('Note');
          auditNote(tx, audit, row, 'care_note.update', note.id, 'Edited');
          return next;
        });
        const [hydrated] = hydrateNotes(db, access, true, [updated]);
        return { note: hydrated };
      },
      { church: 'care', params: careNoteParamsSchema, body: careNoteUpdateSchema },
    )
    .delete(
      '/:id/notes/:noteId',
      ({ church, access, auth, audit, params }) => {
        const { row, caregiverIds } = loadManageable(church.id, access, params.id);
        const note = db
          .select()
          .from(careNotes)
          .where(and(eq(careNotes.id, params.noteId), eq(careNotes.caseId, row.id)))
          .get();
        if (!note) throw notFound('Note');
        const own = note.authorUserId === auth.user.id && note.kind !== 'status_change';
        if (!own && !canAdministerCareCase(access, row, caregiverIds)) {
          throw forbidden('You cannot delete this note');
        }
        db.transaction((tx) => {
          tx.delete(careNotes).where(eq(careNotes.id, note.id)).run();
          auditNote(tx, audit, row, 'care_note.delete', note.id, 'Deleted');
        });
        return { ok: true as const };
      },
      { church: 'care', params: careNoteParamsSchema },
    );
};
