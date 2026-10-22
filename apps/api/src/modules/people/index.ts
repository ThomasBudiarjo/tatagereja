import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';

/** Wiring check: 200 with the caller's people permissions, or 403 MODULE_DISABLED. */
const peopleStatusRouter = (deps: Deps) =>
  new Elysia({ prefix: '/churches/:churchId/directory' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'people'), {
      church: 'people',
      params: churchParamsSchema,
    });

/**
 * People extensions: households, areas, tags and custom fields, import/export, merge. The existing
 * directory and groups routers live in ../people.ts and ../groups.ts.
 *
 * Owned by the people module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. See docs/ARCHITECTURE-MODULES.md.
 */
export const peopleExtensionsModule = (deps: Deps) => new Elysia().use(peopleStatusRouter(deps));
