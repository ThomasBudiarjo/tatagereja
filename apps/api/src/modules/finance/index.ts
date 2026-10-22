import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';
import { budgetsRouter } from './budgets';
import { contributionsRouter } from './contributions';
import { expensesRouter } from './expenses';
import { ledgerRouter } from './ledger';
import { offeringsRouter } from './offerings';
import { periodsRouter } from './periods';
import { reportsRouter } from './reports';
import { setupRouter } from './setup';

/** Wiring check: 200 with the caller's finance permissions, or 403 MODULE_DISABLED. */
const financeStatusRouter = (deps: Deps) =>
  new Elysia({ prefix: '/churches/:churchId/finance' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'finance'), {
      church: 'finance',
      params: churchParamsSchema,
    });

/**
 * Finance (keuangan): funds, accounts, offerings, contributions, expenses, budgets and reports.
 *
 * Owned by the finance module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'finance'` (or
 * `church: { module: 'finance', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const financeModule = (deps: Deps) =>
  new Elysia()
    .use(financeStatusRouter(deps))
    .use(setupRouter(deps))
    .use(ledgerRouter(deps))
    .use(offeringsRouter(deps))
    .use(contributionsRouter(deps))
    .use(expensesRouter(deps))
    .use(budgetsRouter(deps))
    .use(periodsRouter(deps))
    .use(reportsRouter(deps));
