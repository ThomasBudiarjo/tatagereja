import {
  WORSHIP_LIMITS,
  autoFillRosterBodySchema,
  canRespondToAssignment,
  canScheduleTeam,
  churchIdParamsSchema,
  copyRosterBodySchema,
  fullName,
  localize,
  rankRosterCandidates,
  ROSTER_CONFLICT_LABELS,
  rosterAssignBodySchema,
  rosterCheckBodySchema,
  rosterRespondBodySchema,
  rosterSuggestionQuerySchema,
  type AccessLike,
  type PersonSummary,
  type RosterAssignBody,
  type RosterConflict,
  type RosterSuggestion,
  type ValidationIssue,
} from '@tatagereja/shared';
import { and, asc, desc, eq, exists, inArray, isNull, lt, ne, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { Queryable } from '../../db/client';
import type {
  ChurchRow,
  RosterAssignmentRow,
  ServingPositionRow,
  WorshipServiceRow,
} from '../../db/schema';
import {
  people,
  rosterAssignments,
  servingMemberPositions,
  servingPositions,
  servingTeamMembers,
  servingTeams,
  worshipServices,
} from '../../db/schema';
import type { Deps } from '../../deps';
import { HttpError, conflict, forbidden, notFound } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { newId } from '../../lib/tokens';
import { authPlugin } from '../../plugins/auth';
import { changes, recordAudit, type AuditContext } from '../../services/audit';
import { notify } from '../../services/notifications';
import {
  assertServiceVisible,
  conflictsOf,
  hydrateRoster,
  ledTeamIdsOf,
  loadRoster,
  personSummaries,
  rosterConflicts,
  rosterForViewer,
  schedulableTeamIds,
  servingHistory,
  userIdsOfPeople,
} from '../../services/worship';
import {
  loadAssignment,
  loadPerson,
  loadPosition,
  loadService,
  serviceLink,
  serviceWhen,
} from './load';
import { notifyAssignmentsRemoved } from './notices';

type NewAssignment = {
  positionId: string;
  teamId: string;
  personId: string;
  notes: string | null;
};

const assertOpen = (service: WorshipServiceRow) => {
  if (service.status === 'cancelled') throw conflict('This service is cancelled');
};

const conflictMessage = (name: string, conflicts: RosterConflict[]) =>
  `${name}: ${conflicts
    .map(
      (item) =>
        `${localize(ROSTER_CONFLICT_LABELS[item.kind], 'en')}${item.detail ? ` (${item.detail})` : ''}`,
    )
    .join('; ')}`;

/** Jadwal pelayanan: assignments, suggestions by rotation fairness, copying and replies. */
export const rosterRouter = (deps: Deps) => {
  const { db } = deps;

  const scheduler = (church: ChurchRow, access: AccessLike) => {
    const ledTeamIds = ledTeamIdsOf(db, church.id, access.personId);
    return {
      ledTeamIds,
      canSchedule: (teamId: string) => canScheduleTeam(access, ledTeamIds, teamId),
      teamIds: () => schedulableTeamIds(db, church.id, access, ledTeamIds),
    };
  };

  /** Inserts assignments, tells each scheduled person once and records one audit entry. */
  const createAssignments = (
    tx: Queryable,
    church: ChurchRow,
    service: WorshipServiceRow,
    entries: readonly NewAssignment[],
    actor: { userId: string; audit: AuditContext },
    action: string,
    summary: string,
  ): RosterAssignmentRow[] => {
    if (entries.length === 0) return [];
    const now = nowIso();
    const rows = tx
      .insert(rosterAssignments)
      .values(
        entries.map((entry) => ({
          id: newId(),
          churchId: church.id,
          serviceId: service.id,
          teamId: entry.teamId,
          positionId: entry.positionId,
          personId: entry.personId,
          status: 'pending' as const,
          notes: entry.notes,
          notifiedAt: now,
          assignedBy: actor.userId,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning()
      .all();
    const positions = new Map(
      tx
        .select({ id: servingPositions.id, name: servingPositions.name, team: servingTeams.name })
        .from(servingPositions)
        .innerJoin(servingTeams, eq(servingTeams.id, servingPositions.teamId))
        .where(
          inArray(
            servingPositions.id,
            rows.map((row) => row.positionId),
          ),
        )
        .all()
        .map((row) => [row.id, `${row.team} · ${row.name}`]),
    );
    const users = userIdsOfPeople(
      tx,
      church.id,
      rows.map((row) => row.personId),
    );
    const byPerson = new Map<string, string[]>();
    for (const row of rows) {
      byPerson.set(row.personId, [
        ...(byPerson.get(row.personId) ?? []),
        positions.get(row.positionId) ?? '',
      ]);
    }
    for (const [personId, labels] of byPerson) {
      const userId = users.get(personId);
      if (!userId) continue;
      notify(tx, {
        churchId: church.id,
        userIds: [userId],
        excludeUserIds: [actor.userId],
        type: 'roster.assigned',
        title: `You are scheduled to serve at ${service.title}`,
        body: `${labels.join(', ')} · ${serviceWhen(service.startsAt, church.timezone)}. Please accept or decline.`,
        link: `/c/${church.id}/worship/me`,
        entityType: 'service',
        entityId: service.id,
      });
    }
    recordAudit(tx, actor.audit, {
      module: 'worship',
      action,
      entityType: 'service',
      entityId: service.id,
      summary,
      after: {
        assignments: rows.map((row) => ({ positionId: row.positionId, personId: row.personId })),
      },
    });
    return rows;
  };

  /** Existing (position, person) pairs of a service, to skip duplicates. */
  const existingPairs = (serviceId: string) =>
    new Set(
      db
        .select({ positionId: rosterAssignments.positionId, personId: rosterAssignments.personId })
        .from(rosterAssignments)
        .where(eq(rosterAssignments.serviceId, serviceId))
        .all()
        .map((row) => `${row.positionId}:${row.personId}`),
    );

  /** Ranked candidates for each position (team members able to serve in it). */
  const suggestionsFor = (
    church: ChurchRow,
    service: WorshipServiceRow,
    positions: ServingPositionRow[],
  ): RosterSuggestion[] => {
    if (positions.length === 0) return [];
    const teamIds = [...new Set(positions.map((position) => position.teamId))];
    const members = db
      .select({
        id: servingTeamMembers.id,
        teamId: servingTeamMembers.teamId,
        personId: servingTeamMembers.personId,
      })
      .from(servingTeamMembers)
      .innerJoin(people, eq(people.id, servingTeamMembers.personId))
      .where(
        and(
          eq(servingTeamMembers.churchId, church.id),
          inArray(servingTeamMembers.teamId, teamIds),
          ne(people.membershipStatus, 'inactive'),
        ),
      )
      .all();
    const skills = new Map<string, Set<string>>();
    if (members.length > 0) {
      for (const row of db
        .select()
        .from(servingMemberPositions)
        .where(
          inArray(
            servingMemberPositions.teamMemberId,
            members.map((member) => member.id),
          ),
        )
        .all()) {
        const set = skills.get(row.teamMemberId) ?? new Set<string>();
        set.add(row.positionId);
        skills.set(row.teamMemberId, set);
      }
    }
    const taken = existingPairs(service.id);
    const personIds = [...new Set(members.map((member) => member.personId))];
    const persons = personSummaries(db, church.id, personIds);
    const history = servingHistory(
      db,
      church.id,
      personIds,
      service.startsAt,
      WORSHIP_LIMITS.rotationWeeks,
    );
    const conflicts = rosterConflicts(
      db,
      church,
      service,
      members.map((member) => ({ personId: member.personId, teamId: member.teamId })),
    );
    return positions.map((position) => {
      const eligible = members.filter((member) => {
        if (member.teamId !== position.teamId) return false;
        if (taken.has(`${position.id}:${member.personId}`)) return false;
        const set = skills.get(member.id);
        return !set || set.size === 0 || set.has(position.id);
      });
      const candidates = eligible.flatMap((member) => {
        const person = persons.get(member.personId);
        if (!person) return [];
        const served = history.get(member.personId);
        return [
          {
            ...person,
            timesServed: served?.timesServed ?? 0,
            lastServedAt: served?.lastServedAt ?? null,
            conflicts: conflictsOf(conflicts, { personId: member.personId, teamId: member.teamId }),
          },
        ];
      });
      return { positionId: position.id, candidates: rankRosterCandidates(candidates) };
    });
  };

  /**
   * The requested assignments the caller may make (403 for a team they do not schedule, 404
   * for ids of another church), without duplicates or pairs already on the roster.
   */
  const plannedAssignments = (
    church: ChurchRow,
    access: AccessLike,
    service: WorshipServiceRow,
    requested: RosterAssignBody['assignments'],
  ) => {
    const scope = scheduler(church, access);
    const positions = new Map<string, ServingPositionRow>();
    for (const entry of requested) {
      if (!positions.has(entry.positionId)) {
        positions.set(entry.positionId, loadPosition(db, church.id, entry.positionId));
      }
      const position = positions.get(entry.positionId)!;
      if (!scope.canSchedule(position.teamId)) {
        throw forbidden('You cannot schedule volunteers for this team');
      }
      loadPerson(db, church.id, entry.personId);
    }
    const taken = existingPairs(service.id);
    const seen = new Set<string>();
    const fresh: NewAssignment[] = [];
    let skipped = 0;
    for (const entry of requested) {
      const key = `${entry.positionId}:${entry.personId}`;
      if (taken.has(key) || seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      fresh.push({
        positionId: entry.positionId,
        teamId: positions.get(entry.positionId)!.teamId,
        personId: entry.personId,
        notes: entry.notes,
      });
    }
    return { fresh, skipped };
  };

  /** Conflicts of each planned assignment, counting two positions in one request as well. */
  const plannedConflicts = (
    church: ChurchRow,
    service: WorshipServiceRow,
    fresh: readonly NewAssignment[],
  ): { entry: NewAssignment; person: PersonSummary | null; conflicts: RosterConflict[] }[] => {
    if (fresh.length === 0) return [];
    const found = rosterConflicts(db, church, service, fresh);
    const names = personSummaries(
      db,
      church.id,
      fresh.map((entry) => entry.personId),
    );
    return fresh.map((entry, index) => {
      const list = [...conflictsOf(found, entry)];
      if (
        fresh.some((other, at) => at < index && other.personId === entry.personId) &&
        !list.some((item) => item.kind === 'double_booked')
      ) {
        list.push({ kind: 'double_booked', serviceId: service.id, detail: null });
      }
      return { entry, person: names.get(entry.personId) ?? null, conflicts: list };
    });
  };

  const rosterResult = (
    church: ChurchRow,
    service: WorshipServiceRow,
    rows: RosterAssignmentRow[],
    skipped: number,
  ) => ({ items: hydrateRoster(db, church, service, rows), skipped });

  return new Elysia({ prefix: '/churches/:churchId/worship' })
    .use(authPlugin(deps))
    .get(
      '/services/:id/roster',
      ({ church, access, params }) => {
        const service = loadService(db, church.id, params.id);
        const scope = scheduler(church, access);
        assertServiceVisible(db, access, scope.ledTeamIds, service);
        return {
          items: rosterForViewer(loadRoster(db, church, service), {
            personId: access.personId,
            schedulableTeamIds: scope.teamIds(),
          }),
        };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
      },
    )
    .post(
      '/services/:id/roster',
      ({ church, access, audit, params, body, set }) => {
        const service = loadService(db, church.id, params.id);
        assertOpen(service);
        const { fresh, skipped } = plannedAssignments(church, access, service, body.assignments);
        if (!body.ignoreConflicts) {
          const issues: ValidationIssue[] = plannedConflicts(church, service, fresh).flatMap(
            ({ entry, person, conflicts }) =>
              conflicts.length === 0
                ? []
                : [
                    {
                      path: `assignments.${body.assignments.findIndex(
                        (item) =>
                          item.positionId === entry.positionId && item.personId === entry.personId,
                      )}`,
                      message: conflictMessage(person ? fullName(person) : 'Volunteer', conflicts),
                    },
                  ],
          );
          if (issues.length > 0) {
            throw new HttpError(
              409,
              'SCHEDULING_CONFLICT',
              'Some volunteers have scheduling conflicts. Review them or assign anyway.',
              issues,
            );
          }
        }
        const rows = db.transaction((tx) =>
          createAssignments(
            tx,
            church,
            service,
            fresh,
            { userId: access.userId, audit },
            'roster.assign',
            `Scheduled ${fresh.length} volunteer${fresh.length === 1 ? '' : 's'} for ${service.title}`,
          ),
        );
        set.status = 201;
        return rosterResult(church, service, rows, skipped);
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
        body: rosterAssignBodySchema,
      },
    )
    .post(
      '/services/:id/roster/check',
      ({ church, access, params, body }) => {
        const service = loadService(db, church.id, params.id);
        const { fresh } = plannedAssignments(church, access, service, body.assignments);
        return {
          items: plannedConflicts(church, service, fresh).flatMap(({ entry, person, conflicts }) =>
            person ? [{ positionId: entry.positionId, person, conflicts }] : [],
          ),
        };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
        body: rosterCheckBodySchema,
      },
    )
    .get(
      '/services/:id/roster/suggestions',
      ({ church, access, params, query }) => {
        const service = loadService(db, church.id, params.id);
        const scope = scheduler(church, access);
        let positions: ServingPositionRow[];
        if (query.positionId) {
          const position = loadPosition(db, church.id, query.positionId);
          if (!scope.canSchedule(position.teamId)) {
            throw forbidden('You cannot schedule volunteers for this team');
          }
          positions = [position];
        } else {
          const teamIds = scope.teamIds();
          if (teamIds.length === 0) throw forbidden('You cannot schedule volunteers');
          positions = db
            .select()
            .from(servingPositions)
            .where(
              and(
                eq(servingPositions.churchId, church.id),
                inArray(servingPositions.teamId, teamIds),
              ),
            )
            .orderBy(asc(servingPositions.sortOrder))
            .all();
        }
        return { items: suggestionsFor(church, service, positions) };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
        query: rosterSuggestionQuerySchema,
      },
    )
    .post(
      '/services/:id/roster/auto-fill',
      ({ church, access, audit, params, body }) => {
        const service = loadService(db, church.id, params.id);
        assertOpen(service);
        const scope = scheduler(church, access);
        let teamIds: string[];
        if (body.teamId) {
          if (!scope.canSchedule(body.teamId)) {
            throw forbidden('You cannot schedule volunteers for this team');
          }
          teamIds = [body.teamId];
        } else {
          const allowed = scope.teamIds();
          if (allowed.length === 0) throw forbidden('You cannot schedule volunteers');
          // Teams already on this roster; every team the caller schedules for a blank roster.
          const onRoster = [
            ...new Set(
              db
                .select({ teamId: rosterAssignments.teamId })
                .from(rosterAssignments)
                .where(eq(rosterAssignments.serviceId, service.id))
                .all()
                .map((row) => row.teamId),
            ),
          ].filter((id) => allowed.includes(id));
          teamIds = onRoster.length > 0 ? onRoster : allowed;
        }
        const positions = db
          .select({ position: servingPositions })
          .from(servingPositions)
          .innerJoin(servingTeams, eq(servingTeams.id, servingPositions.teamId))
          .where(
            and(
              eq(servingPositions.churchId, church.id),
              inArray(servingPositions.teamId, teamIds),
              eq(servingTeams.isActive, true),
            ),
          )
          .orderBy(asc(servingTeams.name), asc(servingPositions.sortOrder))
          .all()
          .map((row) => row.position);
        const current = db
          .select({
            positionId: rosterAssignments.positionId,
            personId: rosterAssignments.personId,
            status: rosterAssignments.status,
          })
          .from(rosterAssignments)
          .where(eq(rosterAssignments.serviceId, service.id))
          .all();
        const busy = new Set(
          current.filter((row) => row.status !== 'declined').map((row) => row.personId),
        );
        const suggestions = new Map(
          suggestionsFor(church, service, positions).map((item) => [item.positionId, item]),
        );
        const picks: NewAssignment[] = [];
        let unfilled = 0;
        for (const position of positions) {
          const filled = current.filter(
            (row) => row.positionId === position.id && row.status !== 'declined',
          ).length;
          let open = Math.max(0, position.needed - filled);
          for (const candidate of suggestions.get(position.id)?.candidates ?? []) {
            if (open === 0) break;
            if (candidate.conflicts.length > 0 || busy.has(candidate.id)) continue;
            busy.add(candidate.id);
            picks.push({
              positionId: position.id,
              teamId: position.teamId,
              personId: candidate.id,
              notes: null,
            });
            open -= 1;
          }
          unfilled += open;
        }
        const rows = db.transaction((tx) =>
          createAssignments(
            tx,
            church,
            service,
            picks,
            { userId: access.userId, audit },
            'roster.auto_fill',
            `Filled ${picks.length} open position${picks.length === 1 ? '' : 's'} for ${service.title}`,
          ),
        );
        return rosterResult(church, service, rows, unfilled);
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
        body: autoFillRosterBodySchema,
      },
    )
    .post(
      '/services/:id/roster/copy',
      ({ church, access, audit, params, body }) => {
        const service = loadService(db, church.id, params.id);
        assertOpen(service);
        const scope = scheduler(church, access);
        const teamIds = scope.teamIds();
        if (teamIds.length === 0) throw forbidden('You cannot schedule volunteers');
        let source: WorshipServiceRow;
        if (body.fromServiceId) {
          source = loadService(db, church.id, body.fromServiceId);
          if (source.id === service.id) throw conflict('Choose another service to copy from');
        } else {
          const conditions: SQL[] = [
            eq(worshipServices.churchId, church.id),
            ne(worshipServices.id, service.id),
            lt(worshipServices.startsAt, service.startsAt),
            exists(
              db
                .select({ id: rosterAssignments.id })
                .from(rosterAssignments)
                .where(
                  and(
                    eq(rosterAssignments.serviceId, worshipServices.id),
                    inArray(rosterAssignments.teamId, teamIds),
                  ),
                ),
            ),
          ];
          conditions.push(
            service.serviceTypeId
              ? eq(worshipServices.serviceTypeId, service.serviceTypeId)
              : isNull(worshipServices.serviceTypeId),
          );
          const found = db
            .select()
            .from(worshipServices)
            .where(and(...conditions))
            .orderBy(desc(worshipServices.startsAt))
            .get();
          if (!found) throw notFound('Earlier roster');
          source = found;
        }
        const assignments = db
          .select()
          .from(rosterAssignments)
          .where(
            and(
              eq(rosterAssignments.serviceId, source.id),
              inArray(rosterAssignments.teamId, teamIds),
              // Whoever could not serve then is not asked again by default.
              ne(rosterAssignments.status, 'declined'),
            ),
          )
          .orderBy(asc(rosterAssignments.createdAt))
          .all();
        const taken = existingPairs(service.id);
        const candidates = assignments
          .filter((row) => !taken.has(`${row.positionId}:${row.personId}`))
          .map((row) => ({
            positionId: row.positionId,
            teamId: row.teamId,
            personId: row.personId,
            notes: row.notes,
          }));
        const found = rosterConflicts(db, church, service, candidates);
        // People who are away, left the team or already serve then are left for a manual pick.
        const copy = candidates.filter((entry) => conflictsOf(found, entry).length === 0);
        const rows = db.transaction((tx) =>
          createAssignments(
            tx,
            church,
            service,
            copy,
            { userId: access.userId, audit },
            'roster.copy',
            `Copied ${copy.length} assignment${copy.length === 1 ? '' : 's'} from ${source.title} to ${service.title}`,
          ),
        );
        return rosterResult(church, service, rows, assignments.length - copy.length);
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
        body: copyRosterBodySchema,
      },
    )
    .delete(
      '/roster/:id',
      ({ church, access, audit, params }) => {
        const row = loadAssignment(db, church.id, params.id);
        if (!scheduler(church, access).canSchedule(row.teamId)) {
          throw forbidden('You cannot change the roster of this team');
        }
        const service = loadService(db, church.id, row.serviceId);
        const position = loadPosition(db, church.id, row.positionId);
        const person = loadPerson(db, church.id, row.personId);
        db.transaction((tx) => {
          notifyAssignmentsRemoved(tx, church, eq(rosterAssignments.id, row.id), access.userId);
          tx.delete(rosterAssignments).where(eq(rosterAssignments.id, row.id)).run();
          recordAudit(tx, audit, {
            module: 'worship',
            action: 'roster.remove',
            entityType: 'service',
            entityId: service.id,
            summary: `Removed ${fullName(person)} (${position.name}) from ${service.title}`,
            before: { positionId: row.positionId, personId: row.personId, status: row.status },
          });
        });
        return { ok: true as const };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
      },
    )
    .post(
      '/roster/:id/respond',
      ({ church, access, audit, params, body }) => {
        const row = loadAssignment(db, church.id, params.id);
        const ledTeamIds = ledTeamIdsOf(db, church.id, access.personId);
        if (!canRespondToAssignment(access, ledTeamIds, row)) {
          throw forbidden('Only the scheduled volunteer can answer this assignment');
        }
        const service = loadService(db, church.id, row.serviceId);
        assertOpen(service);
        const position = loadPosition(db, church.id, row.positionId);
        const person = loadPerson(db, church.id, row.personId);
        const now = nowIso();
        const updated = db.transaction((tx) => {
          const next = tx
            .update(rosterAssignments)
            .set({
              status: body.status,
              declineReason: body.status === 'declined' ? body.reason : null,
              respondedAt: now,
              updatedAt: now,
            })
            .where(eq(rosterAssignments.id, row.id))
            .returning()
            .get();
          if (!next) throw notFound('Assignment');
          if (next.status !== row.status) {
            const leaderUserIds = tx
              .select({ userId: people.userId })
              .from(servingTeamMembers)
              .innerJoin(people, eq(people.id, servingTeamMembers.personId))
              .where(
                and(
                  eq(servingTeamMembers.teamId, row.teamId),
                  eq(servingTeamMembers.role, 'leader'),
                ),
              )
              .all()
              .flatMap((item) => (item.userId ? [item.userId] : []));
            const recipients = [
              ...new Set([...(row.assignedBy ? [row.assignedBy] : []), ...leaderUserIds]),
            ];
            if (recipients.length > 0) {
              notify(tx, {
                churchId: church.id,
                userIds: recipients,
                excludeUserIds: [access.userId],
                type: 'roster.response',
                title:
                  body.status === 'accepted'
                    ? `${fullName(person)} will serve as ${position.name}`
                    : `${fullName(person)} cannot serve as ${position.name}`,
                body: `${service.title} · ${serviceWhen(service.startsAt, church.timezone)}${
                  body.status === 'declined' && body.reason ? ` · ${body.reason}` : ''
                }`,
                link: serviceLink(church.id, service.id, 'roster'),
                entityType: 'service',
                entityId: service.id,
              });
            }
          }
          // An answer recorded for someone else is audited (without the reason).
          if (row.personId !== access.personId) {
            recordAudit(tx, audit, {
              module: 'worship',
              action: 'roster.respond',
              entityType: 'service',
              entityId: service.id,
              summary: `Recorded that ${fullName(person)} ${
                body.status === 'accepted' ? 'will serve' : 'cannot serve'
              } as ${position.name} at ${service.title}`,
              ...changes({ status: row.status }, { status: next.status }),
            });
          }
          return next;
        });
        const [assignment] = hydrateRoster(db, church, service, [updated]);
        if (!assignment) throw notFound('Assignment');
        return { assignment };
      },
      {
        church: { module: 'worship', permission: 'services.view' },
        params: churchIdParamsSchema,
        body: rosterRespondBodySchema,
      },
    );
};
