import { churchInputSchema, type Church, type ChurchInput } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';

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
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (error) {
      if (!applyServerErrors(error, form.setError, FIELDS)) {
        form.setError('root', { message: getErrorMessage(error) });
      }
    }
  });

  const brandColor = useWatch({ control: form.control, name: 'brandColor' });

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}
      <Field label="Church name" htmlFor="name" error={errors.name?.message} required>
        <Input id="name" {...form.register('name')} aria-invalid={!!errors.name} />
      </Field>
      <Field label="Description" htmlFor="description" error={errors.description?.message}>
        <Textarea id="description" rows={3} {...form.register('description')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city" error={errors.city?.message}>
          <Input id="city" {...form.register('city')} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" inputMode="tel" {...form.register('phone')} />
        </Field>
      </div>
      <Field label="Address" htmlFor="address" error={errors.address?.message}>
        <Input id="address" {...form.register('address')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            inputMode="email"
            {...form.register('email')}
            aria-invalid={!!errors.email}
          />
        </Field>
        <Field
          label="Website"
          htmlFor="website"
          error={errors.website?.message}
          description="Include https://"
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
      <Field
        label="Logo URL"
        htmlFor="logoUrl"
        error={errors.logoUrl?.message}
        description="Link to an image, e.g. https://example.com/logo.png"
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
        label="Brand color"
        htmlFor="brandColor"
        error={errors.brandColor?.message}
        description="Optional hex color used for the church avatar."
      >
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Pick a brand color"
            className="size-11 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1"
            value={brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#c2553a'}
            onChange={(event) =>
              form.setValue('brandColor', event.target.value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          <Input
            id="brandColor"
            placeholder="#c2553a"
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
              Clear
            </Button>
          ) : null}
        </div>
      </Field>
      <FormActions>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={form.formState.isSubmitting}>
          {submitLabel}
        </Button>
      </FormActions>
    </form>
  );
}
