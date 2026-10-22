import type { LocalizedText } from '../../localized';
import { MODULES, type ModuleId } from '../../modules';
import type { PermissionDefinition } from '../types';
import { ADMIN_SECURITY_PERMISSIONS } from './admin-security';
import { CARE_PERMISSIONS } from './care';
import { CHECKIN_PERMISSIONS } from './checkin';
import { COMMS_PERMISSIONS } from './comms';
import { CORE_PERMISSIONS } from './core';
import { FACILITIES_PERMISSIONS } from './facilities';
import { FINANCE_PERMISSIONS } from './finance';
import { INSIGHTS_PERMISSIONS } from './insights';
import { PEOPLE_PERMISSIONS } from './people';
import { RECORDS_PERMISSIONS } from './records';
import { WORSHIP_PERMISSIONS } from './worship';

const ALL = [
  ...CORE_PERMISSIONS,
  ...ADMIN_SECURITY_PERMISSIONS,
  ...PEOPLE_PERMISSIONS,
  ...COMMS_PERMISSIONS,
  ...INSIGHTS_PERMISSIONS,
  ...WORSHIP_PERMISSIONS,
  ...CARE_PERMISSIONS,
  ...RECORDS_PERMISSIONS,
  ...FINANCE_PERMISSIONS,
  ...FACILITIES_PERMISSIONS,
  ...CHECKIN_PERMISSIONS,
];

/** Union of every permission key in the catalog. */
export type Permission = (typeof ALL)[number]['key'];

/** Every permission of every module. Add a module's keys in its own `catalog/<module>.ts`. */
export const PERMISSION_DEFINITIONS: readonly PermissionDefinition<Permission>[] = ALL;

export const PERMISSIONS: readonly Permission[] = PERMISSION_DEFINITIONS.map(
  (definition) => definition.key,
);

const BY_KEY = new Map<string, PermissionDefinition<Permission>>(
  PERMISSION_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && BY_KEY.has(value);

export const permissionDefinition = (key: Permission): PermissionDefinition<Permission> => {
  const found = BY_KEY.get(key);
  if (!found) throw new Error(`Unknown permission ${key}`);
  return found;
};

/** Keeps known permissions only, de-duplicated and in catalog order. */
export const normalizePermissions = (values: Iterable<unknown>): Permission[] => {
  const wanted = new Set<unknown>(values);
  return PERMISSIONS.filter((key) => wanted.has(key));
};

export type PermissionGroup = {
  module: ModuleId;
  label: LocalizedText;
  description: LocalizedText;
  permissions: readonly PermissionDefinition<Permission>[];
};

/** Permissions grouped by module, in module order, for permission matrices in the UI. */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = MODULES.map((module) => ({
  module: module.id,
  label: module.label,
  description: module.description,
  permissions: PERMISSION_DEFINITIONS.filter((definition) => definition.module === module.id),
})).filter((group) => group.permissions.length > 0);
