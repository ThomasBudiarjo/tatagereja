import { churchParamsSchema } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../../deps';
import { authPlugin } from '../../plugins/auth';
import { moduleStatus } from '../../services/modules';
import { accountSecurityRouter } from './account';
import { passwordResetRouter } from './password-reset';
import { churchSecurityRouter } from './security';

/** Wiring check: 200 with the caller's admin-security permissions, or 403 MODULE_DISABLED. */
const adminSecurityStatusRouter = (deps: Deps) =>
  new Elysia({ prefix: '/churches/:churchId/security' })
    .use(authPlugin(deps))
    .get('/status', ({ access }) => moduleStatus(access, 'admin-security'), {
      church: 'admin-security',
      params: churchParamsSchema,
    });

/**
 * Administration and account security (2FA, login history, security policy, data export).
 *
 * Owned by the admin-security module: register this module's routers here with `.use(...)`, so
 * app.ts never needs to change. See docs/ARCHITECTURE-MODULES.md. The sign-in flow itself
 * (lockout, the second step) lives in modules/auth.ts; members, roles and the audit log in
 * modules/churches.ts, modules/roles.ts and modules/audit.ts.
 */
export const adminSecurityModule = (deps: Deps) =>
  new Elysia()
    .use(adminSecurityStatusRouter(deps))
    .use(churchSecurityRouter(deps))
    .use(accountSecurityRouter(deps))
    .use(passwordResetRouter(deps));
