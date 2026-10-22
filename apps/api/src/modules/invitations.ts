import {
  can,
  churchIdParamsSchema,
  churchParamsSchema,
  createInvitationBodySchema,
  invitationStatusOf,
  invitationTokenParamsSchema,
} from '@tatagereja/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { churches, invitations, users } from '../db/schema';
import type { Deps } from '../deps';
import { HttpError, forbidden, notFound, rateLimited } from '../lib/errors';
import { clientIp, requestMeta } from '../lib/request';
import { addDays, nowIso } from '../lib/time';
import { generateToken, newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toInvitation } from '../serializers';
import { recordAudit } from '../services/audit';
import { acceptInvitation, findInvitationByToken } from '../services/invitations';

export const invitationsModule = (deps: Deps) => {
  const { db, config } = deps;

  const churchScoped = new Elysia({ prefix: '/churches/:churchId/invitations' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church, access }) => {
        if (!can.createInvitations(access))
          throw forbidden('Only administrators can view invitations');
        const rows = db
          .select({ invitation: invitations, creatorName: users.name })
          .from(invitations)
          .innerJoin(users, eq(users.id, invitations.createdBy))
          .where(eq(invitations.churchId, church.id))
          .orderBy(desc(invitations.createdAt))
          .all();
        return {
          items: rows.map((row) => toInvitation(row.invitation, row.creatorName, config.appUrl)),
        };
      },
      { church: true, params: churchParamsSchema },
    )
    .post(
      '/',
      ({ church, access, audit, auth, body, set }) => {
        if (!can.createInvitations(access))
          throw forbidden('Only administrators can create invitations');
        if (!can.inviteWithRole(access, body.role)) {
          throw new HttpError(
            403,
            'ESCALATION_DENIED',
            'Only someone with every administrator permission can invite administrators',
          );
        }
        const now = new Date();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(invitations)
            .values({
              id: newId(),
              churchId: church.id,
              token: generateToken(24),
              role: body.role,
              label: body.label,
              expiresAt: body.expiresInDays ? addDays(now, body.expiresInDays).toISOString() : null,
              maxUses: body.maxUses,
              useCount: 0,
              revokedAt: null,
              createdBy: auth.user.id,
              createdAt: now.toISOString(),
            })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'core',
            action: 'invitation.create',
            entityType: 'invitation',
            entityId: created.id,
            summary: `Created ${created.role} invitation${created.label ? ` "${created.label}"` : ''}`,
            after: {
              role: created.role,
              label: created.label,
              expiresAt: created.expiresAt,
              maxUses: created.maxUses,
            },
          });
          return created;
        });
        set.status = 201;
        return { invitation: toInvitation(row, auth.user.name, config.appUrl) };
      },
      { church: true, params: churchParamsSchema, body: createInvitationBodySchema },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        if (!can.createInvitations(access))
          throw forbidden('Only administrators can revoke invitations');
        const row = db
          .select()
          .from(invitations)
          .where(and(eq(invitations.id, params.id), eq(invitations.churchId, church.id)))
          .get();
        if (!row) throw notFound('Invitation');
        if (!row.revokedAt) {
          const revokedAt = nowIso();
          db.transaction((tx) => {
            tx.update(invitations).set({ revokedAt }).where(eq(invitations.id, row.id)).run();
            recordAudit(tx, audit, {
              module: 'core',
              action: 'invitation.revoke',
              entityType: 'invitation',
              entityId: row.id,
              summary: `Revoked ${row.role} invitation${row.label ? ` "${row.label}"` : ''}`,
              before: { revokedAt: null },
              after: { revokedAt },
            });
          });
        }
        return { ok: true as const };
      },
      { church: true, params: churchIdParamsSchema },
    );

  const publicRoutes = new Elysia({ prefix: '/invitations' })
    .use(authPlugin(deps))
    .get(
      '/:token',
      ({ params, request, server }) => {
        const wait = deps.limiters.invitation.check(clientIp(request, server ?? undefined));
        if (wait > 0) throw rateLimited(wait);
        const row = db
          .select({ invitation: invitations, church: churches })
          .from(invitations)
          .innerJoin(churches, eq(churches.id, invitations.churchId))
          .where(eq(invitations.token, params.token))
          .get();
        if (!row) throw notFound('Invitation');
        return {
          church: {
            id: row.church.id,
            name: row.church.name,
            city: row.church.city,
            logoUrl: row.church.logoUrl,
            brandColor: row.church.brandColor,
          },
          role: row.invitation.role,
          status: invitationStatusOf(row.invitation),
          expiresAt: row.invitation.expiresAt,
        };
      },
      { params: invitationTokenParamsSchema },
    )
    .post(
      '/:token/accept',
      ({ params, auth, request, server }) => {
        if (!findInvitationByToken(db, params.token)) throw notFound('Invitation');
        const result = acceptInvitation(
          db,
          params.token,
          auth.user.id,
          requestMeta(request, server ?? undefined),
        );
        return { churchId: result.churchId, alreadyMember: result.alreadyMember };
      },
      { auth: true, params: invitationTokenParamsSchema },
    );

  return new Elysia().use(churchScoped).use(publicRoutes);
};
