import type { User } from '@tatagereja/shared';
import type { Queryable } from '../db/client';
import type { ChurchContext } from '../plugins/auth';

/**
 * Church security policy hook, called by the `church` macro for every church request after
 * the membership and access are loaded. Owned by the admin-security module, which implements
 * the policy (e.g. throw 403 TWO_FACTOR_SETUP_REQUIRED when the church requires 2FA for
 * members holding management permissions and the caller has not enabled it). It must stay
 * cheap: it runs on every church request.
 */
export function enforceChurchSecurityPolicy(
  _db: Queryable,
  _context: ChurchContext & { user: User },
): void {}
