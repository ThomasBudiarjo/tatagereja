import { recoveryCodeSchema, totpCodeSchema } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { t } from '@/lib/i18n';

/** Password plus one second factor: an authenticator code or an unused recovery code. */
export const secondFactorFormSchema = z
  .object({
    password: z.string().min(1, { error: () => t('profile.passwordRequired') }),
    method: z.enum(['totp', 'recovery']),
    code: z.string(),
    recoveryCode: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.method === 'totp' && !totpCodeSchema.safeParse(value.code).success) {
      ctx.addIssue({ code: 'custom', path: ['code'], message: t('profile.codeInvalid') });
    }
    if (value.method === 'recovery' && !recoveryCodeSchema.safeParse(value.recoveryCode).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['recoveryCode'],
        message: t('profile.recoveryInvalid'),
      });
    }
  });
export type SecondFactorForm = z.infer<typeof secondFactorFormSchema>;

/** The API body for the chosen factor. */
export const secondFactorBody = (values: SecondFactorForm) => ({
  password: values.password,
  ...(values.method === 'totp' ? { code: values.code } : { recoveryCode: values.recoveryCode }),
});

/**
 * The form behind disabling 2FA, new recovery codes and deleting a protected account. Server
 * errors land on the field they name (`password`, `code`, `recoveryCode`).
 */
export function useSecondFactorForm() {
  return useForm<SecondFactorForm>({
    resolver: zodResolver(secondFactorFormSchema),
    defaultValues: { password: '', method: 'totp', code: '', recoveryCode: '' },
  });
}
