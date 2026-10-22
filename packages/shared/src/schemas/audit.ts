import { z } from 'zod';
import { LIMITS } from '../constants';
import { MODULE_IDS } from '../modules';
import { idSchema, isoDateTimeSchema, paginatedSchema } from './common';

export const auditLogSchema = z.object({
  id: idSchema,
  churchId: idSchema.nullable(),
  actorUserId: idSchema.nullable(),
  actorName: z.string().nullable(),
  module: z.string(),
  /** `<entity>.<verb>`, e.g. `person.delete`, `role.update`. */
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  summary: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const auditLogQuerySchema = z.object({
  actorUserId: idSchema.optional(),
  module: z.enum(MODULE_IDS).optional(),
  action: z.string().trim().max(LIMITS.shortTextMax).optional(),
  entityType: z.string().trim().max(LIMITS.shortTextMax).optional(),
  entityId: z.string().trim().max(LIMITS.shortTextMax).optional(),
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMITS.auditPageSizeMax).default(50),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogListSchema = paginatedSchema(auditLogSchema);
export type AuditLogList = z.infer<typeof auditLogListSchema>;
