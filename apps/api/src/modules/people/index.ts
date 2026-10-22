import { churchParamsSchema, has } from '@tatagereja/shared';
import { and, count, eq, inArray } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { groupJoinRequests, groups } from '../../db/schema';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';
import { coordinatedAreaIdsOf, todayIn } from '../../services/people';
import { peopleStats } from '../../services/people-stats';
import { areasRouter } from './areas';
import { directoryToolsRouter } from './directory-tools';
import { directoryFieldsRouter } from './fields';
import { householdsRouter } from './households';
import { personExtrasRouter } from './person-extras';

/**
 * `status` is the wiring check (200 with the caller's people permissions, or 403
 * MODULE_DISABLED); `me` tells the interface what the caller coordinates and leads; `summary`
 * holds the directory counts.
 */
const peopleStatusRouter = (deps: Deps) => {
  const { db } = deps;
  return new Elysia({ prefix: '/churches/:churchId/directory' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'people'), {
      church: 'people',
      params: churchParamsSchema,
    })
    .get(
      '/me',
      ({ church, access }) => {
        const decidable = has(access, 'groups.manage')
          ? db
              .select({ id: groups.id })
              .from(groups)
              .where(eq(groups.churchId, church.id))
              .all()
              .map((row) => row.id)
          : access.leaderGroupIds;
        const pendingJoinRequests =
          decidable.length > 0
            ? (db
                .select({ value: count() })
                .from(groupJoinRequests)
                .where(
                  and(
                    eq(groupJoinRequests.churchId, church.id),
                    eq(groupJoinRequests.status, 'pending'),
                    inArray(groupJoinRequests.groupId, [...decidable]),
                  ),
                )
                .get()?.value ?? 0)
            : 0;
        return {
          personId: access.personId,
          coordinatedAreaIds: coordinatedAreaIdsOf(db, church.id, access.userId),
          leaderGroupIds: [...access.leaderGroupIds],
          pendingJoinRequests,
        };
      },
      { church: 'people', params: churchParamsSchema },
    )
    .get('/summary', ({ church, access }) => peopleStats(db, access, church.id, todayIn(church)), {
      church: { module: 'people', permission: 'people.view' },
      params: churchParamsSchema,
    });
};

/**
 * People extensions: households, areas, tags and custom fields, import/export, merge. The
 * directory and groups routers live in ../people.ts and ../groups.ts.
 *
 * Owned by the people module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. See docs/ARCHITECTURE-MODULES.md.
 */
export const peopleExtensionsModule = (deps: Deps) =>
  new Elysia()
    .use(peopleStatusRouter(deps))
    .use(directoryFieldsRouter(deps))
    .use(directoryToolsRouter(deps))
    .use(personExtrasRouter(deps))
    .use(householdsRouter(deps))
    .use(areasRouter(deps));
