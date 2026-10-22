import {
  WORSHIP_LIMITS,
  canManageServingTeam,
  canScheduleTeam,
  churchIdParamsSchema,
  churchParamsSchema,
  fullName,
  has,
  servingPositionInputSchema,
  servingTeamInputSchema,
  servingTeamMemberInputSchema,
  servingTeamMemberUpdateSchema,
  teamParamsSchema,
  type AccessLike,
  type ServingTeamMember,
} from '@tatagereja/shared';
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type { ServingTeamMemberRow, ServingTeamRow } from '../../db/schema';
import {
  groups,
  servingMemberPositions,
  servingPositions,
  servingTeamMembers,
  servingTeams,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit } from '../../services/audit';
import { ledTeamIdsOf, personSummaries } from '../../services/worship';
import { loadPerson, loadPosition, loadTeam } from './load';
import { toServingPosition, toServingTeam } from './serializers';

const teamFields = (row: ServingTeamRow) => ({
  name: row.name,
  description: row.description,
  color: row.color,
  groupId: row.groupId,
  isActive: row.isActive,
});

/** Serving teams (Pemusik, Singers, Multimedia, Penerima Tamu, ...), positions and members. */
export const teamsRouter = (deps: Deps) => {
  const { db } = deps;

  const hydrateTeams = (churchId: string, rows: ServingTeamRow[]) => {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const positions = db
      .select()
      .from(servingPositions)
      .where(and(eq(servingPositions.churchId, churchId), inArray(servingPositions.teamId, ids)))
      .orderBy(asc(servingPositions.sortOrder), asc(servingPositions.name))
      .all();
    const counts = new Map(
      db
        .select({ teamId: servingTeamMembers.teamId, value: count() })
        .from(servingTeamMembers)
        .where(inArray(servingTeamMembers.teamId, ids))
        .groupBy(servingTeamMembers.teamId)
        .all()
        .map((row) => [row.teamId, row.value]),
    );
    return rows.map((row) =>
      toServingTeam(
        row,
        positions.filter((position) => position.teamId === row.id),
        counts.get(row.id) ?? 0,
      ),
    );
  };

  const hydrateMembers = (churchId: string, rows: ServingTeamMemberRow[]): ServingTeamMember[] => {
    if (rows.length === 0) return [];
    const persons = personSummaries(
      db,
      churchId,
      rows.map((row) => row.personId),
    );
    const positionIds = new Map<string, string[]>();
    for (const row of db
      .select()
      .from(servingMemberPositions)
      .where(
        inArray(
          servingMemberPositions.teamMemberId,
          rows.map((row) => row.id),
        ),
      )
      .all()) {
      positionIds.set(row.teamMemberId, [
        ...(positionIds.get(row.teamMemberId) ?? []),
        row.positionId,
      ]);
    }
    return rows
      .flatMap((row) => {
        const person = persons.get(row.personId);
        return person
          ? [
              {
                ...person,
                teamMemberId: row.id,
                role: row.role,
                positionIds: positionIds.get(row.id) ?? [],
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          Number(b.role === 'leader') - Number(a.role === 'leader') ||
          fullName(a).localeCompare(fullName(b), 'id'),
      );
  };

  const hydrateTeam = (churchId: string, row: ServingTeamRow) => hydrateTeams(churchId, [row])[0]!;

  const assertGroup = (churchId: string, groupId: string | null) => {
    if (!groupId) return;
    const found = db
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.churchId, churchId)))
      .get();
    if (!found) throw notFound('Group');
  };

  const assertNameFree = (churchId: string, name: string, exceptId?: string) => {
    const conditions = [eq(servingTeams.churchId, churchId), eq(servingTeams.name, name)];
    if (exceptId) conditions.push(ne(servingTeams.id, exceptId));
    if (
      db
        .select({ id: servingTeams.id })
        .from(servingTeams)
        .where(and(...conditions))
        .get()
    ) {
      throw conflict('A serving team with this name already exists');
    }
  };

  /** `services.manage` or a leader of the team; 403 otherwise. */
  const assertCanManage = (churchId: string, access: AccessLike, teamId: string) => {
    if (!canManageServingTeam(access, ledTeamIdsOf(db, churchId, access.personId), teamId)) {
      throw forbidden('You cannot manage this serving team');
    }
  };

  /** Position ids must belong to the team. */
  const assertPositions = (teamId: string, positionIds: readonly string[]) => {
    if (positionIds.length === 0) return;
    const found = new Set(
      db
        .select({ id: servingPositions.id })
        .from(servingPositions)
        .where(
          and(eq(servingPositions.teamId, teamId), inArray(servingPositions.id, [...positionIds])),
        )
        .all()
        .map((row) => row.id),
    );
    if (positionIds.some((id) => !found.has(id))) throw notFound('Position');
  };

  const setPositions = (
    tx: Queryable,
    churchId: string,
    teamMemberId: string,
    positionIds: readonly string[],
  ) => {
    tx.delete(servingMemberPositions)
      .where(eq(servingMemberPositions.teamMemberId, teamMemberId))
      .run();
    const unique = [...new Set(positionIds)];
    if (unique.length > 0) {
      tx.insert(servingMemberPositions)
        .values(unique.map((positionId) => ({ teamMemberId, positionId, churchId })))
        .run();
    }
  };

  const loadMember = (teamId: string, id: string): ServingTeamMemberRow => {
    const row = db
      .select()
      .from(servingTeamMembers)
      .where(and(eq(servingTeamMembers.id, id), eq(servingTeamMembers.teamId, teamId)))
      .get();
    if (!row) throw notFound('Team member');
    return row;
  };

  const memberResponse = (churchId: string, row: ServingTeamMemberRow) => {
    const [member] = hydrateMembers(churchId, [row]);
    if (!member) throw notFound('Team member');
    return { member };
  };

  return new Elysia({ prefix: '/churches/:churchId/worship/teams' })
    .use(authPlugin(deps))
    .get(
      '/',
      ({ church }) => ({
        items: hydrateTeams(
          church.id,
          db
            .select()
            .from(servingTeams)
            .where(eq(servingTeams.churchId, church.id))
            .orderBy(asc(servingTeams.name))
            .all(),
        ),
      }),
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchParamsSchema,
      },
    )
    .post(
      '/',
      ({ church, audit, body, set }) => {
        assertGroup(church.id, body.groupId);
        assertNameFree(church.id, body.name);
        const now = nowIso();
        const row = db.transaction((tx) => {
          const created = tx
            .insert(servingTeams)
            .values({ id: newId(), churchId: church.id, ...body, createdAt: now, updatedAt: now })
            .returning()
            .get();
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'serving_team.create',
            entityType: 'serving_team',
            entityId: created.id,
            summary: `Created the serving team ${created.name}`,
            after: teamFields(created),
          });
          return created;
        });
        set.status = 201;
        return { team: hydrateTeam(church.id, row) };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchParamsSchema,
        body: servingTeamInputSchema,
      },
    )
    .get(
      '/:id',
      ({ church, access, params }) => {
        const row = loadTeam(db, church.id, params.id);
        const ledTeamIds = ledTeamIdsOf(db, church.id, access.personId);
        const members = db
          .select()
          .from(servingTeamMembers)
          .where(eq(servingTeamMembers.teamId, row.id))
          .all();
        return {
          team: hydrateTeam(church.id, row),
          members: hydrateMembers(church.id, members),
          canManage: canManageServingTeam(access, ledTeamIds, row.id),
          canSchedule: canScheduleTeam(access, ledTeamIds, row.id),
        };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
      },
    )
    .patch(
      '/:id',
      ({ church, audit, params, body }) => {
        const before = loadTeam(db, church.id, params.id);
        assertGroup(church.id, body.groupId);
        assertNameFree(church.id, body.name, before.id);
        const row = db.transaction((tx) => {
          const updated = tx
            .update(servingTeams)
            .set({ ...body, updatedAt: nowIso() })
            .where(eq(servingTeams.id, before.id))
            .returning()
            .get();
          if (!updated) throw notFound('Serving team');
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'serving_team.update',
            entityType: 'serving_team',
            entityId: before.id,
            summary: `Updated the serving team ${updated.name}`,
            ...changes(teamFields(before), teamFields(updated)),
          });
          return updated;
        });
        return { team: hydrateTeam(church.id, row) };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchIdParamsSchema,
        body: servingTeamInputSchema,
      },
    )
    .delete(
      '/:id',
      ({ church, audit, params }) => {
        const row = loadTeam(db, church.id, params.id);
        // Positions, memberships and roster assignments of the team cascade with it.
        db.transaction((tx) => {
          tx.delete(servingTeams).where(eq(servingTeams.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'serving_team.delete',
            entityType: 'serving_team',
            entityId: row.id,
            summary: `Deleted the serving team ${row.name}`,
            before: teamFields(row),
          });
        });
        return { ok: true as const };
      },
      {
        church: { module: 'worship', permission: 'services.manage' },
        params: churchIdParamsSchema,
      },
    )
    .post(
      '/:id/positions',
      ({ church, access, params, body, set }) => {
        const team = loadTeam(db, church.id, params.id);
        assertCanManage(church.id, access, team.id);
        const existing = db
          .select({ name: servingPositions.name })
          .from(servingPositions)
          .where(eq(servingPositions.teamId, team.id))
          .all();
        if (existing.length >= WORSHIP_LIMITS.positionsPerTeamMax) {
          throw conflict(`A team can have at most ${WORSHIP_LIMITS.positionsPerTeamMax} positions`);
        }
        if (existing.some((row) => row.name.toLowerCase() === body.name.toLowerCase())) {
          throw conflict('This team already has a position with this name');
        }
        const row = db
          .insert(servingPositions)
          .values({
            id: newId(),
            churchId: church.id,
            teamId: team.id,
            ...body,
            sortOrder: body.sortOrder || existing.length,
            createdAt: nowIso(),
          })
          .returning()
          .get();
        set.status = 201;
        return { position: toServingPosition(row) };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
        body: servingPositionInputSchema,
      },
    )
    .patch(
      '/:id/positions/:itemId',
      ({ church, access, params, body }) => {
        const team = loadTeam(db, church.id, params.id);
        assertCanManage(church.id, access, team.id);
        const position = loadPosition(db, church.id, params.itemId);
        if (position.teamId !== team.id) throw notFound('Position');
        const taken = db
          .select({ id: servingPositions.id, name: servingPositions.name })
          .from(servingPositions)
          .where(and(eq(servingPositions.teamId, team.id), ne(servingPositions.id, position.id)))
          .all()
          .some((row) => row.name.toLowerCase() === body.name.toLowerCase());
        if (taken) throw conflict('This team already has a position with this name');
        const row = db
          .update(servingPositions)
          .set(body)
          .where(eq(servingPositions.id, position.id))
          .returning()
          .get();
        if (!row) throw notFound('Position');
        return { position: toServingPosition(row) };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: teamParamsSchema,
        body: servingPositionInputSchema,
      },
    )
    .delete(
      '/:id/positions/:itemId',
      ({ church, access, audit, params }) => {
        const team = loadTeam(db, church.id, params.id);
        assertCanManage(church.id, access, team.id);
        const position = loadPosition(db, church.id, params.itemId);
        if (position.teamId !== team.id) throw notFound('Position');
        // Roster assignments in this position cascade with it.
        db.transaction((tx) => {
          tx.delete(servingPositions).where(eq(servingPositions.id, position.id)).run();
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'serving_position.delete',
            entityType: 'serving_position',
            entityId: position.id,
            summary: `Removed the position ${position.name} from ${team.name}`,
            before: toServingPosition(position),
          });
        });
        return { ok: true as const };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: teamParamsSchema,
      },
    )
    .post(
      '/:id/members',
      ({ church, access, audit, params, body, set }) => {
        const team = loadTeam(db, church.id, params.id);
        assertCanManage(church.id, access, team.id);
        if (body.role === 'leader' && !has(access, 'services.manage')) {
          throw forbidden('Only worship planners can appoint team leaders');
        }
        const person = loadPerson(db, church.id, body.personId);
        assertPositions(team.id, body.positionIds);
        const existing = db
          .select({ id: servingTeamMembers.id })
          .from(servingTeamMembers)
          .where(
            and(eq(servingTeamMembers.teamId, team.id), eq(servingTeamMembers.personId, person.id)),
          )
          .get();
        if (existing) throw conflict(`${fullName(person)} is already in this team`);
        const row = db.transaction((tx) => {
          const created = tx
            .insert(servingTeamMembers)
            .values({
              id: newId(),
              churchId: church.id,
              teamId: team.id,
              personId: person.id,
              role: body.role,
              joinedAt: nowIso(),
            })
            .returning()
            .get();
          setPositions(tx, church.id, created.id, body.positionIds);
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'serving_team.member_add',
            entityType: 'serving_team',
            entityId: team.id,
            summary: `Added ${fullName(person)} to ${team.name}${body.role === 'leader' ? ' as leader' : ''}`,
            after: { personId: person.id, role: body.role, positionIds: body.positionIds },
          });
          return created;
        });
        set.status = 201;
        return memberResponse(church.id, row);
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
        body: servingTeamMemberInputSchema,
      },
    )
    .patch(
      '/:id/members/:itemId',
      ({ church, access, audit, params, body }) => {
        const team = loadTeam(db, church.id, params.id);
        assertCanManage(church.id, access, team.id);
        const member = loadMember(team.id, params.itemId);
        if (body.role !== member.role && !has(access, 'services.manage')) {
          throw forbidden('Only worship planners can appoint or remove team leaders');
        }
        assertPositions(team.id, body.positionIds);
        const person = loadPerson(db, church.id, member.personId);
        const before = memberResponse(church.id, member).member;
        const row = db.transaction((tx) => {
          const updated = tx
            .update(servingTeamMembers)
            .set({ role: body.role })
            .where(eq(servingTeamMembers.id, member.id))
            .returning()
            .get();
          if (!updated) throw notFound('Team member');
          setPositions(tx, church.id, member.id, body.positionIds);
          if (body.role !== member.role) {
            recordAudit(tx, audit, {
              module: 'worship',
              action: 'serving_team.member_role',
              entityType: 'serving_team',
              entityId: team.id,
              summary:
                body.role === 'leader'
                  ? `Made ${fullName(person)} a leader of ${team.name}`
                  : `${fullName(person)} no longer leads ${team.name}`,
              ...changes({ role: before.role }, { role: body.role }),
            });
          }
          return updated;
        });
        return memberResponse(church.id, row);
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: teamParamsSchema,
        body: servingTeamMemberUpdateSchema,
      },
    )
    .delete(
      '/:id/members/:itemId',
      ({ church, access, audit, params }) => {
        const team = loadTeam(db, church.id, params.id);
        assertCanManage(church.id, access, team.id);
        const member = loadMember(team.id, params.itemId);
        if (member.role === 'leader' && !has(access, 'services.manage')) {
          throw forbidden('Only worship planners can remove team leaders');
        }
        const person = loadPerson(db, church.id, member.personId);
        db.transaction((tx) => {
          tx.delete(servingTeamMembers).where(eq(servingTeamMembers.id, member.id)).run();
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'serving_team.member_remove',
            entityType: 'serving_team',
            entityId: team.id,
            summary: `Removed ${fullName(person)} from ${team.name}`,
            before: { personId: person.id, role: member.role },
          });
        });
        return { ok: true as const };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: teamParamsSchema,
      },
    );
};
