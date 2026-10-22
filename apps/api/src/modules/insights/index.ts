import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';

/** Wiring check: 200 with the caller's insights permissions, or 403 MODULE_DISABLED. */
const insightsStatusRouter = (deps: Deps) =>
  new Elysia({ prefix: '/churches/:churchId/insights' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'insights'), {
      church: 'insights',
      params: churchParamsSchema,
    });

/**
 * Insights: personalised home, attendance upgrades and reports. The base routers live in
 * ../dashboard.ts and ../attendance.ts.
 *
 * Owned by the insights module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. See docs/ARCHITECTURE-MODULES.md.
 */
export const insightsModule = (deps: Deps) => new Elysia().use(insightsStatusRouter(deps));
