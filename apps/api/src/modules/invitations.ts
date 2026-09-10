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
import { forbidden, notFound, rateLimited } from '../lib/errors';
import { clientIp } from '../lib/request';
import { addDays, nowIso } from '../lib/time';
import { generateToken, newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toInvitation } from '../serializers';
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
      ({ church, access, auth, body, set }) => {
        if (!can.createInvitations(access))
          throw forbidden('Only administrators can create invitations');
        const now = new Date();
        const row = db
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
        set.status = 201;
        return { invitation: toInvitation(row, auth.user.name, config.appUrl) };
      },
      { church: true, params: churchParamsSchema, body: createInvitationBodySchema },
    )
    .delete(
      '/:id',
      ({ church, access, params }) => {
        if (!can.createInvitations(access))
          throw forbidden('Only administrators can revoke invitations');
        const row = db
          .select()
          .from(invitations)
          .where(and(eq(invitations.id, params.id), eq(invitations.churchId, church.id)))
          .get();
        if (!row) throw notFound('Invitation');
        if (!row.revokedAt) {
          db.update(invitations)
            .set({ revokedAt: nowIso() })
            .where(eq(invitations.id, row.id))
            .run();
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
      ({ params, auth }) => {
        if (!findInvitationByToken(db, params.token)) throw notFound('Invitation');
        const result = acceptInvitation(db, params.token, auth.user.id);
        return { churchId: result.churchId, alreadyMember: result.alreadyMember };
      },
      { auth: true, params: invitationTokenParamsSchema },
    );

  return new Elysia().use(churchScoped).use(publicRoutes);
};
