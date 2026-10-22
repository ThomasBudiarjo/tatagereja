import { Elysia } from 'elysia';
import type { Deps } from '../../deps';

/**
 * Kids check-in for Sekolah Minggu.
 *
 * Owned by the checkin module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'checkin'` (or
 * `church: { module: 'checkin', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const checkinModule = (_deps: Deps) => new Elysia();
