import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';
import { bulletinsRouter } from './bulletins';
import { calendarFeedRouter, calendarRouter } from './calendar';

/** Wiring check: 200 with the caller's comms permissions, or 403 MODULE_DISABLED. */
const commsStatusRouter = (deps: Deps) =>
  new Elysia({ prefix: '/churches/:churchId/calendar' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'comms'), {
      church: 'comms',
      params: churchParamsSchema,
    });

/**
 * Communication extensions: the unified calendar and its private iCal feeds, and Warta Jemaat.
 * The announcement, event and notification routers live in ../announcements.ts, ../events.ts
 * and ../notifications.ts.
 *
 * Owned by the comms module: register this module's routers here with `.use(...)`, so app.ts never
 * needs to change. See docs/ARCHITECTURE-MODULES.md.
 */
export const commsModule = (deps: Deps) =>
  new Elysia()
    .use(commsStatusRouter(deps))
    .use(calendarRouter(deps))
    .use(calendarFeedRouter(deps))
    .use(bulletinsRouter(deps));
