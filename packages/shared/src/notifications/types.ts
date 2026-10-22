import type { LocalizedText } from '../localized';
import type { ModuleId } from '../modules';

/** One entry in a module's notification catalog, as written in `catalog/<module>.ts`. */
export type NotificationTypeInput = {
  /** `<area>.<event>`, lower case, e.g. `roster.assigned`. Never rename a type once shipped. */
  readonly type: string;
  /** Shown on the notification preferences screen. */
  readonly label: LocalizedText;
  readonly description: LocalizedText;
  /** Whether people receive it before they change their preferences. Defaults to true. */
  readonly defaultInApp?: boolean;
  /** Always delivered, regardless of preferences (security notices). */
  readonly mandatory?: boolean;
};

export type NotificationTypeDefinition<T extends string = string> = NotificationTypeInput & {
  readonly type: T;
  readonly module: ModuleId;
};

export const defineNotificationTypes = <const T extends readonly NotificationTypeInput[]>(
  module: ModuleId,
  definitions: T,
): readonly (T[number] & { readonly module: ModuleId })[] =>
  definitions.map((definition) => ({ ...definition, module }));
