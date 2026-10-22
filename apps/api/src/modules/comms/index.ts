import { Elysia } from 'elysia';
import type { Deps } from '../../deps';

/**
 * Communication extensions: announcement and event upgrades, calendar, Warta Jemaat. The base
 * routers live in ../announcements.ts, ../events.ts and ../notifications.ts.
 *
 * Owned by the comms module: register this module's routers here with `.use(...)`, so app.ts never
 * needs to change. See docs/ARCHITECTURE-MODULES.md.
 */
export const commsModule = (_deps: Deps) => new Elysia();
