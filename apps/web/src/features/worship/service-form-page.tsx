import {
  SERVICE_STATUSES,
  SERVICE_STATUS_LABELS,
  WORSHIP_LIMITS,
  localize,
  worshipServiceInputSchema,
  type ServiceType,
  type WorshipService,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CalendarPlus, Plus, X } from 'lucide-react';
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
import { Alert, Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { serviceQuery, serviceTypesQuery, useSaveService } from './api';
import { ChurchDateTimeInput, PersonSelect } from './worship-ui';
import { WORSHIP_TONE, useChurchTime, withMessages } from './worship-lib';

type FormInput = z.input<typeof worshipServiceInputSchema>;
type FormOutput = z.output<typeof worshipServiceInputSchema>;

const plusMinutes = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

export function NewServicePage() {
  return <ServiceFormPage />;
}

export function EditServicePage() {
  const { serviceId = '' } = useParams();
  const { churchId } = useChurch();
  const query = useQuery(serviceQuery(churchId, serviceId));
  if (query.isPending) {
    return (
      <Page size="narrow">
        <SkeletonText lines={8} />
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
  return <ServiceFormPage service={query.data.service} />;
}

function ServiceFormPage({ service }: { service?: WorshipService }) {
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const types = useQuery(serviceTypesQuery(churchId));
  if (types.isPending) {
    return (
      <Page size="narrow">
        <SkeletonText lines={8} />
      </Page>
    );
  }
  if (types.isError) {
    return (
      <Page size="narrow">
        <ErrorState
          error={types.error}
          message={getErrorMessage(types.error)}
          onRetry={() => void types.refetch()}
        />
      </Page>
    );
  }
  const title = service ? t('worship.serviceFormTitleEdit') : t('worship.serviceFormTitleNew');
  return (
    <Page size="narrow">
      <PageHeader
        title={title}
        description={t('worship.serviceFormDescription')}
        icon={CalendarPlus}
        tone={WORSHIP_TONE}
        breadcrumbs={[
          { label: t('worship.nav'), to: `${base}/worship` },
          { label: t('worship.servicesTitle'), to: `${base}/worship/services` },
          ...(service
            ? [{ label: service.title, to: `${base}/worship/services/${service.id}` }]
            : []),
          { label: title },
        ]}
      />
      <ServiceForm service={service} types={types.data.items} />
    </Page>
  );
}

function ServiceForm({ service, types }: { service?: WorshipService; types: ServiceType[] }) {
  const { churchId, base } = useChurch();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { nextSundayAt, atTime } = useChurchTime();
  const active = types.filter((type) => type.isActive || type.id === service?.serviceTypeId);
  const [preacherMode, setPreacherMode] = useState<'church' | 'guest'>(
    service?.preacherName ? 'guest' : 'church',
  );
  const form = useForm<FormInput, unknown, FormOutput>({
    // Blank reading rows are left out rather than reported.
    resolver: (values, context, options) =>
      withMessages(zodResolver(worshipServiceInputSchema), {
        endsAt: () => t('worship.endsBeforeStart'),
      })(
        {
          ...values,
          scriptureReadings: (values.scriptureReadings ?? []).filter((item) => item.trim()),
        },
        context,
        options,
      ),
    defaultValues: {
      serviceTypeId: service?.serviceTypeId ?? null,
      title: service?.title ?? '',
      startsAt: service?.startsAt ?? nextSundayAt(),
      endsAt: service?.endsAt ?? '',
      location: service?.location ?? '',
      theme: service?.theme ?? '',
      scriptureReadings: service?.scriptureReadings ?? [],
      preacherPersonId: service?.preacher?.id ?? null,
      preacherName: service?.preacherName ?? '',
      notes: service?.notes ?? '',
      status: service?.status ?? 'published',
    },
  });
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful);
  const save = useMutationToast(useSaveService(churchId, service?.id), {
    success: (result) =>
      service
        ? t('worship.serviceSaved')
        : t('worship.serviceCreated', { title: result.service.title }),
    form,
  });

  const submit = form.handleSubmit(async (values) => {
    const result = await save.run({
      ...values,
      preacherPersonId: preacherMode === 'church' ? values.preacherPersonId : null,
      preacherName: preacherMode === 'guest' ? values.preacherName : null,
    });
    if (result) {
      void navigate(
        `${base}/worship/services/${result.service.id}${service ? '' : '?tab=liturgy'}`,
        { replace: !service },
      );
    }
  });

  /** A new service takes the type's usual name, time, length and place. */
  const applyType = (typeId: string | null) => {
    const type = types.find((item) => item.id === typeId);
    if (!type || service) return;
    const values = form.getValues();
    const previous = types.find((item) => item.id === values.serviceTypeId);
    if (!values.title || values.title === previous?.name) {
      form.setValue('title', type.name, { shouldDirty: true });
    }
    if (!values.location && type.defaultLocation) {
      form.setValue('location', type.defaultLocation, { shouldDirty: true });
    }
    if (type.defaultTime) {
      const startsAt = atTime(values.startsAt, type.defaultTime);
      form.setValue('startsAt', startsAt, { shouldDirty: true });
      if (type.defaultDurationMinutes) {
        form.setValue('endsAt', plusMinutes(startsAt, type.defaultDurationMinutes), {
          shouldDirty: true,
        });
      }
    }
  };

  return (
    <Card>
      <CardContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
          {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}
          {active.length > 0 ? (
            <Controller
              control={form.control}
              name="serviceTypeId"
              render={({ field }) => (
                <Field label={t('worship.fieldServiceType')} htmlFor="service-type">
                  <Select
                    id="service-type"
                    value={field.value ?? ''}
                    onChange={(event) => {
                      const next = event.target.value || null;
                      applyType(next);
                      field.onChange(next);
                    }}
                  >
                    <option value="">{t('worship.noServiceType')}</option>
                    {active.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            />
          ) : null}
          <Field
            label={t('worship.fieldTitle')}
            htmlFor="service-title"
            error={errors.title?.message}
            required
          >
            <Input
              id="service-title"
              autoFocus
              placeholder={t('worship.fieldTitlePlaceholder')}
              aria-invalid={!!errors.title}
              {...form.register('title')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <Field
                  label={t('worship.fieldStartsAt')}
                  htmlFor="service-starts"
                  error={errors.startsAt?.message}
                  required
                >
                  <ChurchDateTimeInput
                    id="service-starts"
                    value={field.value}
                    onChange={field.onChange}
                    aria-invalid={!!errors.startsAt}
                  />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <Field
                  label={t('worship.fieldEndsAt')}
                  htmlFor="service-ends"
                  error={errors.endsAt?.message}
                  description={t('worship.fieldEndsAtHint')}
                >
                  <ChurchDateTimeInput
                    id="service-ends"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    aria-invalid={!!errors.endsAt}
                  />
                </Field>
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('worship.fieldLocation')}
              htmlFor="service-location"
              error={errors.location?.message}
            >
              <Input
                id="service-location"
                placeholder={t('worship.fieldLocationPlaceholder')}
                {...form.register('location')}
              />
            </Field>
            <Field
              label={t('worship.fieldTheme')}
              htmlFor="service-theme"
              error={errors.theme?.message}
            >
              <Input
                id="service-theme"
                placeholder={t('worship.fieldThemePlaceholder')}
                {...form.register('theme')}
              />
            </Field>
          </div>
          <Controller
            control={form.control}
            name="scriptureReadings"
            render={({ field }) => (
              <ReadingsField
                value={field.value ?? []}
                onChange={field.onChange}
                error={errors.scriptureReadings?.message}
              />
            )}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">{t('worship.fieldPreacher')}</legend>
            <Segmented<'church' | 'guest'>
              aria-label={t('worship.fieldPreacher')}
              value={preacherMode}
              onChange={setPreacherMode}
              className="sm:max-w-xs"
              options={[
                { value: 'church', label: t('worship.preacherFromChurch') },
                { value: 'guest', label: t('worship.preacherGuest') },
              ]}
            />
            {preacherMode === 'church' ? (
              <Controller
                control={form.control}
                name="preacherPersonId"
                render={({ field }) => (
                  <PersonSelect
                    id="service-preacher"
                    value={field.value ?? null}
                    onChange={(personId) => field.onChange(personId)}
                    initial={service?.preacher}
                    placeholder={t('worship.fieldPreacher')}
                  />
                )}
              />
            ) : (
              <Input
                id="service-preacher-name"
                aria-label={t('worship.guestPreacher')}
                placeholder={t('worship.preacherGuestPlaceholder')}
                {...form.register('preacherName')}
              />
            )}
            {errors.preacherPersonId?.message || errors.preacherName?.message ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.preacherPersonId?.message ?? errors.preacherName?.message}
              </p>
            ) : null}
          </fieldset>
          <Field
            label={t('worship.fieldNotes')}
            htmlFor="service-notes"
            error={errors.notes?.message}
          >
            <Textarea id="service-notes" rows={3} {...form.register('notes')} />
          </Field>
          <Field
            label={t('worship.fieldStatus')}
            htmlFor="service-status"
            description={t('worship.statusHelp')}
          >
            <Select id="service-status" {...form.register('status')}>
              {SERVICE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {localize(SERVICE_STATUS_LABELS[status], locale)}
                </option>
              ))}
            </Select>
          </Field>
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => void navigate(-1)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {service ? t('common.saveChanges') : t('worship.planService')}
            </Button>
          </FormActions>
          {guard}
        </form>
      </CardContent>
    </Card>
  );
}

/** A short list of readings, one input each; Enter in the last one adds another. */
function ReadingsField({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const full = value.length >= WORSHIP_LIMITS.scriptureReadingsMax;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{t('worship.fieldReadings')}</legend>
      {value.map((reading, index) => (
        <div key={index} className="flex items-center gap-2">
          <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={reading}
            aria-label={`${t('worship.fieldReadings')} ${index + 1}`}
            placeholder={t('worship.readingPlaceholder')}
            onChange={(event) =>
              onChange(value.map((item, at) => (at === index ? event.target.value : item)))
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (index === value.length - 1 && reading.trim() && !full) onChange([...value, '']);
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('worship.removeReading', { index: index + 1 })}
            onClick={() => onChange(value.filter((_, at) => at !== index))}
          >
            <X />
          </Button>
        </div>
      ))}
      {!full ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...value, ''])}
        >
          <Plus />
          {t('worship.addReading')}
        </Button>
      ) : null}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </fieldset>
  );
}
