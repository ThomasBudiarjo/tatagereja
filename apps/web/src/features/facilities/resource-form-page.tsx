import {
  FACILITIES_LIMITS,
  RESOURCE_KINDS,
  RESOURCE_KIND_LABELS,
  facilityResourceInputSchema,
  localize,
  type FacilityResource,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { DoorOpen, X } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { resourceQuery, useSaveResource } from './api';
import { FACILITIES_TONE } from './facilities-lib';

type FormInput = z.input<typeof facilityResourceInputSchema>;
type FormOutput = z.output<typeof facilityResourceInputSchema>;

const SUGGESTED_FEATURES = [
  'Proyektor',
  'Sound system',
  'AC',
  'Piano',
  'Papan tulis',
  'Wi-Fi',
  'Dapur',
  'Kursi lipat',
];

export function NewResourcePage() {
  return <ResourceFormPage />;
}

export function EditResourcePage() {
  const { resourceId = '' } = useParams();
  const { churchId } = useChurch();
  const query = useQuery(resourceQuery(churchId, resourceId));
  if (query.isPending) {
    return (
      <Page size="narrow">
        <SkeletonText lines={10} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page size="narrow">
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      </Page>
    );
  }
  return <ResourceFormPage resource={query.data.resource} />;
}

function ResourceFormPage({ resource }: { resource?: FacilityResource }) {
  const { churchId, base } = useChurch();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(facilityResourceInputSchema),
    defaultValues: {
      name: resource?.name ?? '',
      kind: resource?.kind ?? 'room',
      description: resource?.description ?? '',
      location: resource?.location ?? '',
      capacity: resource?.capacity ?? null,
      features: resource?.features ?? [],
      photoUrl: resource?.photoUrl ?? '',
      color: resource?.color ?? '',
      requiresApproval: resource?.requiresApproval ?? true,
      isActive: resource?.isActive ?? true,
    },
  });
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful);
  const save = useMutationToast(useSaveResource(churchId, resource?.id), {
    success: (result) => t('facilities.roomSaved', { name: result.resource.name }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (result)
      void navigate(`${base}/facilities/rooms/${result.resource.id}`, { replace: !resource });
  });
  const title = resource ? t('facilities.roomFormEdit') : t('facilities.roomFormNew');

  return (
    <Page size="narrow">
      <PageHeader
        title={title}
        icon={DoorOpen}
        tone={FACILITIES_TONE}
        breadcrumbs={[
          { label: t('facilities.nav'), to: `${base}/facilities` },
          { label: t('facilities.roomsTitle'), to: `${base}/facilities/rooms` },
          ...(resource
            ? [{ label: resource.name, to: `${base}/facilities/rooms/${resource.id}` }]
            : []),
          { label: title },
        ]}
      />
      <Card>
        <CardContent>
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
            <Field
              label={t('facilities.fieldRoomName')}
              htmlFor="room-name"
              error={errors.name?.message}
              required
            >
              <Input
                id="room-name"
                autoFocus
                placeholder={t('facilities.roomNamePlaceholder')}
                aria-invalid={!!errors.name}
                {...form.register('name')}
              />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
              <Field label={t('facilities.fieldKind')} htmlFor="room-kind">
                <Select id="room-kind" {...form.register('kind')}>
                  {RESOURCE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {localize(RESOURCE_KIND_LABELS[kind], locale)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t('facilities.fieldCapacity')}
                htmlFor="room-capacity"
                error={errors.capacity?.message}
              >
                <Input
                  id="room-capacity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={FACILITIES_LIMITS.capacityMax}
                  aria-invalid={!!errors.capacity}
                  {...form.register('capacity', {
                    setValueAs: (value: string) =>
                      value === '' || value === null ? null : Number(value),
                  })}
                />
              </Field>
            </div>
            <Field
              label={t('facilities.fieldLocation')}
              htmlFor="room-location"
              error={errors.location?.message}
            >
              <Input
                id="room-location"
                placeholder={t('facilities.locationPlaceholder')}
                {...form.register('location')}
              />
            </Field>
            <Field
              label={t('facilities.fieldDescription')}
              htmlFor="room-description"
              error={errors.description?.message}
            >
              <Textarea id="room-description" rows={3} {...form.register('description')} />
            </Field>
            <Controller
              control={form.control}
              name="features"
              render={({ field }) => (
                <FeaturesField
                  value={field.value ?? []}
                  onChange={field.onChange}
                  error={errors.features?.message}
                />
              )}
            />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <Field
                label={t('facilities.fieldPhotoUrl')}
                htmlFor="room-photo"
                error={errors.photoUrl?.message}
                description={t('facilities.photoUrlHint')}
              >
                <Input
                  id="room-photo"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  aria-invalid={!!errors.photoUrl}
                  {...form.register('photoUrl')}
                />
              </Field>
              <Controller
                control={form.control}
                name="color"
                render={({ field }) => (
                  <Field
                    label={t('facilities.fieldColor')}
                    htmlFor="room-color"
                    error={errors.color?.message}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        id="room-color"
                        type="color"
                        value={field.value || '#7c8c3c'}
                        onChange={(event) => field.onChange(event.target.value)}
                        className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1"
                      />
                      {field.value ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => field.onChange('')}
                        >
                          {t('common.clear')}
                        </Button>
                      ) : null}
                    </div>
                  </Field>
                )}
              />
            </div>
            <Controller
              control={form.control}
              name="requiresApproval"
              render={({ field }) => (
                <ToggleRow
                  id="room-approval"
                  label={t('facilities.fieldRequiresApproval')}
                  hint={t('facilities.fieldRequiresApprovalHint')}
                  checked={field.value ?? true}
                  onChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <ToggleRow
                  id="room-active"
                  label={t('facilities.fieldActive')}
                  hint={t('facilities.fieldActiveHint')}
                  checked={field.value ?? true}
                  onChange={field.onChange}
                />
              )}
            />
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => void navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={save.isPending}>
                {resource ? t('common.saveChanges') : t('facilities.newRoom')}
              </Button>
            </FormActions>
            {guard}
          </form>
        </CardContent>
      </Card>
    </Page>
  );
}

export function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3.5">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Features as chips; Enter or comma adds the typed one, suggestions add with one tap. */
function FeaturesField({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const feature = raw.trim().slice(0, 60);
    if (
      feature &&
      !value.some((item) => item.toLowerCase() === feature.toLowerCase()) &&
      value.length < FACILITIES_LIMITS.featuresMax
    ) {
      onChange([...value, feature]);
    }
    setText('');
  };
  const suggestions = SUGGESTED_FEATURES.filter(
    (feature) => !value.some((item) => item.toLowerCase() === feature.toLowerCase()),
  );
  return (
    <Field label={t('facilities.fieldFeatures')} htmlFor="room-features" error={error}>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
        {value.map((feature) => (
          <span
            key={feature}
            data-tone={FACILITIES_TONE}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-tone-soft pr-1 pl-2 text-sm font-medium text-tone-ink"
          >
            {feature}
            <button
              type="button"
              aria-label={t('facilities.removeFeature', { feature })}
              onClick={() => onChange(value.filter((item) => item !== feature))}
              className="flex size-6 items-center justify-center rounded hover:bg-card/60"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id="room-features"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add(text);
            } else if (event.key === 'Backspace' && !text && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => add(text)}
          placeholder={value.length === 0 ? t('facilities.featuresPlaceholder') : undefined}
          className="h-8 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground/75 md:text-sm"
        />
      </div>
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {suggestions.map((feature) => (
            <button
              key={feature}
              type="button"
              onClick={() => add(feature)}
              className="h-8 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors hover:border-solid hover:text-foreground"
            >
              + {feature}
            </button>
          ))}
        </div>
      ) : null}
    </Field>
  );
}
