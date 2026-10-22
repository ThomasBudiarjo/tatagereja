import { z } from 'zod';
import { LIMITS } from '../constants';
import { CURRENCY_CODES, isValidTimeZone, type CurrencyCode } from '../money';

export const idSchema = z.uuid();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const isoDateSchema = z.iso.date();

/** Trims strings and converts empty strings to null. Used for optional free-text fields. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const requiredText = (min: number, max: number) => z.string().trim().min(min).max(max);

export const optionalEmail = z
  .string()
  .trim()
  .max(LIMITS.emailMax)
  .nullish()
  .transform((value) => (value ? value.toLowerCase() : null))
  .pipe(z.email().nullable());

export const optionalUrl = z
  .string()
  .trim()
  .max(LIMITS.urlMax)
  .nullish()
  .transform((value) => (value ? value : null))
  .pipe(z.url({ protocol: /^https?$/ }).nullable());

export const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .pipe(isoDateSchema.nullable());

export const optionalDateTime = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .pipe(isoDateTimeSchema.nullable());

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color such as #2563eb');

/** Accepts a hex color, or an empty/absent value which becomes null. */
export const optionalHexColor = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .pipe(hexColorSchema.nullable());

export const paginationQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.shortTextMax).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(LIMITS.pageSizeDefault),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
  });

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

/** A non-negative amount in integer minor units of the church currency. */
export const moneySchema = z.number().int().min(0).max(LIMITS.moneyMax);
/** A signed amount in minor units, for adjustments and balances. */
export const signedMoneySchema = z.number().int().min(-LIMITS.moneyMax).max(LIMITS.moneyMax);

export const currencySchema = z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]]);

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.timezoneMax)
  .refine(isValidTimeZone, 'Must be a time zone such as Asia/Jakarta');

export const idParamsSchema = z.object({ id: idSchema });
export const churchParamsSchema = z.object({ churchId: idSchema });
export const churchIdParamsSchema = z.object({ churchId: idSchema, id: idSchema });

export const okSchema = z.object({ ok: z.literal(true) });
export type Ok = z.infer<typeof okSchema>;
