import { z } from 'zod';

const nullableString = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const nullableEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    'Email tidak valid',
  );

const dateOrNull = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
    'Format tanggal harus YYYY-MM-DD',
  );

export const jemaatSchema = z.object({
  nama_lengkap: z.string().trim().min(1, 'Nama wajib diisi').max(200),
  nama_panggilan: nullableString,
  jenis_kelamin: z
    .enum(['L', 'P'])
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  tanggal_lahir: dateOrNull,
  tempat_lahir: nullableString,
  alamat: nullableString,
  nomor_telepon: nullableString,
  email: nullableEmail,
  status_pernikahan: z
    .enum(['belum_menikah', 'menikah', 'cerai', 'duda', 'janda'])
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  tanggal_baptis: dateOrNull,
  tanggal_sidi: dateOrNull,
  catatan: nullableString,
  keluarga_id: z
    .union([z.coerce.number().int().positive(), z.null(), z.undefined(), z.literal('')])
    .transform((v) => (typeof v === 'number' ? v : null))
    .optional(),
});

export type JemaatFormValues = z.infer<typeof jemaatSchema>;
