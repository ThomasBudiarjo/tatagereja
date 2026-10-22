import { churchInputSchema, type Church, type ChurchInput } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert, Separator } from '@/components/ui/misc';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';

type FormInput = z.input<typeof churchInputSchema>;

const FIELDS = [
  'name',
  'description',
  'address',
  'city',
  'phone',
  'email',
  'website',
  'logoUrl',
  'brandColor',
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3 text-overline text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ChurchForm({
  church,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  church?: Church;
  onSubmit: (values: ChurchInput) => Promise<unknown>;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const form = useForm<FormInput, unknown, ChurchInput>({
    resolver: zodResolver(churchInputSchema),
    defaultValues: {
      name: church?.name ?? '',
      description: church?.description ?? '',
      address: church?.address ?? '',
      city: church?.city ?? '',
      phone: church?.phone ?? '',
      email: church?.email ?? '',
      website: church?.website ?? '',
      logoUrl: church?.logoUrl ?? '',
      brandColor: church?.brandColor ?? '',
    },
  });
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful);

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      // Saved: the current values are the new baseline, so leaving is no longer guarded.
      form.reset(form.getValues());
    } catch (error) {
      if (applyServerErrors(error, form.setError, FIELDS)) {
        toast.error(t('common.fixErrors'));
      } else {
        const message = getErrorMessage(error);
        form.setError('root', { message });
        toast.error(message);
      }
    }
  });

  const [name, brandColor, logoUrl] = useWatch({
    control: form.control,
    name: ['name', 'brandColor', 'logoUrl'],
  });

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6" noValidate>
      {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}
      <FormSection title={t('churches.sectionIdentity')}>
        <Field label={t('churches.name')} htmlFor="name" error={errors.name?.message} required>
          <Input
            id="name"
            autoFocus={!church}
            placeholder={t('churches.namePlaceholder')}
            {...form.register('name')}
            aria-invalid={!!errors.name}
          />
        </Field>
        <Field
          label={t('churches.descriptionField')}
          htmlFor="description"
          error={errors.description?.message}
        >
          <Textarea
            id="description"
            rows={3}
            placeholder={t('churches.descriptionPlaceholder')}
            {...form.register('description')}
          />
        </Field>
      </FormSection>

      <Separator />

      <FormSection title={t('churches.sectionContact')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('churches.city')} htmlFor="city" error={errors.city?.message}>
            <Input id="city" autoComplete="address-level2" {...form.register('city')} />
          </Field>
          <Field label={t('churches.phone')} htmlFor="phone" error={errors.phone?.message}>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              {...form.register('phone')}
            />
          </Field>
        </div>
        <Field label={t('churches.address')} htmlFor="address" error={errors.address?.message}>
          <Input id="address" autoComplete="street-address" {...form.register('address')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('churches.email')} htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              {...form.register('email')}
              aria-invalid={!!errors.email}
            />
          </Field>
          <Field
            label={t('churches.website')}
            htmlFor="website"
            error={errors.website?.message}
            description={t('churches.websiteHint')}
          >
            <Input
              id="website"
              type="url"
              inputMode="url"
              placeholder="https://"
              {...form.register('website')}
              aria-invalid={!!errors.website}
            />
          </Field>
        </div>
      </FormSection>

      <Separator />

      <FormSection title={t('churches.sectionBranding')}>
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-3">
          <EntityAvatar
            name={name || '?'}
            src={logoUrl || null}
            color={brandColor && HEX.test(brandColor) ? brandColor : null}
            size="lg"
            square
          />
          <div className="min-w-0 text-sm">
            <p className="text-xs text-muted-foreground">{t('churches.preview')}</p>
            <p className="truncate font-semibold">{name || t('churches.namePlaceholder')}</p>
          </div>
        </div>
        <Field
          label={t('churches.logoUrl')}
          htmlFor="logoUrl"
          error={errors.logoUrl?.message}
          description={t('churches.logoHint')}
        >
          <Input
            id="logoUrl"
            type="url"
            inputMode="url"
            placeholder="https://"
            {...form.register('logoUrl')}
            aria-invalid={!!errors.logoUrl}
          />
        </Field>
        <Field
          label={t('churches.brandColor')}
          htmlFor="brandColor"
          error={errors.brandColor?.message}
          description={t('churches.brandColorHint')}
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t('churches.pickColor')}
              className="size-11 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1"
              value={brandColor && HEX.test(brandColor) ? brandColor : '#b4502f'}
              onChange={(event) =>
                form.setValue('brandColor', event.target.value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            <Input
              id="brandColor"
              placeholder="#b4502f"
              {...form.register('brandColor')}
              aria-invalid={!!errors.brandColor}
            />
            {brandColor ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => form.setValue('brandColor', '', { shouldDirty: true })}
              >
                {t('common.clear')}
              </Button>
            ) : null}
          </div>
        </Field>
      </FormSection>

      <FormActions>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
        ) : null}
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </FormActions>
      {guard}
    </form>
  );
}
