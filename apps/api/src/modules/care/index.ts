import { Elysia } from 'elysia';
import type { Deps } from '../../deps';

/**
 * Pastoral care, perkunjungan, prayer requests, visitor follow-up and diakonia.
 *
 * Owned by the care module: register this module's routers here with `.use(...)`, so app.ts never
 * needs to change. This module is optional: guard every route with `church: 'care'` (or `church: {
 * module: 'care', permission }`) so a church that turned it off gets 403 MODULE_DISABLED. See
 * docs/ARCHITECTURE-MODULES.md.
 */
export const careModule = (_deps: Deps) => new Elysia();
