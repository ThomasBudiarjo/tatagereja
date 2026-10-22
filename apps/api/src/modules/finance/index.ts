import { Elysia } from 'elysia';
import type { Deps } from '../../deps';

/**
 * Finance (keuangan): funds, accounts, offerings, contributions, expenses, budgets and reports.
 *
 * Owned by the finance module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'finance'` (or
 * `church: { module: 'finance', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const financeModule = (_deps: Deps) => new Elysia();
