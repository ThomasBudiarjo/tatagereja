import { Elysia } from 'elysia';
import type { Deps } from '../../deps';

/**
 * Worship services, liturgy, songs, serving teams and rosters (ibadah & jadwal pelayanan).
 *
 * Owned by the worship module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'worship'` (or
 * `church: { module: 'worship', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const worshipModule = (_deps: Deps) => new Elysia();
