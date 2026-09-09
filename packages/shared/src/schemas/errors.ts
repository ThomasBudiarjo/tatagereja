import { z } from 'zod';
import { ERROR_CODES } from '../constants';

export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    issues: z.array(validationIssueSchema).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
