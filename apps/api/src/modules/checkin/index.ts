import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';

/** Wiring check: 200 with the caller's checkin permissions, or 403 MODULE_DISABLED. */
const checkinStatusRouter = (deps: Deps) =>
  new Elysia({ prefix: '/churches/:churchId/checkin' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'checkin'), {
      church: 'checkin',
      params: churchParamsSchema,
    });

/**
 * Kids check-in for Sekolah Minggu.
 *
 * Owned by the checkin module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'checkin'` (or
 * `church: { module: 'checkin', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const checkinModule = (deps: Deps) => new Elysia().use(checkinStatusRouter(deps));
