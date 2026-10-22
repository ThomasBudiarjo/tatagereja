import {
  MODULES,
  isModuleEnabled,
  isModuleId,
  moduleDefinition,
  permissionDefinition,
  type AccessLike,
  type ChurchModuleState,
  type ModuleId,
  type ModuleStatus,
} from '@tatagereja/shared';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Queryable } from '../db/client';
import type { ChurchRow } from '../db/schema';
import { churches } from '../db/schema';
import { HttpError } from '../lib/errors';
import { nowIso } from '../lib/time';

/** Optional modules switched on for the church; unknown stored ids are ignored. */
export const enabledModulesOf = (church: Pick<ChurchRow, 'enabledModules'>): ModuleId[] =>
  Array.isArray(church.enabledModules) ? church.enabledModules.filter(isModuleId) : [];

export const moduleEnabled = (church: Pick<ChurchRow, 'enabledModules'>, id: ModuleId): boolean =>
  isModuleEnabled(enabledModulesOf(church), id);

export const moduleDisabled = (id: ModuleId) =>
  new HttpError(
    403,
    'MODULE_DISABLED',
    `The ${moduleDefinition(id).label.en} module is turned off for this church`,
  );

/**
 * Throws 403 MODULE_DISABLED when the church switched the module off. Routes normally declare
 * their module through the `church` macro instead: `{ church: 'finance' }`.
 */
export function assertModuleEnabled(church: Pick<ChurchRow, 'enabledModules'>, id: ModuleId): void {
  if (!moduleEnabled(church, id)) throw moduleDisabled(id);
}

export const moduleStates = (church: Pick<ChurchRow, 'enabledModules'>): ChurchModuleState[] => {
  const enabled = enabledModulesOf(church);
  return MODULES.map((module) => ({
    id: module.id,
    optional: module.optional,
    enabled: isModuleEnabled(enabled, module.id),
  }));
};

/** Body of a module's `GET .../status` route: the module's permissions the caller holds. */
export const moduleStatus = (
  access: Pick<AccessLike, 'permissions'>,
  id: ModuleId,
): ModuleStatus => ({
  module: id,
  enabled: true,
  permissions: access.permissions.filter(
    (permission) => permissionDefinition(permission).module === id,
  ),
});

/**
 * Reads one module's settings from `churches.settings[moduleId]`, applying the module's
 * schema defaults. Invalid stored values fall back to the defaults instead of failing.
 */
export function moduleSettings<T>(
  church: Pick<ChurchRow, 'settings'>,
  moduleId: ModuleId,
  schema: z.ZodType<T>,
): T {
  const stored = church.settings && typeof church.settings === 'object' ? church.settings : {};
  const parsed = schema.safeParse(stored[moduleId] ?? {});
  return parsed.success ? parsed.data : schema.parse({});
}

/** Replaces one module's settings, leaving the other modules' settings untouched. */
export function saveModuleSettings(
  db: Queryable,
  churchId: string,
  moduleId: ModuleId,
  value: unknown,
): void {
  const row = db
    .select({ settings: churches.settings })
    .from(churches)
    .where(eq(churches.id, churchId))
    .get();
  const current = row?.settings && typeof row.settings === 'object' ? row.settings : {};
  db.update(churches)
    .set({ settings: { ...current, [moduleId]: value }, updatedAt: nowIso() })
    .where(eq(churches.id, churchId))
    .run();
}
