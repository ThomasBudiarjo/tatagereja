import {
  FACILITIES_LIMITS,
  canManageFacilities,
  facilityBookingInputSchema,
  has,
  latestRecurrenceUntil,
  type FacilityBooking,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Hourglass, Loader2, ShieldCheck, Zap } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DateTimeInput } from '@/components/ui/date-time-input';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { SkeletonText } from '@/components/ui/skeleton';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import {
  availabilityQuery,
  bookingQuery,
  groupOptionsQuery,
  resourcesQuery,
  useSaveBooking,
} from './api';
import { FACILITIES_TONE } from './facilities-lib';
import { ConflictList } from './facilities-ui';
import { ToggleRow } from './resource-form-page';

type FormInput = z.input<typeof facilityBookingInputSchema>;
type FormOutput = z.output<typeof facilityBookingInputSchema>;

const HOUR_MS = 3_600_000;

/** The next full hour from now, as the default start. */
const nextHour = () => {
  const date = new Date(Date.now() + HOUR_MS);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
};

const plusHours = (iso: string, hours: number) =>
  new Date(new Date(iso).getTime() + hours * HOUR_MS).toISOString();

export function NewBookingPage() {
  return <BookingFormPage />;
}

export function EditBookingPage() {
  const { bookingId = '' } = useParams();
  const { churchId } = useChurch();
  const { t } = useI18n();
  const query = useQuery(bookingQuery(churchId, bookingId));
  if (query.isPending) {
    return (
      <Page size="narrow">
        <SkeletonText lines={12} />
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
  const { booking } = query.data;
  if (booking.status !== 'pending' && booking.status !== 'approved') {
    return (
      <Page size="narrow">
        <NoAccessState title={t('facilities.cannotEditTitle')} description={t('facilities.cannotEditBody')} />
      </Page>
    );
  }
  return <BookingFormPage booking={booking} />;
}

function BookingFormPage({ booking }: { booking?: FacilityBooking }) {
  const { churchId, base, access } = useChurch();
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resources = useQuery(resourcesQuery(churchId, {}));
  const groups = useQuery({
    ...groupOptionsQuery(churchId),
    enabled: has(access, 'groups.view'),
  });
  const [defaultStart] = useState(() => {
    const requested = params.get('startsAt');
    return requested && !Number.isNaN(Date.parse(requested)) ? requested : nextHour();
  });
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(facilityBookingInputSchema),
    defaultValues: {
      resourceId: booking?.resourceId ?? params.get('resourceId') ?? '',
      title: booking?.title ?? '',
      purpose: booking?.purpose ?? '',
      startsAt: booking?.startsAt ?? defaultStart,
      endsAt: booking?.endsAt ?? plusHours(defaultStart, 2),
      recurrence: booking?.recurrence ?? 'none',
      recurrenceUntil: booking?.recurrenceUntil ?? '',
      expectedAttendees: booking?.expectedAttendees ?? null,
      groupId: booking?.groupId ?? null,
      eventId: booking?.eventId ?? null,
      notes: booking?.notes ?? '',
    },
  });
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful);
  const [resourceId, startsAt, endsAt, recurrence, recurrenceUntil, expected] = useWatch({
    control: form.control,
    name: ['resourceId', 'startsAt', 'endsAt', 'recurrence', 'recurrenceUntil', 'expectedAttendees'],
  });
  const resource = resources.data?.items.find((item) => item.id === resourceId);
  const weekly = recurrence === 'weekly';

  // The live check: only when the times make sense, a moment after the last change.
  const check = useDebounced(
    {
      resourceId: resourceId ?? '',
      startsAt: startsAt ?? '',
      endsAt: endsAt ?? '',
      recurrence: recurrence ?? 'none',
      recurrenceUntil: weekly ? recurrenceUntil || null : null,
      excludeBookingId: booking?.id ?? null,
    },
    350,
  );
  const checkable =
    !!check.resourceId &&
    !!check.startsAt &&
    !!check.endsAt &&
    Date.parse(check.endsAt) > Date.parse(check.startsAt) &&
    (check.recurrence === 'none' || !!check.recurrenceUntil);
  const availability = useQuery({
    ...availabilityQuery(churchId, check),
    enabled: checkable,
    retry: false,
  });

  const save = useMutationToast(useSaveBooking(churchId, booking?.id), {
    success: (result) =>
      result.booking.status === 'approved'
        ? t('facilities.bookingConfirmed', { title: result.booking.title })
        : t('facilities.bookingRequested', { title: result.booking.title }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (result) {
      void navigate(`${base}/facilities/bookings/${result.booking.id}`, { replace: !booking });
    } else {
      // A conflict may have appeared meanwhile; show it next to the times.
      void availability.refetch();
    }
  });
  const title = booking ? t('facilities.bookingFormEdit') : t('facilities.bookingFormNew');
  const conflicts = checkable ? (availability.data?.conflicts ?? []) : [];
  const overCapacity =
    !!resource?.capacity && typeof expected === 'number' && expected > resource.capacity;
  const goesToApproval =
    !!booking &&
    !canManageFacilities(access) &&
    booking.status === 'approved' &&
    (booking.startsAt !== startsAt ||
      booking.endsAt !== endsAt ||
      booking.resourceId !== resourceId ||
      booking.recurrence !== recurrence) &&
    !!resource?.requiresApproval;

  const shiftStart = (next: string) => {
    // Moving the start keeps the length of the booking.
    const length = Date.parse(endsAt ?? '') - Date.parse(startsAt ?? '');
    form.setValue('startsAt', next, { shouldDirty: true, shouldValidate: !!errors.startsAt });
    if (next && Number.isFinite(length) && length > 0) {
      form.setValue('endsAt', new Date(Date.parse(next) + length).toISOString(), {
        shouldDirty: true,
      });
    }
  };

  if (resources.isSuccess && resources.data.items.length === 0) {
    return (
      <Page size="narrow">
        <PageHeader title={title} icon={CalendarClock} tone={FACILITIES_TONE} backTo={`${base}/facilities`} />
        <NoAccessState title={t('facilities.noRooms')} description={t('facilities.noRoomsView')} />
      </Page>
    );
  }

  return (
    <Page size="narrow">
      <PageHeader
        title={title}
        icon={CalendarClock}
        tone={FACILITIES_TONE}
        breadcrumbs={[
          { label: t('facilities.nav'), to: `${base}/facilities` },
          { label: t('facilities.bookingsTitle'), to: `${base}/facilities/bookings` },
          ...(booking
            ? [{ label: booking.title, to: `${base}/facilities/bookings/${booking.id}` }]
            : []),
          { label: title },
        ]}
      />
      <Card>
        <CardContent>
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
            <Field
              label={t('facilities.fieldResource')}
              htmlFor="booking-resource"
              error={errors.resourceId ? t('facilities.chooseRoom') : undefined}
              required
            >
              <Select
                id="booking-resource"
                aria-invalid={!!errors.resourceId}
                disabled={resources.isPending}
                {...form.register('resourceId')}
              >
                <option value="">{t('facilities.chooseRoom')}</option>
                {(resources.data?.items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.capacity ? ` · ${t('facilities.capacityValue', { count: item.capacity })}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t('facilities.fieldTitle')}
              htmlFor="booking-title"
              error={errors.title?.message}
              required
            >
              <Input
                id="booking-title"
                autoFocus
                placeholder={t('facilities.titlePlaceholder')}
                aria-invalid={!!errors.title}
                {...form.register('title')}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="startsAt"
                render={({ field }) => (
                  <Field
                    label={t('facilities.fieldStartsAt')}
                    htmlFor="booking-start"
                    error={errors.startsAt?.message}
                    required
                  >
                    <DateTimeInput
                      id="booking-start"
                      value={field.value ?? ''}
                      onChange={shiftStart}
                      onBlur={field.onBlur}
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
                    label={t('facilities.fieldEndsAt')}
                    htmlFor="booking-end"
                    error={errors.endsAt?.message}
                    required
                  >
                    <DateTimeInput
                      id="booking-end"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={!!errors.endsAt}
                    />
                  </Field>
                )}
              />
            </div>
            <Controller
              control={form.control}
              name="recurrence"
              render={({ field }) => (
                <ToggleRow
                  id="booking-weekly"
                  label={t('facilities.fieldWeekly')}
                  hint={t('facilities.fieldWeeklyHint')}
                  checked={field.value === 'weekly'}
                  onChange={(checked) => field.onChange(checked ? 'weekly' : 'none')}
                />
              )}
            />
            {weekly ? (
              <Field
                label={t('facilities.fieldRecurrenceUntil')}
                htmlFor="booking-until"
                error={errors.recurrenceUntil?.message}
                description={
                  availability.data && checkable
                    ? t('facilities.occurrenceCount', { count: availability.data.occurrenceCount })
                    : undefined
                }
                required
              >
                <Input
                  id="booking-until"
                  type="date"
                  min={startsAt ? startsAt.slice(0, 10) : undefined}
                  max={startsAt ? latestRecurrenceUntil(startsAt) : undefined}
                  aria-invalid={!!errors.recurrenceUntil}
                  {...form.register('recurrenceUntil')}
                />
              </Field>
            ) : null}

            <AvailabilityPanel
              checkable={checkable}
              loading={availability.isFetching && !availability.data}
              available={availability.data?.available ?? null}
              pending={availability.data?.pendingOverlaps ?? 0}
              autoApproved={availability.data?.autoApproved ?? false}
              conflicts={conflicts}
              error={availability.isError ? getErrorMessage(availability.error) : null}
            />
            {goesToApproval ? (
              <Alert variant="info">{t('facilities.changeNeedsApproval')}</Alert>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('facilities.fieldExpectedAttendees')}
                htmlFor="booking-attendees"
                error={
                  errors.expectedAttendees?.message ??
                  (overCapacity
                    ? t('facilities.overCapacity', { count: resource?.capacity ?? 0 })
                    : undefined)
                }
                description={
                  resource?.capacity
                    ? t('facilities.capacityHint', { count: resource.capacity })
                    : undefined
                }
              >
                <Input
                  id="booking-attendees"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={FACILITIES_LIMITS.capacityMax}
                  aria-invalid={!!errors.expectedAttendees || overCapacity}
                  {...form.register('expectedAttendees', {
                    setValueAs: (value: string) =>
                      value === '' || value === null ? null : Number(value),
                  })}
                />
              </Field>
              {groups.data && groups.data.items.length > 0 ? (
                <Controller
                  control={form.control}
                  name="groupId"
                  render={({ field }) => (
                    <Field label={t('facilities.fieldGroup')} htmlFor="booking-group">
                      <Select
                        id="booking-group"
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value || null)}
                      >
                        <option value="">{t('facilities.noGroup')}</option>
                        {groups.data.items.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                />
              ) : null}
            </div>
            <Field
              label={t('facilities.fieldPurpose')}
              htmlFor="booking-purpose"
              error={errors.purpose?.message}
            >
              <Input
                id="booking-purpose"
                placeholder={t('facilities.purposePlaceholder')}
                {...form.register('purpose')}
              />
            </Field>
            <Field
              label={t('facilities.fieldNotes')}
              htmlFor="booking-notes"
              error={errors.notes?.message}
              description={t('facilities.notesHint')}
            >
              <Textarea id="booking-notes" rows={3} {...form.register('notes')} />
            </Field>
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => void navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                loading={save.isPending}
                disabled={conflicts.length > 0 || overCapacity}
              >
                {booking
                  ? t('common.saveChanges')
                  : availability.data?.autoApproved
                    ? t('facilities.bookNow')
                    : t('facilities.sendRequest')}
              </Button>
            </FormActions>
            {weekly && recurrenceUntil ? (
              <p className="text-right text-xs text-muted-foreground">
                {t('facilities.repeatsUntil', { date: formatDate(recurrenceUntil, 'dateLong') })}
              </p>
            ) : null}
            {guard}
          </form>
        </CardContent>
      </Card>
    </Page>
  );
}

/** What the live check found: free, taken (with the overlapping bookings) or still checking. */
function AvailabilityPanel({
  checkable,
  loading,
  available,
  pending,
  autoApproved,
  conflicts,
  error,
}: {
  checkable: boolean;
  loading: boolean;
  available: boolean | null;
  pending: number;
  autoApproved: boolean;
  conflicts: Parameters<typeof ConflictList>[0]['conflicts'];
  error: string | null;
}) {
  const { t } = useI18n();
  if (!checkable) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
        <CalendarClock className="size-4 shrink-0" aria-hidden />
        {t('facilities.availabilityHint')}
      </p>
    );
  }
  if (error) {
    return <Alert variant="warning">{error}</Alert>;
  }
  if (loading || available === null) {
    return (
      <p
        className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground"
        role="status"
      >
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        {t('facilities.checking')}
      </p>
    );
  }
  if (!available) {
    return (
      <Alert variant="error" title={t('facilities.conflictsTitle')}>
        <span className="block">{t('facilities.conflictsBody')}</span>
        <ConflictList conflicts={conflicts} className="mt-2" />
      </Alert>
    );
  }
  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      <Alert variant="success" title={t('facilities.slotFree')}>
        <span className="inline-flex items-center gap-1.5">
          {autoApproved ? (
            <>
              <Zap className="size-3.5" aria-hidden />
              {t('facilities.willBeApproved')}
            </>
          ) : (
            <>
              <ShieldCheck className="size-3.5" aria-hidden />
              {t('facilities.willNeedApproval')}
            </>
          )}
        </span>
      </Alert>
      {pending > 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Hourglass className="size-3.5" aria-hidden />
          {t('facilities.pendingOverlaps', { count: pending })}
        </p>
      ) : null}
    </div>
  );
}
