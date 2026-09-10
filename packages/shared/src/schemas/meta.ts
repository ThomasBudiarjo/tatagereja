import { z } from 'zod';
import { APP_NAME, REGISTRATION_MODES } from '../constants';

export const serverMetaSchema = z.object({
  app: z.literal(APP_NAME),
  name: z.string(),
  version: z.string(),
  apiVersion: z.number().int(),
  registrationMode: z.enum(REGISTRATION_MODES),
  turnstileSiteKey: z.string().nullable(),
});
export type ServerMeta = z.infer<typeof serverMetaSchema>;
