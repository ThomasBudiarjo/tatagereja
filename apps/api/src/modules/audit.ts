import {
  LIMITS,
  auditLogExportQuerySchema,
  auditLogFilterSchema,
  auditRedactedModules,
  churchIdParamsSchema,
  churchParamsSchema,
  isModuleId,
  type AccessLike,
  type AuditLogExportQuery,
} from '@tatagereja/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  like,
  lt,
  lte,
  notInArray,
  or,
  type SQL,
} from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { ChurchRow } from '../db/schema';
import { auditLogs, users } from '../db/schema';
import type { Deps } from '../deps';
import { afterCursor, decodeCursor, keysetPage } from '../lib/cursor';
import { notFound } from '../lib/errors';
import { likePattern, offsetOf } from '../lib/query';
import { enforceRateLimit } from '../lib/rate-limit';
import { toUtcIso } from '../lib/time';
import { authPlugin } from '../plugins/auth';
import { toAuditLog } from '../serializers';
import { requirePermission } from '../services/access';
import { recordAudit } from '../services/audit';
import { csvRow, zonedDayStart } from './admin-security/format';

const viewGuard = { permission: 'audit.view', message: 'You cannot view the audit log' } as const;

/** Read-only access to the church's audit log. Entries are written by services/audit.ts. */
export const auditModule = (deps: Deps) => {
  const { db } = deps;

  /**
   * Conditions for the viewer's filters; calendar days follow the church time zone. A search
   * never matches the hidden text of entries the viewer sees redacted.
   */
  const conditionsFor = (
    church: ChurchRow,
    access: AccessLike,
    query: AuditLogExportQuery,
  ): SQL[] => {
    const conditions: SQL[] = [eq(auditLogs.churchId, church.id)];
    if (query.actorUserId) conditions.push(eq(auditLogs.actorUserId, query.actorUserId));
    if (query.module) conditions.push(eq(auditLogs.module, query.module));
    if (query.action) conditions.push(eq(auditLogs.action, query.action));
    if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
    if (query.entityId) conditions.push(eq(auditLogs.entityId, query.entityId));
    if (query.from) conditions.push(gte(auditLogs.createdAt, toUtcIso(query.from)));
    if (query.to) conditions.push(lte(auditLogs.createdAt, toUtcIso(query.to)));
    if (query.fromDate) {
      conditions.push(gte(auditLogs.createdAt, zonedDayStart(query.fromDate, church.timezone)));
    }
    if (query.toDate) {
      conditions.push(lt(auditLogs.createdAt, zonedDayStart(query.toDate, church.timezone, true)));
    }
    if (query.q) {
      const hidden = auditRedactedModules(access);
      const summary = like(auditLogs.summary, likePattern(query.q));
      const search = or(
        hidden.length > 0 ? and(summary, notInArray(auditLogs.module, hidden)) : summary,
        like(auditLogs.action, likePattern(query.q)),
        like(users.name, likePattern(query.q)),
      );
      if (search) conditions.push(search);
    }
    return conditions;
  };

  return new Elysia({ prefix: '/churches/:churchId/audit-logs' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access, query }) => {
        const where = and(...conditionsFor(church, access, query));
        // Actors are joined for the count only when the search reads their names.
        const counted = db.select({ value: count() }).from(auditLogs).$dynamic();
        const total =
          (query.q ? counted.leftJoin(users, eq(users.id, auditLogs.actorUserId)) : counted)
            .where(where)
            .get()?.value ?? 0;
        const after = query.cursor ? decodeCursor(query.cursor, 2) : null;
        const fetched = db
          .select({ log: auditLogs, actorName: users.name })
          .from(auditLogs)
          .leftJoin(users, eq(users.id, auditLogs.actorUserId))
          .where(
            after
              ? and(where, afterCursor([auditLogs.createdAt, auditLogs.id], after, 'desc'))
              : where,
          )
          .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
          .limit(query.limit + 1)
          .offset(after ? 0 : offsetOf(query))
          .all();
        const { rows, nextCursor } = keysetPage(fetched, query.limit, (row) => [
          row.log.createdAt,
          row.log.id,
        ]);
        return {
          items: rows.map((row) => toAuditLog(row.log, row.actorName ?? null, access)),
          total,
          page: query.page,
          limit: query.limit,
          nextCursor,
        };
      },
      { church: viewGuard, params: churchParamsSchema, query: auditLogFilterSchema },
    )
    .get(
      '/facets',
      ({ church }) => {
        const scope = eq(auditLogs.churchId, church.id);
        const distinct = (
          column: typeof auditLogs.action | typeof auditLogs.module | typeof auditLogs.entityType,
        ) =>
          db
            .selectDistinct({ value: column })
            .from(auditLogs)
            .where(scope)
            .orderBy(asc(column))
            .limit(LIMITS.pageSizeMax)
            .all()
            .map((row) => row.value);
        return {
          actors: db
            .selectDistinct({ id: users.id, name: users.name })
            .from(auditLogs)
            .innerJoin(users, eq(users.id, auditLogs.actorUserId))
            .where(scope)
            .orderBy(asc(users.name))
            .limit(LIMITS.pageSizeMax)
            .all(),
          modules: distinct(auditLogs.module).filter(isModuleId),
          actions: distinct(auditLogs.action),
          entityTypes: distinct(auditLogs.entityType),
        };
      },
      { church: viewGuard, params: churchParamsSchema },
    )
    .get(
      '/export',
      ({ church, access, audit, query, set }) => {
        requirePermission(access, 'audit.view', 'You cannot view the audit log');
        enforceRateLimit(deps.limiters, 'audit.export', church.id, {
          windowMs: 15 * 60_000,
          max: 20,
        });
        const rows = db
          .select({ log: auditLogs, actorName: users.name })
          .from(auditLogs)
          .leftJoin(users, eq(users.id, auditLogs.actorUserId))
          .where(and(...conditionsFor(church, access, query)))
          .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
          .limit(LIMITS.csvRowsMax)
          .all();
        const lines = [
          csvRow([
            'createdAt',
            'actor',
            'module',
            'action',
            'entityType',
            'entityId',
            'summary',
            'before',
            'after',
            'ip',
            'userAgent',
          ]),
          ...rows.map(({ log, actorName }) => {
            // The export follows the same redaction as the viewer.
            const entry = toAuditLog(log, actorName ?? null, access);
            return csvRow([
              entry.createdAt,
              entry.actorName ?? '',
              entry.module,
              entry.action,
              entry.entityType,
              entry.entityId,
              entry.summary,
              entry.before,
              entry.after,
              entry.ip,
              entry.userAgent,
            ]);
          }),
        ];
        // The export itself is recorded, so downloads of the log are visible in the log.
        recordAudit(db, audit, {
          module: 'admin-security',
          action: 'audit.export',
          entityType: 'audit_log',
          summary: `Exported ${rows.length} audit log entr${rows.length === 1 ? 'y' : 'ies'}`,
          after: { rows: rows.length, filters: query },
        });
        set.headers['content-type'] = 'text/csv; charset=utf-8';
        set.headers['content-disposition'] =
          `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`;
        // A byte order mark lets spreadsheet apps read the UTF-8 names correctly.
        return `\uFEFF${lines.join('\r\n')}\r\n`;
      },
      {
        church: {
          permission: 'audit.export',
          message: 'You cannot export the audit log',
        },
        params: churchParamsSchema,
        query: auditLogExportQuerySchema,
      },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const row = db
          .select({ log: auditLogs, actorName: users.name })
          .from(auditLogs)
          .leftJoin(users, eq(users.id, auditLogs.actorUserId))
          .where(and(eq(auditLogs.id, params.id), eq(auditLogs.churchId, church.id)))
          .get();
        if (!row) throw notFound('Audit entry');
        return { entry: toAuditLog(row.log, row.actorName ?? null, access) };
      },
      { church: viewGuard, params: churchIdParamsSchema },
    );
};
