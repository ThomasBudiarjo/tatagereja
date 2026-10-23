import {
  can,
  churchIdParamsSchema,
  churchParamsSchema,
  createInvitationBodySchema,
  invitationTokenParamsSchema,
} from '@tatagereja/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { churches, invitations, users } from '../db/schema';
import type { Deps } from '../deps';
import { HttpError, conflict, forbidden, notFound, rateLimited } from '../lib/errors';
import { clientIp, requestMeta } from '../lib/request';
import { addDays, nowIso } from '../lib/time';
import { generateToken, hashToken, newId } from '../lib/tokens';
import { authPlugin } from '../plugins/auth';
import { toInvitation } from '../serializers';
import { recordAudit } from '../services/audit';
import {
  acceptInvitation,
  effectiveInvitationStatus,
  findInvitationByToken,
} from '../services/invitations';

export const invitationsModule = (deps: Deps) => {
  const { db, config } = deps;

  const loadInvitation = (churchId: string, id: string) => {
    const row = db
      .select()
      .from(invitations)
      .where(and(eq(invitations.id, id), eq(invitations.churchId, churchId)))
      .get();
    if (!row) throw notFound('Invitation');
    return row;
  };

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
        const token = generateToken(24);
        const row = db.transaction((tx) => {
          const created = tx
            .insert(invitations)
            .values({
              id: newId(),
              churchId: church.id,
              tokenHash: hashToken(token),
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
        return { invitation: toInvitation(row, auth.user.name, config.appUrl, token) };
      },
      { church: true, params: churchParamsSchema, body: createInvitationBodySchema },
    )
    .post(
      '/:id/regenerate',
      ({ church, access, audit, params }) => {
        const row = loadInvitation(church.id, params.id);
        if (!can.createInvitations(access))
          throw forbidden('Only administrators can manage invitations');
        if (!can.inviteWithRole(access, row.role)) {
          throw new HttpError(
            403,
            'ESCALATION_DENIED',
            'Only someone with every administrator permission can manage administrator invitations',
          );
        }
        if (effectiveInvitationStatus(db, row) !== 'active') {
          throw conflict('Only an active invitation can get a new link');
        }
        // The old link stops working at once: only the new token's hash is kept.
        const token = generateToken(24);
        const updated = db.transaction((tx) => {
          const next = tx
            .update(invitations)
            .set({ tokenHash: hashToken(token) })
            .where(eq(invitations.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Invitation');
          recordAudit(tx, audit, {
            module: 'core',
            action: 'invitation.regenerate',
            entityType: 'invitation',
            entityId: row.id,
            summary: `Made a new link for the ${row.role} invitation${row.label ? ` "${row.label}"` : ''}`,
          });
          return next;
        });
        const creator = db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, updated.createdBy))
          .get();
        return {
          invitation: toInvitation(updated, creator?.name ?? '', config.appUrl, token),
        };
      },
      { church: true, params: churchIdParamsSchema },
    )
    .delete(
      '/:id',
      ({ church, access, audit, params }) => {
        if (!can.createInvitations(access))
          throw forbidden('Only administrators can revoke invitations');
        const row = loadInvitation(church.id, params.id);
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
        const wait = deps.limiters.invitation.check(
          clientIp(request, server ?? undefined, config.trustProxy),
        );
        if (wait > 0) throw rateLimited(wait);
        const row = db
          .select({ invitation: invitations, church: churches })
          .from(invitations)
          .innerJoin(churches, eq(churches.id, invitations.churchId))
          .where(eq(invitations.tokenHash, hashToken(params.token)))
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
          status: effectiveInvitationStatus(db, row.invitation),
          expiresAt: row.invitation.expiresAt,
        };
      },
      { params: invitationTokenParamsSchema },
    )
    .post(
      '/:token/accept',
      ({ params, auth, request, server }) => {
        // Per account, so a signed-in session cannot be used to try invitation tokens either.
        const wait = deps.limiters.invitation.check(`accept:${auth.user.id}`);
        if (wait > 0) throw rateLimited(wait);
        if (!findInvitationByToken(db, params.token)) throw notFound('Invitation');
        const result = acceptInvitation(
          db,
          params.token,
          auth.user.id,
          requestMeta(request, server ?? undefined, config.trustProxy),
        );
        return { churchId: result.churchId, alreadyMember: result.alreadyMember };
      },
      { auth: true, params: invitationTokenParamsSchema },
    );

  return new Elysia().use(churchScoped).use(publicRoutes);
};
