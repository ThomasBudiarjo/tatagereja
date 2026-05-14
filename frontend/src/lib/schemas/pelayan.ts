import { z } from 'zod';

export const pelayanSchema = z.object({
  jemaat_id: z.coerce.number().int().positive('Pilih jemaat'),
  catatan: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  service_type_ids: z.array(z.coerce.number().int().positive()).default([]),
});

export type PelayanFormValues = z.infer<typeof pelayanSchema>;
