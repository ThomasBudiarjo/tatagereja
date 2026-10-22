import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';

/** Wiring check: 200 with the caller's care permissions, or 403 MODULE_DISABLED. */
const careStatusRouter = (deps: Deps) =>
  new Elysia({ prefix: '/churches/:churchId/care' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'care'), {
      church: 'care',
      params: churchParamsSchema,
    });

/**
 * Pastoral care, perkunjungan, prayer requests, visitor follow-up and diakonia.
 *
 * Owned by the care module: register this module's routers here with `.use(...)`, so app.ts never
 * needs to change. This module is optional: guard every route with `church: 'care'` (or `church: {
 * module: 'care', permission }`) so a church that turned it off gets 403 MODULE_DISABLED. See
 * docs/ARCHITECTURE-MODULES.md.
 */
export const careModule = (deps: Deps) => new Elysia().use(careStatusRouter(deps));
