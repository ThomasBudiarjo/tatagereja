import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';

/** Wiring check: 200 with the caller's worship permissions, or 403 MODULE_DISABLED. */
const worshipStatusRouter = (deps: Deps) =>
  new Elysia({ prefix: '/churches/:churchId/worship' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'worship'), {
      church: 'worship',
      params: churchParamsSchema,
    });

/**
 * Worship services, liturgy, songs, serving teams and rosters (ibadah & jadwal pelayanan).
 *
 * Owned by the worship module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'worship'` (or
 * `church: { module: 'worship', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const worshipModule = (deps: Deps) => new Elysia().use(worshipStatusRouter(deps));
