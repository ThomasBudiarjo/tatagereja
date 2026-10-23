import {
  canViewSecurity,
  churchParamsSchema,
  churchSecurityPolicySchema,
  has,
  passwordConfirmBodySchema,
  twoFactorRequiredFor,
  updateChurchSecurityPolicyBodySchema,
  type ChurchBackup,
} from '@tatagereja/shared';
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { auditLogs, churches, churchRoles, users } from '../../db/schema';
import type { Deps } from '../../deps';
import { HttpError, notFound } from '../../lib/errors';
import { verifyPassword } from '../../lib/password';
import { enforceRateLimit } from '../../lib/rate-limit';
import { addDays, nowIso } from '../../lib/time';
import { authPlugin } from '../../plugins/auth';
import { toAuditLog, toUserSummary } from '../../serializers';
import { recordAudit } from '../../services/audit';
import { moduleSettings, saveModuleSettings } from '../../services/modules';
import { notify } from '../../services/notifications';
import { churchTables, withoutCredentials } from './introspection';
import { loadMemberRows } from './members';
import { enabledTwoFactor, passwordIncorrect } from './two-factor';

export const BACKUP_VERSION = 1;

/**
 * Church-level security: the 2FA policy, the security overview and the owner's backup.
 * Required module, so the routes only declare their permissions.
 */
export const churchSecurityRouter = (deps: Deps) => {
  const { db } = deps;

  return new Elysia({ prefix: '/churches/:churchId/security' })
    .use(authPlugin(deps))
    .get(
      '/policy',
      ({ church, access, auth }) => {
        const policy = moduleSettings(church, 'admin-security', churchSecurityPolicySchema);
        return {
          policy,
          appliesToYou: twoFactorRequiredFor(policy, access),
          twoFactorEnabled: !!enabledTwoFactor(db, auth.user.id),
        };
      },
      { church: true, params: churchParamsSchema },
    )
    .put(
      '/policy',
      ({ church, access, audit, auth, body }) => {
        const before = moduleSettings(church, 'admin-security', churchSecurityPolicySchema);
        const after = churchSecurityPolicySchema.parse({ ...before, ...body });
        if (
          after.requireTwoFactorForManagers &&
          !before.requireTwoFactorForManagers &&
          !enabledTwoFactor(db, auth.user.id)
        ) {
          // Turning the policy on without 2FA would lock the owner out of their own church.
          throw new HttpError(
            409,
            'TWO_FACTOR_SETUP_REQUIRED',
            'Turn on two-step verification for your own account before requiring it from others',
          );
        }
        if (before.requireTwoFactorForManagers === after.requireTwoFactorForManagers) {
          return { policy: after, appliesToYou: twoFactorRequiredFor(after, access) };
        }
        const managersWithout = loadMemberRows(db, church.id)
          .filter(
            (row) =>
              row.manager &&
              !row.twoFactorEnabled &&
              row.membership.status === 'active' &&
              row.user.id !== auth.user.id,
          )
          .map((row) => row.user.id);
        db.transaction((tx) => {
          saveModuleSettings(tx, church.id, 'admin-security', after);
          recordAudit(tx, audit, {
            module: 'admin-security',
            action: 'security.policy_update',
            entityType: 'church',
            entityId: church.id,
            summary: after.requireTwoFactorForManagers
              ? 'Required two-step verification for members with management permissions'
              : 'Stopped requiring two-step verification',
            before,
            after,
          });
          if (after.requireTwoFactorForManagers && managersWithout.length > 0) {
            notify(tx, {
              churchId: null,
              userIds: managersWithout,
              type: 'security.policy_changed',
              title: {
                id: `${church.name} kini mewajibkan verifikasi dua langkah`,
                en: `${church.name} now requires two-step verification`,
              },
              body: {
                id: 'Peran Anda mengelola data gereja. Aktifkan verifikasi dua langkah agar tetap bisa masuk.',
                en: 'Your role manages church data. Turn on two-step verification to keep access.',
              },
              link: '/profile?tab=security',
              entityType: 'church',
              entityId: church.id,
            });
          }
        });
        return { policy: after, appliesToYou: twoFactorRequiredFor(after, access) };
      },
      {
        church: { permission: 'security.manage', message: 'Only the owner can change the policy' },
        params: churchParamsSchema,
        body: updateChurchSecurityPolicyBodySchema,
      },
    )
    .get(
      '/overview',
      ({ church, access }) => {
        const policy = moduleSettings(church, 'admin-security', churchSecurityPolicySchema);
        const rows = loadMemberRows(db, church.id);
        const active = rows.filter((row) => row.membership.status === 'active');
        const managers = active.filter((row) => row.manager);
        const customRoles =
          db
            .select({ value: count() })
            .from(churchRoles)
            .where(eq(churchRoles.churchId, church.id))
            .get()?.value ?? 0;
        let audit = null;
        if (has(access, 'audit.view')) {
          const since = addDays(new Date(), -7).toISOString();
          audit = {
            last7Days:
              db
                .select({ value: count() })
                .from(auditLogs)
                .where(and(eq(auditLogs.churchId, church.id), gte(auditLogs.createdAt, since)))
                .get()?.value ?? 0,
            recent: db
              .select({ log: auditLogs, actorName: users.name })
              .from(auditLogs)
              .leftJoin(users, eq(users.id, auditLogs.actorUserId))
              .where(eq(auditLogs.churchId, church.id))
              .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
              .limit(5)
              .all()
              .map((row) => toAuditLog(row.log, row.actorName ?? null, access)),
          };
        }
        return {
          policy,
          members: {
            total: rows.length,
            active: active.length,
            suspended: rows.length - active.length,
          },
          twoFactor: canViewSecurity(access)
            ? {
                managers: managers.length,
                managersWithTwoFactor: managers.filter((row) => row.twoFactorEnabled).length,
                withoutTwoFactor: managers
                  .filter((row) => !row.twoFactorEnabled)
                  .sort((a, b) => a.user.name.localeCompare(b.user.name))
                  .map((row) => ({
                    membershipId: row.membership.id,
                    user: toUserSummary(row.user),
                    role: row.membership.role,
                  })),
              }
            : null,
          customRoles,
          audit,
        };
      },
      {
        church: {
          permission: [
            'security.view',
            'security.manage',
            'audit.view',
            'roles.manage',
            'members.view',
            'members.manage',
            'backup.export',
          ],
        },
        params: churchParamsSchema,
      },
    )
    .post(
      '/backup',
      async ({ church, audit, auth, body }) => {
        enforceRateLimit(deps.limiters, 'security.backup', church.id, {
          windowMs: 60 * 60_000,
          max: 10,
        });
        const user = db.select().from(users).where(eq(users.id, auth.user.id)).get();
        if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
          throw passwordIncorrect();
        }
        const churchRow = db.select().from(churches).where(eq(churches.id, church.id)).get();
        if (!churchRow) throw notFound('Church');
        const tables: ChurchBackup['tables'] = {
          churches: [withoutCredentials(churchRow as Record<string, unknown>)],
        };
        for (const info of churchTables()) {
          const column = info.columns.get('church_id');
          if (!column) continue;
          const rows = db.select().from(info.table).where(eq(column, church.id)).all() as Record<
            string,
            unknown
          >[];
          tables[info.name] = rows.map(withoutCredentials);
        }
        const memberUserIds = (tables.church_memberships ?? []).map((row) => String(row.userId));
        tables.users =
          memberUserIds.length > 0
            ? db
                .select({
                  id: users.id,
                  name: users.name,
                  email: users.email,
                  avatarUrl: users.avatarUrl,
                  createdAt: users.createdAt,
                })
                .from(users)
                .where(inArray(users.id, memberUserIds))
                .all()
            : [];
        recordAudit(db, audit, {
          module: 'admin-security',
          action: 'church.backup_export',
          entityType: 'church',
          entityId: church.id,
          summary: `${auth.user.name} downloaded a backup of the church`,
          after: {
            tables: Object.keys(tables).length,
            rows: Object.values(tables).reduce((sum, list) => sum + list.length, 0),
          },
        });
        const backup: ChurchBackup = {
          format: 'tatagereja-backup',
          version: BACKUP_VERSION,
          exportedAt: nowIso(),
          churchId: church.id,
          churchName: church.name,
          tables,
        };
        return backup;
      },
      {
        church: { permission: 'backup.export', message: 'Only the owner can export a backup' },
        params: churchParamsSchema,
        body: passwordConfirmBodySchema,
      },
    );
};
