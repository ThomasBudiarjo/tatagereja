import { Elysia } from 'elysia';
import type { Deps } from '../../deps';

/**
 * Facilities (sarana), bookings and inventory (inventaris).
 *
 * Owned by the facilities module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. This module is optional: guard every route with `church: 'facilities'`
 * (or `church: { module: 'facilities', permission }`) so a church that turned it off gets 403
 * MODULE_DISABLED. See docs/ARCHITECTURE-MODULES.md.
 */
export const facilitiesModule = (_deps: Deps) => new Elysia();
