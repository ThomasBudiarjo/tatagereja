import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';

/** Wiring check: 200 with the caller's facilities permissions, or 403 MODULE_DISABLED. */
const facilitiesStatusRouter = (deps: Deps) =>
  new Elysia({ prefix: '/churches/:churchId/facilities' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'facilities'), {
      church: 'facilities',
      params: churchParamsSchema,
    });

/**
 * Facilities (sarana), bookings and inventory (inventaris).
 *
 * Owned by the facilities module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'facilities'`
 * (or `church: { module: 'facilities', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const facilitiesModule = (deps: Deps) => new Elysia().use(facilitiesStatusRouter(deps));
