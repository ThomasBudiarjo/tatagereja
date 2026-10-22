import type { LocalizedText } from '../localized';
import type { ModuleId } from '../modules';

/**
 * Suggested custom roles seeded into every church. They are ordinary, editable custom roles;
 * a permission lists the templates that include it in its `templates` field.
 */
export const ROLE_TEMPLATE_KEYS = [
  'pastor',
  'elder',
  'treasurer',
  'secretary',
  'ministry_coordinator',
  'kids_teacher',
] as const;
export type RoleTemplateKey = (typeof ROLE_TEMPLATE_KEYS)[number];

/** One entry in a module's permission catalog, as written in `catalog/<module>.ts`. */
export type PermissionInput = {
  /** `<area>.<action>`, lower case, e.g. `finance.approve`. Never rename a key once shipped. */
  readonly key: string;
  readonly label: LocalizedText;
  readonly description: LocalizedText;
  /** Grants access to personal, financial or security data. The UI asks for extra care. */
  readonly sensitive?: boolean;
  /** Only the owner ever holds it; it can never be put into a custom role. */
  readonly ownerOnly?: boolean;
  /** Left out of the administrator base role; it must be granted explicitly through a custom role. */
  readonly adminExcluded?: boolean;
  /** Part of the member base role, so every active member holds it. */
  readonly memberDefault?: boolean;
  /** Suggested role templates that include this permission. */
  readonly templates?: readonly RoleTemplateKey[];
};

export type PermissionDefinition<K extends string = string> = PermissionInput & {
  readonly key: K;
  readonly module: ModuleId;
};

/**
 * Declares a module's permissions. The `const` type parameter keeps every key as a string
 * literal so the combined `Permission` union stays exact.
 */
export const definePermissions = <const T extends readonly PermissionInput[]>(
  module: ModuleId,
  definitions: T,
): readonly (T[number] & { readonly module: ModuleId })[] =>
  definitions.map((definition) => ({ ...definition, module }));
