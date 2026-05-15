import { z } from 'zod';

const nullableString = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

export const keluargaSchema = z.object({
  nama_keluarga: z.string().trim().min(1, 'Nama keluarga wajib diisi').max(200),
  alamat: nullableString,
  catatan: nullableString,
});

export type KeluargaFormValues = z.infer<typeof keluargaSchema>;
