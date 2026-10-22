import { Elysia } from 'elysia';
import type { Deps } from '../../deps';

/**
 * Church registry (catatan gerejawi): baptis, sidi, pemberkatan nikah, penyerahan anak, atestasi,
 * kedukaan.
 *
 * Owned by the records module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'records'` (or
 * `church: { module: 'records', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const recordsModule = (_deps: Deps) => new Elysia();
