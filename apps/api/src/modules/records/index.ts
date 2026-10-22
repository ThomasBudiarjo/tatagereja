import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';

/** Wiring check: 200 with the caller's records permissions, or 403 MODULE_DISABLED. */
const recordsStatusRouter = (deps: Deps) =>
  new Elysia({ prefix: '/churches/:churchId/records' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'records'), {
      church: 'records',
      params: churchParamsSchema,
    });

/**
 * Church registry (catatan gerejawi): baptis, sidi, pemberkatan nikah, penyerahan anak, atestasi,
 * kedukaan.
 *
 * Owned by the records module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'records'` (or
 * `church: { module: 'records', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const recordsModule = (deps: Deps) => new Elysia().use(recordsStatusRouter(deps));
