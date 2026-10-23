import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';
import { careCasesRouter } from './cases';
import { diakoniaRouter } from './diakonia';
import { followUpsRouter } from './follow-ups';
import { careOverviewRouter } from './overview';
import { prayerRouter } from './prayer';
import { careTasksRouter } from './tasks';
import { careVisitsRouter } from './visits';

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
export const careModule = (deps: Deps) =>
  new Elysia()
    .use(careStatusRouter(deps))
    .use(careOverviewRouter(deps))
    .use(careCasesRouter(deps))
    .use(careVisitsRouter(deps))
    .use(prayerRouter(deps))
    .use(followUpsRouter(deps))
    .use(careTasksRouter(deps))
    .use(diakoniaRouter(deps));
