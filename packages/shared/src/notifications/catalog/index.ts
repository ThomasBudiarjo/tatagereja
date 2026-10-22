import { MODULES, type ModuleId } from '../../modules';
import type { LocalizedText } from '../../localized';
import type { NotificationTypeDefinition } from '../types';
import { ADMIN_SECURITY_NOTIFICATION_TYPES } from './admin-security';
import { CARE_NOTIFICATION_TYPES } from './care';
import { CHECKIN_NOTIFICATION_TYPES } from './checkin';
import { COMMS_NOTIFICATION_TYPES } from './comms';
import { CORE_NOTIFICATION_TYPES } from './core';
import { FACILITIES_NOTIFICATION_TYPES } from './facilities';
import { FINANCE_NOTIFICATION_TYPES } from './finance';
import { INSIGHTS_NOTIFICATION_TYPES } from './insights';
import { PEOPLE_NOTIFICATION_TYPES } from './people';
import { RECORDS_NOTIFICATION_TYPES } from './records';
import { WORSHIP_NOTIFICATION_TYPES } from './worship';

const ALL = [
  ...CORE_NOTIFICATION_TYPES,
  ...ADMIN_SECURITY_NOTIFICATION_TYPES,
  ...PEOPLE_NOTIFICATION_TYPES,
  ...COMMS_NOTIFICATION_TYPES,
  ...INSIGHTS_NOTIFICATION_TYPES,
  ...WORSHIP_NOTIFICATION_TYPES,
  ...CARE_NOTIFICATION_TYPES,
  ...RECORDS_NOTIFICATION_TYPES,
  ...FINANCE_NOTIFICATION_TYPES,
  ...FACILITIES_NOTIFICATION_TYPES,
  ...CHECKIN_NOTIFICATION_TYPES,
];

/** Union of every notification type in the catalog. */
export type NotificationType = (typeof ALL)[number]['type'];

/** Every notification type of every module. Add a module's types in `catalog/<module>.ts`. */
export const NOTIFICATION_TYPE_DEFINITIONS: readonly NotificationTypeDefinition<NotificationType>[] =
  ALL;

export const NOTIFICATION_TYPES: readonly NotificationType[] = NOTIFICATION_TYPE_DEFINITIONS.map(
  (definition) => definition.type,
);

const BY_TYPE = new Map<string, NotificationTypeDefinition<NotificationType>>(
  NOTIFICATION_TYPE_DEFINITIONS.map((definition) => [definition.type, definition]),
);

export const isNotificationType = (value: unknown): value is NotificationType =>
  typeof value === 'string' && BY_TYPE.has(value);

export const notificationTypeDefinition = (
  type: NotificationType,
): NotificationTypeDefinition<NotificationType> => {
  const found = BY_TYPE.get(type);
  if (!found) throw new Error(`Unknown notification type ${type}`);
  return found;
};

export type NotificationTypeGroup = {
  module: ModuleId;
  label: LocalizedText;
  types: readonly NotificationTypeDefinition<NotificationType>[];
};

/** Notification types grouped by module, for the preferences screen. */
export const NOTIFICATION_TYPE_GROUPS: readonly NotificationTypeGroup[] = MODULES.map((module) => ({
  module: module.id,
  label: module.label,
  types: NOTIFICATION_TYPE_DEFINITIONS.filter((definition) => definition.module === module.id),
})).filter((group) => group.types.length > 0);
