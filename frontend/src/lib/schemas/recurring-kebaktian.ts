import { z } from 'zod';

const nullableString = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

export const recurringKebaktianSchema = z.object({
  template: z.object({
    nama: z.string().trim().min(1, 'Nama wajib diisi').max(200),
    waktu_mulai: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
    lokasi: nullableString,
    tema: nullableString,
    pengkhotbah: nullableString,
    catatan: nullableString,
  }),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD'),
  weekday: z.coerce.number().int().min(0).max(6),
  week_count: z.coerce.number().int().min(1).max(52),
});

export type RecurringKebaktianFormValues = z.infer<
  typeof recurringKebaktianSchema
>;
