import { randomUUID } from 'node:crypto';

/*
 * Builds a small valid request body from a route's Zod schema, so generated route tests reach
 * the authentication and permission checks instead of stopping at validation. Optional and
 * defaulted fields are left out; required ones get the smallest value the schema accepts.
 */

type ZodLike = {
  _zod: {
    def: Record<string, any> & { type: string };
    bag?: Record<string, any>;
  };
  safeParse: (value: unknown) => { success: boolean };
};

const isZod = (value: unknown): value is ZodLike =>
  !!value && typeof value === 'object' && '_zod' in value;

/** Fields that close a range get a later value than the ones that open it. */
const ENDS_RANGE = /^(end|until|to$|due|returned)/i;

function stringFor(bag: Record<string, any>, key: string): string {
  const format = bag.format as string | undefined;
  const late = ENDS_RANGE.test(key);
  if (format === 'uuid' || format === 'guid') return randomUUID();
  if (format === 'email') return 'route-test@example.com';
  if (format === 'url') return 'https://example.com/route-test';
  if (format === 'datetime') return late ? '2031-03-02T12:00:00.000Z' : '2031-03-02T10:00:00.000Z';
  if (format === 'date') return late ? '2031-03-09' : '2031-03-02';
  const patterns = [...((bag.patterns as Set<RegExp> | undefined) ?? [])].map(String);
  const pattern = patterns.join(' ');
  if (pattern.includes('#[0-9a-fA-F]{6}')) return '#336699';
  if (pattern.includes(':[0-5]\\d$')) return late ? '12:00' : '10:00';
  if (pattern.includes('\\d{6}')) return '123456';
  if (pattern.includes('^[a-z][a-z0-9_]*$')) return 'route_test';
  if (pattern.includes('ABCDEFGHJKMNPQRSTUVWXYZ23456789')) {
    return 'A'.repeat(Math.max(bag.minimum ?? 4, 4));
  }
  if (pattern.includes('^[A-Z0-9]+$')) return 'RT1';
  if (pattern.includes('^\\d+$')) return '1';
  const min = Math.max(bag.minimum ?? 0, 0);
  const max = bag.maximum ?? Infinity;
  const base = 'Route test';
  if (base.length >= min && base.length <= max) return base;
  return 'x'.repeat(Math.max(min, 1));
}

function numberFor(bag: Record<string, any>): number {
  const min = bag.minimum ?? bag.exclusiveMinimum ?? -Infinity;
  const max = bag.maximum ?? bag.exclusiveMaximum ?? Infinity;
  for (const candidate of [1, min + 1, min, 0]) {
    if (Number.isFinite(candidate) && candidate >= min && candidate <= max) {
      if (bag.exclusiveMinimum !== undefined && candidate <= bag.exclusiveMinimum) continue;
      return candidate;
    }
  }
  return Number.isFinite(min) ? min : 0;
}

type Options = { key: string; full: boolean };

export function sampleOf(schema: unknown, options: Options, depth = 0): unknown {
  if (!isZod(schema) || depth > 40) return undefined;
  const { def } = schema._zod;
  const bag = schema._zod.bag ?? {};
  const next = (inner: unknown, key = options.key) =>
    sampleOf(inner, { ...options, key }, depth + 1);
  switch (def.type) {
    case 'string':
      return stringFor(bag, options.key);
    case 'number':
    case 'int':
    case 'bigint':
      return numberFor(bag);
    case 'boolean':
      return false;
    case 'literal':
      return [...def.values][0];
    case 'enum':
      return Object.values(def.entries)[0];
    case 'nullable':
    case 'optional':
    case 'default':
    case 'prefault':
      return next(def.innerType);
    case 'pipe': {
      // The output side carries formats (`.trim().pipe(z.email())`); use it when the input accepts it.
      const out = next(def.out);
      if (out !== undefined && isZod(def.in) && def.in.safeParse(out).success) return out;
      return next(def.in);
    }
    case 'transform':
      return undefined;
    case 'array': {
      const min = bag.minimum ?? 0;
      return Array.from({ length: Math.max(min, 1) }, () => next(def.element));
    }
    case 'object': {
      const value: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(def.shape as Record<string, unknown>)) {
        if (!isZod(field)) continue;
        // Optional, defaulted and `nullish().transform()` fields are left out of a minimal body.
        if (!options.full && field.safeParse(undefined).success) continue;
        const sample = next(field, key);
        if (sample !== undefined) value[key] = sample;
      }
      return value;
    }
    case 'union': {
      for (const option of def.options as unknown[]) {
        const candidate = next(option);
        if (isZod(option) && option.safeParse(candidate).success) return candidate;
      }
      return next(def.options[0]);
    }
    case 'intersection':
      return { ...(next(def.left) as object), ...(next(def.right) as object) };
    case 'record':
      return {};
    default:
      return undefined;
  }
}

/** A valid body for the schema, or the best attempt and `valid: false`. */
export function sampleBody(schema: unknown): { body: unknown; valid: boolean } {
  if (!isZod(schema)) return { body: undefined, valid: true };
  // A minimal body first; refinements such as "a person or a name" need the optional fields.
  const minimal = sampleOf(schema, { key: '', full: false });
  if (schema.safeParse(minimal).success) return { body: minimal, valid: true };
  const full = sampleOf(schema, { key: '', full: true });
  if (schema.safeParse(full).success) return { body: full, valid: true };
  return { body: minimal, valid: false };
}
