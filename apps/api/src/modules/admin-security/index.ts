import { Elysia } from 'elysia';
import type { Deps } from '../../deps';

/**
 * Administration and account security (2FA, login history, security policy, data export).
 *
 * Owned by the admin-security module: register this module's routers here with `.use(...)`, so
 * app.ts never needs to change. See docs/ARCHITECTURE-MODULES.md.
 */
export const adminSecurityModule = (_deps: Deps) => new Elysia();
