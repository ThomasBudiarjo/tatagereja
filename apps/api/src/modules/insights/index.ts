import { Elysia } from 'elysia';
import type { Deps } from '../../deps';

/**
 * Insights: personalised home, attendance upgrades and reports. The base routers live in
 * ../dashboard.ts and ../attendance.ts.
 *
 * Owned by the insights module: register this module's routers here with `.use(...)`, so app.ts
 * never needs to change. See docs/ARCHITECTURE-MODULES.md.
 */
export const insightsModule = (_deps: Deps) => new Elysia();
