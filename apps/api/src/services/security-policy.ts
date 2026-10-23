import { churchSecurityPolicySchema, twoFactorRequiredFor, type User } from '@tatagereja/shared';
import type { Queryable } from '../db/client';
import { HttpError } from '../lib/errors';
import { enabledTwoFactor } from '../modules/admin-security/two-factor';
import type { ChurchContext } from '../plugins/auth';
import { moduleSettings } from './modules';

/**
 * Church security policy hook, called by the `church` macro for every church request after
 * the membership and access are loaded. When the church requires two-step verification for
 * members holding management permissions and the caller holds one without having turned it
 * on, every church route answers 403 TWO_FACTOR_SETUP_REQUIRED; account routes stay open so
 * they can set it up. Cheap by design: no query unless the policy applies to the caller.
 */
export function enforceChurchSecurityPolicy(
  db: Queryable,
  context: ChurchContext & { user: User },
): void {
  const policy = moduleSettings(context.church, 'admin-security', churchSecurityPolicySchema);
  if (!twoFactorRequiredFor(policy, context.access)) return;
  if (enabledTwoFactor(db, context.user.id)) return;
  throw new HttpError(
    403,
    'TWO_FACTOR_SETUP_REQUIRED',
    `${context.church.name} requires two-step verification for your role. Turn it on in your account security settings to continue.`,
  );
}
