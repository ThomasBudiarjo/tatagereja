import { z } from 'zod';
import { MODULE_IDS, OPTIONAL_MODULE_IDS, type ModuleId } from '../modules';
import { permissionListSchema } from './church';

export const churchModuleStateSchema = z.object({
  id: z.enum(MODULE_IDS),
  optional: z.boolean(),
  enabled: z.boolean(),
});
export type ChurchModuleState = z.infer<typeof churchModuleStateSchema>;

export const churchModulesSchema = z.object({ items: z.array(churchModuleStateSchema) });
export type ChurchModules = z.infer<typeof churchModulesSchema>;

const optionalModuleIdSchema = z.enum(OPTIONAL_MODULE_IDS as [ModuleId, ...ModuleId[]]);

/** Switches optional modules on or off; modules left out keep their state. */
export const updateChurchModulesBodySchema = z.object({
  modules: z
    .partialRecord(optionalModuleIdSchema, z.boolean())
    .refine((value) => Object.keys(value).length > 0, 'Choose at least one module'),
});
export type UpdateChurchModulesBody = z.infer<typeof updateChurchModulesBodySchema>;

/**
 * `GET /api/churches/:churchId/<module path>/status`: answers 200 when the module is enabled for
 * the church and lists the module permissions the caller holds (403 MODULE_DISABLED otherwise).
 */
export const moduleStatusSchema = z.object({
  module: z.enum(MODULE_IDS),
  enabled: z.literal(true),
  permissions: permissionListSchema,
});
export type ModuleStatus = z.infer<typeof moduleStatusSchema>;
