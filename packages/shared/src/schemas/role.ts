import { z } from 'zod';
import { CHURCH_ROLES, LIMITS } from '../constants';
import { GRANTABLE_PERMISSIONS, ROLE_TEMPLATE_KEYS, type Permission } from '../permissions';
import { idSchema, isoDateTimeSchema, optionalText, requiredText } from './common';
import { permissionListSchema } from './church';

/** A church-defined role. Its permissions are added to the member's base role permissions. */
export const customRoleSchema = z.object({
  id: idSchema,
  churchId: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  permissions: permissionListSchema,
  /** Seeded from a suggested template; still an ordinary, editable role. */
  isTemplate: z.boolean(),
  templateKey: z.enum(ROLE_TEMPLATE_KEYS).nullable(),
  /** Number of members the role is assigned to. */
  memberCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type CustomRole = z.infer<typeof customRoleSchema>;

export const customRoleSummarySchema = customRoleSchema.pick({ id: true, name: true });
export type CustomRoleSummary = z.infer<typeof customRoleSummarySchema>;

const grantablePermissionSchema = z.enum(GRANTABLE_PERMISSIONS as [Permission, ...Permission[]]);

export const customRoleInputSchema = z.object({
  name: requiredText(LIMITS.nameMin, LIMITS.roleNameMax),
  description: optionalText(LIMITS.roleDescriptionMax),
  permissions: z
    .array(grantablePermissionSchema)
    .max(GRANTABLE_PERMISSIONS.length)
    .transform((values) => [...new Set(values)]),
});
export type CustomRoleInput = z.infer<typeof customRoleInputSchema>;

export const customRoleListSchema = z.object({
  /** Built-in base roles with their fixed permissions, for comparison in the UI. */
  baseRoles: z.array(z.object({ role: z.enum(CHURCH_ROLES), permissions: permissionListSchema })),
  items: z.array(customRoleSchema),
});
export type CustomRoleList = z.infer<typeof customRoleListSchema>;

export const customRoleResponseSchema = z.object({ role: customRoleSchema });

export const assignRoleBodySchema = z.object({ roleId: idSchema });
export type AssignRoleBody = z.infer<typeof assignRoleBodySchema>;

export const setMemberRolesBodySchema = z.object({
  roleIds: z
    .array(idSchema)
    .max(LIMITS.rolesPerMemberMax)
    .transform((values) => [...new Set(values)]),
});
export type SetMemberRolesBody = z.infer<typeof setMemberRolesBodySchema>;

/** A member's effective permissions and where they come from. */
export const memberPermissionsSchema = z.object({
  membershipId: idSchema,
  role: z.enum(CHURCH_ROLES),
  roles: z.array(customRoleSummarySchema),
  permissions: permissionListSchema,
  basePermissions: permissionListSchema,
  isLeader: z.boolean(),
});
export type MemberPermissions = z.infer<typeof memberPermissionsSchema>;
