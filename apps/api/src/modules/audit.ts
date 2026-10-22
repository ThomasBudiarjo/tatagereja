import { auditLogQuerySchema, churchParamsSchema } from '@tatagereja/shared';
import { and, count, desc, eq, gte, like, lte, or, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { auditLogs, users } from '../db/schema';
import type { Deps } from '../deps';
import { likePattern, offsetOf } from '../lib/query';
import { toUtcIso } from '../lib/time';
import { authPlugin } from '../plugins/auth';
import { toAuditLog } from '../serializers';

/** Read-only access to the church's audit log. Entries are written by services/audit.ts. */
export const auditModule = (deps: Deps) => {
  const { db } = deps;

  return new Elysia({ prefix: '/churches/:churchId/audit-logs' }).use(authPlugin(deps)).get(
    '/',
    ({ church, query }) => {
      const conditions: SQL[] = [eq(auditLogs.churchId, church.id)];
      if (query.actorUserId) conditions.push(eq(auditLogs.actorUserId, query.actorUserId));
      if (query.module) conditions.push(eq(auditLogs.module, query.module));
      if (query.action) conditions.push(eq(auditLogs.action, query.action));
      if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
      if (query.entityId) conditions.push(eq(auditLogs.entityId, query.entityId));
      if (query.from) conditions.push(gte(auditLogs.createdAt, toUtcIso(query.from)));
      if (query.to) conditions.push(lte(auditLogs.createdAt, toUtcIso(query.to)));
      if (query.q) {
        const search = or(
          like(auditLogs.summary, likePattern(query.q)),
          like(auditLogs.action, likePattern(query.q)),
        );
        if (search) conditions.push(search);
      }
      const where = and(...conditions);
      const total = db.select({ value: count() }).from(auditLogs).where(where).get()?.value ?? 0;
      const rows = db
        .select({ log: auditLogs, actorName: users.name })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .where(where)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(query.limit)
        .offset(offsetOf(query))
        .all();
      return {
        items: rows.map((row) => toAuditLog(row.log, row.actorName ?? null)),
        total,
        page: query.page,
        limit: query.limit,
      };
    },
    {
      church: { permission: 'audit.view', message: 'You cannot view the audit log' },
      params: churchParamsSchema,
      query: auditLogQuerySchema,
    },
  );
};
