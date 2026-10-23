import {
  CARE_TASK_LIST_MAX,
  canCompleteCareTask,
  canEditCareTask,
  canManageCareCase,
  canManageFollowUp,
  canReadCareCase,
  careTaskInputSchema,
  careTaskListQuerySchema,
  careTaskUpdateSchema,
  churchIdParamsSchema,
  churchParamsSchema,
  has,
  isCareTeam,
  updateCareTaskStatusBodySchema,
  type AccessLike,
} from '@tatagereja/shared';
import { and, asc, desc, eq, isNull, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { CareTaskRow, ChurchRow } from '../../db/schema';
import { careCases, careTasks, visitorFollowUps } from '../../db/schema';
import type { Deps } from '../../deps';
import { forbidden, notFound } from '../../lib/errors';
import { likePattern } from '../../lib/query';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { recordAudit, redact } from '../../services/audit';
import {
  CONFIDENTIAL_LABEL,
  assertActiveMembers,
  caregiverIdsOf,
  loadPersonInChurch,
  readableCaseCondition,
  sendDueCareReminders,
  todayIn,
  redactedChanges,
} from '../../services/care';
import { notify } from '../../services/notifications';
import { hydrateTasks } from './serializers';

/** Titles and subjects of tasks on confidential cases are as private as the case. */
const secretFields = (confidential: boolean) =>
  confidential ? ['description', 'title', 'personId'] : ['description'];

const auditable = (row: CareTaskRow) => ({
  title: row.title,
  description: row.description,
  dueDate: row.dueDate,
  status: row.status,
  assignedUserId: row.assignedUserId,
  followUpId: row.followUpId,
  caseId: row.caseId,
  personId: row.personId,
});

export const careTasksRouter = (deps: Deps) => {
  const { db } = deps;

  const loadCase = (churchId: string, id: string) => {
    const row = db
      .select()
      .from(careCases)
      .where(and(eq(careCases.id, id), eq(careCases.churchId, churchId)))
      .get();
    if (!row) throw notFound('Care case');
    return { row, caregiverIds: caregiverIdsOf(db, row.id) };
  };

  const loadFollowUp = (churchId: string, access: AccessLike, id: string) => {
    const row = db
      .select()
      .from(visitorFollowUps)
      .where(and(eq(visitorFollowUps.id, id), eq(visitorFollowUps.churchId, churchId)))
      .get();
    if (!row || (!isCareTeam(access) && row.assignedUserId !== access.userId)) {
      throw notFound('Follow-up');
    }
    return row;
  };

  /** Whether the linked case (if any) is confidential and closed to the caller. */
  const caseHidden = (churchId: string, access: AccessLike, caseId: string | null) => {
    if (!caseId) return false;
    const linked = loadCase(churchId, caseId);
    return !canReadCareCase(access, linked.row, linked.caregiverIds);
  };

  /**
   * Assignees and creators always see their tasks; the care team sees the others, except those
   * of confidential cases it may not read.
   */
  const loadVisible = (churchId: string, access: AccessLike, id: string) => {
    const row = db
      .select()
      .from(careTasks)
      .where(and(eq(careTasks.id, id), eq(careTasks.churchId, churchId)))
      .get();
    if (!row) throw notFound('Task');
    const own = row.assignedUserId === access.userId || row.createdBy === access.userId;
    if (!own && (!isCareTeam(access) || caseHidden(churchId, access, row.caseId))) {
      throw notFound('Task');
    }
    return row;
  };

  const hydrateOne = (church: ChurchRow, access: AccessLike, row: CareTaskRow) => {
    const [task] = hydrateTasks(db, church.id, access, todayIn(church.timezone), [row]);
    if (!task) throw notFound('Task');
    return task;
  };

  const notifyAssignee = (
    tx: Queryable,
    church: ChurchRow,
    row: CareTaskRow,
    actorId: string,
    confidential: boolean,
  ) => {
    if (!row.assignedUserId) return;
    notify(tx, {
      churchId: church.id,
      userIds: [row.assignedUserId],
      excludeUserIds: [actorId],
      type: 'care.task_assigned',
      title: 'Tugas tindak lanjut baru untuk Anda',
      body: confidential ? CONFIDENTIAL_LABEL : row.title,
      link: `/c/${church.id}/care/tasks`,
      entityType: 'care_task',
      entityId: row.id,
    });
  };

  const isConfidentialCase = (caseId: string | null) =>
    !!caseId &&
    db
      .select({ confidentiality: careCases.confidentiality })
      .from(careCases)
      .where(eq(careCases.id, caseId))
      .get()?.confidentiality === 'confidential';

  return new Elysia({ prefix: '/churches/:churchId/care/tasks' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        sendDueCareReminders(db, church);
        const today = todayIn(church.timezone);
        const conditions: SQL[] = [eq(careTasks.churchId, church.id)];
        if (query.caseId) {
          // Everyone who may read the case sees all of its tasks.
          const linked = loadCase(church.id, query.caseId);
          if (!canReadCareCase(access, linked.row, linked.caregiverIds)) {
            throw notFound('Care case');
          }
          conditions.push(eq(careTasks.caseId, linked.row.id));
        } else if (query.followUpId) {
          // Likewise for a follow-up the caller can see.
          const followUp = loadFollowUp(church.id, access, query.followUpId);
          conditions.push(eq(careTasks.followUpId, followUp.id));
        } else if (query.scope === 'mine') {
          conditions.push(eq(careTasks.assignedUserId, access.userId));
        } else {
          if (!isCareTeam(access)) throw forbidden('You cannot see the care team tasks');
          const readable = readableCaseCondition(db, access);
          if (readable) {
            const visible = or(
              isNull(careTasks.caseId),
              sql`${careTasks.caseId} in (select ${careCases.id} from ${careCases} where ${readable})`,
              eq(careTasks.assignedUserId, access.userId),
              eq(careTasks.createdBy, access.userId),
            );
            if (visible) conditions.push(visible);
          }
        }
        if (query.status) conditions.push(eq(careTasks.status, query.status));
        if (query.overdue) {
          conditions.push(eq(careTasks.status, 'open'), lt(careTasks.dueDate, today));
        }
        if (query.q) conditions.push(like(careTasks.title, likePattern(query.q)));
        const rows = db
          .select()
          .from(careTasks)
          .where(and(...conditions))
          .orderBy(
            sql`case ${careTasks.status} when 'open' then 0 else 1 end`,
            sql`${careTasks.dueDate} is null`,
            asc(careTasks.dueDate),
            desc(careTasks.createdAt),
          )
          .limit(CARE_TASK_LIST_MAX)
          .all();
        return { items: hydrateTasks(db, church.id, access, today, rows) };
      },
      { church: 'care', params: churchParamsSchema, query: careTaskListQuerySchema },
    )
    .post(
      '/',
      ({ church, access, auth, audit, body, set }) => {
        let personId = body.personId;
        let confidential = false;
        if (body.caseId) {
          const linked = loadCase(church.id, body.caseId);
          if (!canReadCareCase(access, linked.row, linked.caregiverIds)) {
            throw notFound('Care case');
          }
          if (!canManageCareCase(access, linked.row, linked.caregiverIds)) {
            throw forbidden('You cannot add tasks to this care case');
          }
          personId = personId ?? linked.row.personId;
          confidential = linked.row.confidentiality === 'confidential';
        } else if (body.followUpId) {
          const followUp = loadFollowUp(church.id, access, body.followUpId);
          if (!canManageFollowUp(access, followUp)) {
            throw forbidden('You cannot add tasks to this follow-up');
          }
          personId = personId ?? followUp.personId;
        } else if (!has(access, 'care.manage')) {
          throw forbidden('You cannot create care tasks');
        }
        if (personId) loadPersonInChurch(db, church.id, personId);
        const assignedUserId = body.assignedUserId ?? auth.user.id;
        assertActiveMembers(db, church.id, [assignedUserId]);
        const now = nowIso();
        const created = db.transaction((tx) => {
          const row = tx
            .insert(careTasks)
            .values({
              id: newId(),
              churchId: church.id,
              title: body.title,
              description: body.description,
              dueDate: body.dueDate,
              status: 'open',
              assignedUserId,
              followUpId: body.caseId ? null : body.followUpId,
              caseId: body.caseId,
              personId,
              createdBy: auth.user.id,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'care',
            action: 'care_task.create',
            entityType: 'care_task',
            entityId: row.id,
            summary: 'Created a follow-up task',
            after: redact(auditable(row), secretFields(confidential)),
          });
          notifyAssignee(tx, church, row, auth.user.id, confidential);
          return row;
        });
        set.status = 201;
        return { task: hydrateOne(church, access, created) };
      },
      { church: 'care', params: churchParamsSchema, body: careTaskInputSchema },
    )
    .patch(
      '/:id',
      ({ church, access, auth, audit, params, body }) => {
        const row = loadVisible(church.id, access, params.id);
        if (!canEditCareTask(access, row)) throw forbidden('You cannot edit this task');
        if (body.personId) loadPersonInChurch(db, church.id, body.personId);
        const assignedUserId = body.assignedUserId ?? row.assignedUserId ?? auth.user.id;
        if (assignedUserId !== row.assignedUserId) {
          assertActiveMembers(db, church.id, [assignedUserId]);
        }
        const confidential = isConfidentialCase(row.caseId);
        const updated = db.transaction((tx) => {
          const next = tx
            .update(careTasks)
            .set({
              title: body.title,
              description: body.description,
              dueDate: body.dueDate,
              assignedUserId,
              personId: body.personId,
              reminderSentAt:
                body.dueDate === row.dueDate && assignedUserId === row.assignedUserId
                  ? row.reminderSentAt
                  : null,
              updatedAt: nowIso(),
            })
            .where(eq(careTasks.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Task');
          recordAudit(tx, audit, {
            module: 'care',
            action: 'care_task.update',
            entityType: 'care_task',
            entityId: row.id,
            summary: 'Updated a follow-up task',
            ...redactedChanges(auditable(row), auditable(next), secretFields(confidential)),
          });
          if (next.assignedUserId !== row.assignedUserId) {
            notifyAssignee(tx, church, next, auth.user.id, confidential);
          }
          return next;
        });
        return { task: hydrateOne(church, access, updated) };
      },
      { church: 'care', params: churchIdParamsSchema, body: careTaskUpdateSchema },
    )
    .patch(
      '/:id/status',
      ({ church, access, auth, audit, params, body }) => {
        const row = loadVisible(church.id, access, params.id);
        if (!canCompleteCareTask(access, row)) throw forbidden('You cannot update this task');
        const now = nowIso();
        const updated = db.transaction((tx) => {
          const next = tx
            .update(careTasks)
            .set({
              status: body.status,
              completedAt: body.status === 'done' ? (row.completedAt ?? now) : null,
              completedBy: body.status === 'done' ? (row.completedBy ?? auth.user.id) : null,
              updatedAt: now,
            })
            .where(eq(careTasks.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Task');
          if (next.status !== row.status) {
            recordAudit(tx, audit, {
              module: 'care',
              action: 'care_task.status',
              entityType: 'care_task',
              entityId: row.id,
              summary:
                body.status === 'done'
                  ? 'Completed a follow-up task'
                  : body.status === 'cancelled'
                    ? 'Cancelled a follow-up task'
                    : 'Reopened a follow-up task',
              before: { status: row.status },
              after: { status: next.status },
            });
          }
          return next;
        });
        return { task: hydrateOne(church, access, updated) };
      },
      { church: 'care', params: churchIdParamsSchema, body: updateCareTaskStatusBodySchema },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        const row = loadVisible(church.id, access, params.id);
        if (!canEditCareTask(access, row)) throw forbidden('You cannot delete this task');
        const confidential = isConfidentialCase(row.caseId);
        db.transaction((tx) => {
          tx.delete(careTasks).where(eq(careTasks.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'care',
            action: 'care_task.delete',
            entityType: 'care_task',
            entityId: row.id,
            summary: 'Deleted a follow-up task',
            before: redact(auditable(row), secretFields(confidential)),
          });
        });
        return { ok: true as const };
      },
      { church: 'care', params: churchIdParamsSchema },
    );
};
