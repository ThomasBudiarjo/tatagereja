import { z } from 'zod';

const nullableString = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

export const kebaktianSchema = z.object({
  nama: z.string().trim().min(1, 'Nama wajib diisi').max(200),
  tanggal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
  waktu_mulai: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Format waktu HH:MM'),
  lokasi: nullableString,
  tema: nullableString,
  pengkhotbah: nullableString,
  catatan: nullableString,
});

export type KebaktianFormValues = z.infer<typeof kebaktianSchema>;
