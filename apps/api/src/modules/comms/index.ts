import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';

/** Wiring check: 200 with the caller's comms permissions, or 403 MODULE_DISABLED. */
const commsStatusRouter = (deps: Deps) =>
  new Elysia({ prefix: '/churches/:churchId/calendar' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'comms'), {
      church: 'comms',
      params: churchParamsSchema,
    });

/**
 * Communication extensions: announcement and event upgrades, calendar, Warta Jemaat. The base
 * routers live in ../announcements.ts, ../events.ts and ../notifications.ts.
 *
 * Owned by the comms module: register this module's routers here with `.use(...)`, so app.ts never
 * needs to change. See docs/ARCHITECTURE-MODULES.md.
 */
export const commsModule = (deps: Deps) => new Elysia().use(commsStatusRouter(deps));
