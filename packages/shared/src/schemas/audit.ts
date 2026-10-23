import { z } from 'zod';
import { LIMITS } from '../constants';
import { MODULE_IDS } from '../modules';
import { hasAny, type AccessLike } from '../permissions';
import {
  cursorQuerySchema,
  idSchema,
  isoDateTimeSchema,
  keysetPageSchema,
  paginatedSchema,
} from './common';

/** Why an entry's content is hidden from the viewer (see `auditRedactionFor`). */
export const AUDIT_REDACTIONS = ['finance', 'care'] as const;
export type AuditRedaction = (typeof AUDIT_REDACTIONS)[number];

/** Values an entry's headline is built from in the viewer's language (names, counts). */
export const auditParamsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export type AuditParams = z.infer<typeof auditParamsSchema>;

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
  /** The English sentence recorded with the change. */
  summary: z.string(),
  /** The values `action` is described with in another language (`name`, `member`, ...). */
  params: auditParamsSchema,
  /** Set when the viewer may not read the entry's content: summary, params and values are hidden. */
  redacted: z.enum(AUDIT_REDACTIONS).nullable(),
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
  ...cursorQuerySchema.shape,
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogListSchema = paginatedSchema(auditLogSchema).extend(keysetPageSchema.shape);
export type AuditLogList = z.infer<typeof auditLogListSchema>;

/**
 * `audit.view` shows who did what and when. The content of finance entries (amounts, donors)
 * also needs `finance.view` (or `finance.manage`), and of pastoral care entries the care team
 * (`care.view`, `care.manage` or `care.confidential`); without it the entry is redacted.
 */
export const auditRedactionFor = (
  access: Pick<AccessLike, 'permissions'>,
  module: string,
): AuditRedaction | null => {
  if (module === 'finance' && !hasAny(access, ['finance.view', 'finance.manage'])) return 'finance';
  if (module === 'care' && !hasAny(access, ['care.view', 'care.manage', 'care.confidential'])) {
    return 'care';
  }
  return null;
};

/** Modules whose entries the viewer sees redacted, so searches skip their hidden text. */
export const auditRedactedModules = (access: Pick<AccessLike, 'permissions'>): AuditRedaction[] =>
  AUDIT_REDACTIONS.filter((module) => auditRedactionFor(access, module) !== null);
