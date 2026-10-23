import { LIMITS, type AuditParams, type ModuleId } from '@tatagereja/shared';
import type { Queryable } from '../db/client';
import { auditLogs } from '../db/schema';
import type { RequestMeta } from '../lib/request';
import { nowIso } from '../lib/time';
import { newId } from '../lib/tokens';

/** Who is acting and from where. Resolved by the `auth` and `church` macros as `audit`. */
export type AuditContext = RequestMeta & {
  churchId: string | null;
  actorUserId: string | null;
};

export type AuditEntry = {
  module: ModuleId;
  /** `<entity>.<verb>`, e.g. `person.delete`, `role.update`, `finance.period_close`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** One human sentence, e.g. "Deleted Budi Santoso". Keep secrets and confidential text out. */
  summary: string;
  /**
   * The values the summary names, for the viewer to describe the action in its own language:
   * `name` (the item), `member` or `person` (who it is about), counts. `name` is taken from the
   * recorded values (`name`, `title`, `label`) when not given.
   */
  params?: AuditParams;
  before?: unknown;
  after?: unknown;
  /** Overrides the context's church, e.g. `null` for the final entry of a deleted church. */
  churchId?: string | null;
};

export const REDACTED = '[redacted]';

/** Field names whose values never reach the audit log, matched case-insensitively. */
export const DEFAULT_REDACTED_KEYS = [
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'tokenHash',
  'secret',
  'totpSecret',
  'recoveryCodes',
  'code',
  'securityCode',
] as const;

/** Largest JSON snapshot stored per side; bigger values are replaced by a marker. */
const MAX_SNAPSHOT_CHARS = 20_000;

/**
 * Returns a deep copy with the values of sensitive keys replaced by `[redacted]`.
 * Pass extra keys for module-specific secrets, e.g. `redact(details, ['nationalId', 'medicalNotes'])`.
 */
export function redact<T>(value: T, extraKeys: readonly string[] = []): T {
  const keys = new Set([...DEFAULT_REDACTED_KEYS, ...extraKeys].map((key) => key.toLowerCase()));
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(input)) {
        output[key] =
          keys.has(key.toLowerCase()) && inner !== null && inner !== undefined
            ? REDACTED
            : walk(inner);
      }
      return output;
    }
    return input;
  };
  return walk(value) as T;
}

/**
 * Keeps only the fields that differ between two flat snapshots, so update entries show
 * exactly what changed. Returns `null` sides when nothing changed.
 */
export function changes<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T> | null; after: Partial<T> | null } {
  const changedBefore: Partial<T> = {};
  const changedAfter: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      changedBefore[key] = before[key];
      changedAfter[key] = after[key];
    }
  }
  const empty = Object.keys(changedAfter).length === 0;
  return { before: empty ? null : changedBefore, after: empty ? null : changedAfter };
}

const NAME_FIELDS = ['name', 'title', 'label'] as const;

/** The entry's params: the given ones, plus the item's name from its recorded values. */
const paramsOf = (entry: AuditEntry): AuditParams => {
  const params: AuditParams = {};
  for (const side of [entry.after, entry.before]) {
    if (params.name !== undefined || !side || typeof side !== 'object') continue;
    const values = side as Record<string, unknown>;
    for (const field of NAME_FIELDS) {
      const value = values[field];
      if (typeof value === 'string' && value.trim()) {
        params.name = value.trim().slice(0, LIMITS.nameMax);
        break;
      }
    }
    // People are recorded by their first and last name.
    if (params.name === undefined && typeof values.firstName === 'string') {
      const last = typeof values.lastName === 'string' ? ` ${values.lastName}` : '';
      params.name = `${values.firstName}${last}`.trim().slice(0, LIMITS.nameMax);
    }
  }
  for (const [key, value] of Object.entries(entry.params ?? {})) {
    params[key] = typeof value === 'string' ? value.slice(0, LIMITS.shortTextMax) : value;
  }
  return redact(params);
};

const snapshot = (value: unknown): unknown => {
  if (value === undefined || value === null) return null;
  const json = JSON.stringify(value);
  if (json === undefined) return null;
  return json.length > MAX_SNAPSHOT_CHARS ? { truncated: true, size: json.length } : value;
};

/**
 * Appends an audit entry. Call it with the transaction handle of the change it describes so
 * both commit or roll back together. Values are redacted with the default sensitive keys;
 * redact module-specific fields yourself before passing them.
 */
export function recordAudit(db: Queryable, context: AuditContext, entry: AuditEntry): void {
  db.insert(auditLogs)
    .values({
      id: newId(),
      churchId: entry.churchId === undefined ? context.churchId : entry.churchId,
      actorUserId: context.actorUserId,
      module: entry.module,
      action: entry.action.slice(0, LIMITS.shortTextMax),
      entityType: entry.entityType.slice(0, LIMITS.shortTextMax),
      entityId: entry.entityId ?? null,
      summary: entry.summary.slice(0, LIMITS.auditSummaryMax),
      params: paramsOf(entry),
      before: snapshot(redact(entry.before)),
      after: snapshot(redact(entry.after)),
      ip: context.ip,
      userAgent: context.userAgent,
      createdAt: nowIso(),
    })
    .run();
}
