import { z } from 'zod';

export const serviceTypeSchema = z.object({
  nama: z.string().trim().min(1, 'Nama wajib diisi').max(100),
  deskripsi: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  warna: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  urutan: z.coerce.number().int().min(0).default(0),
});

export type ServiceTypeFormValues = z.infer<typeof serviceTypeSchema>;
