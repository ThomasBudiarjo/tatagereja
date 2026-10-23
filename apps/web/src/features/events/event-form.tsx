import {
  EVENT_RECURRENCE_FREQUENCIES,
  EVENT_RECURRENCE_LABELS,
  addDaysToDate,
  churchDateOf,
  eventDetailsInputSchema,
  has,
  localize,
  type EventDetails,
  type EventDetailsInput,
  type EventEditScope,
  type Group,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Check, ClipboardCheck, Repeat, Ticket } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FormActions } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { churchToday, fromChurchInput } from '@/features/comms/church-time';
import { ChurchDateTimeInput } from '@/features/comms/church-time-input';
import { useCommsResolver, useServerErrors } from '@/features/comms/forms';
import { MarkdownEditor } from '@/features/comms/markdown';
import { groupsQuery } from '@/features/groups/api';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { useCreateEvent, useCreateSeries, useUpdateEvent, type EventFormInput } from './api';
import { EVENT_COLORS } from './event-lib';

const REPEATS = ['none', ...EVENT_RECURRENCE_FREQUENCIES] as const;
type Repeat = (typeof REPEATS)[number];

const formSchema = z
  .intersection(
    eventDetailsInputSchema,
    z.object({ repeat: z.enum(REPEATS).default('none'), untilDate: z.string().default('') }),
  )
  .superRefine((value, context) => {
    if (value.repeat === 'none') return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.untilDate)) {
      context.addIssue({ code: 'custom', path: ['untilDate'], message: 'untilRequired' });
    } else if (value.untilDate < value.startsAt.slice(0, 10)) {
      context.addIssue({
        code: 'custom',
        path: ['untilDate'],
        message: 'The end date must be on or after the first occurrence',
      });
    }
  });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

/** Tomorrow at 18.00 church time: the usual evening gathering. */
const nextEvening = (timeZone: string) =>
  fromChurchInput(`${addDaysToDate(churchToday(timeZone), 1)}T18:00`, timeZone);

const plusMinutes = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

type Props = {
  event?: EventDetails;
  defaultGroupId?: string | null;
  onSaved: (id: string) => void;
  onCancel: () => void;
};

/** Groups load first so the scope select and the form state always agree. */
export function EventForm(props: Props) {
  const { churchId, access } = useChurch();
  const groups = useQuery({
    ...groupsQuery(churchId, { includeInactive: true }),
    enabled: has(access, 'groups.view') || access.leaderGroupIds.length > 0,
  });
  if (groups.isPending && groups.fetchStatus !== 'idle') {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }
  if (groups.isError) {
    return (
      <ErrorState
        error={groups.error}
        message={getErrorMessage(groups.error)}
        onRetry={() => void groups.refetch()}
        retrying={groups.isFetching}
      />
    );
  }
  return <EventFormFields groups={groups.data?.items ?? []} {...props} />;
}

function EventFormFields({
  groups,
  event,
  defaultGroupId,
  onSaved,
  onCancel,
}: Props & { groups: Group[] }) {
  const { t, locale, timeZone } = useI18n();
  const { access, churchId } = useChurch();
  const manager = has(access, 'events.manage');
  const selectable = manager
    ? groups
    : groups.filter((group) => access.leaderGroupIds.includes(group.id));
  const zone = timeZone ?? 'Asia/Jakarta';
  const [defaultStart] = useState(() => nextEvening(zone));
  const start = event?.startsAt ?? defaultStart;

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: useCommsResolver(zodResolver(formSchema)),
    defaultValues: {
      title: event?.title ?? '',
      description: event?.description ?? '',
      location: event?.location ?? '',
      groupId:
        event?.groupId ??
        (defaultGroupId && selectable.some((group) => group.id === defaultGroupId)
          ? defaultGroupId
          : manager
            ? null
            : (selectable[0]?.id ?? null)),
      startsAt: start,
      endsAt: event ? (event.endsAt ?? '') : plusMinutes(start, 120),
      isAllDay: event?.isAllDay ?? false,
      capacity: event?.capacity ?? null,
      registrationRequired: event?.registrationRequired ?? false,
      registrationClosesAt: event?.registrationClosesAt ?? '',
      waitlistEnabled: event?.waitlistEnabled ?? true,
      checkInEnabled: event?.checkInEnabled ?? false,
      coverColor: event?.coverColor ?? null,
      repeat: 'none',
      untilDate: addDaysToDate(churchDateOf(start, zone), 7 * 12),
    },
  });
  const serverErrors = useServerErrors(form);
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful);
  const [repeat, registrationRequired, startsAt] = useWatch({
    control: form.control,
    name: ['repeat', 'registrationRequired', 'startsAt'],
  });
  const [pending, setPending] = useState<EventDetailsInput | null>(null);

  const success = event ? t('events.saved') : t('events.created');
  const create = useMutationToast(useCreateEvent(churchId), { success, form: serverErrors });
  const series = useMutationToast(useCreateSeries(churchId), {
    success: (result) => t('events.seriesCreated', { count: result.series.occurrenceCount }),
    form: serverErrors,
  });
  const update = useMutationToast(useUpdateEvent(churchId, event?.id ?? ''), {
    success,
    form: serverErrors,
  });
  const busy = create.isPending || series.isPending || update.isPending;

  const saveUpdate = async (body: EventDetailsInput, scope: EventEditScope) => {
    const result = await update.run({ body: body as EventFormInput, scope });
    setPending(null);
    if (result) onSaved(result.event.id);
  };

  const submit = form.handleSubmit(async (values) => {
    if (!manager && !values.groupId) {
      form.setError('groupId', { message: t('events.chooseLedGroup') });
      return;
    }
    const { repeat: frequency, untilDate, ...body } = values;
    if (event) {
      if (event.seriesId) setPending(body);
      else await saveUpdate(body, 'this');
      return;
    }
    if (frequency !== 'none') {
      const duration =
        body.endsAt && !body.isAllDay
          ? Math.round(
              (new Date(body.endsAt).getTime() - new Date(body.startsAt).getTime()) / 60_000,
            )
          : null;
      const result = await series.run({
        title: body.title,
        description: body.description,
        location: body.location,
        groupId: body.groupId,
        startsAt: body.startsAt,
        durationMinutes: duration && duration > 0 ? Math.min(duration, 24 * 60) : null,
        isAllDay: body.isAllDay,
        frequency,
        untilDate,
        capacity: body.capacity,
        registrationRequired: body.registrationRequired,
        waitlistEnabled: body.waitlistEnabled,
        checkInEnabled: body.checkInEnabled,
        coverColor: body.coverColor,
      });
      if (result) onSaved(result.event.id);
      return;
    }
    const result = await create.run(body as EventFormInput);
    if (result) onSaved(result.event.id);
  });

  if (!manager && selectable.length === 0) {
    return (
      <Alert variant="warning" title={t('events.noScopeTitle')}>
        {t('events.noScopeBody')}
      </Alert>
    );
  }

  const untilMessage =
    errors.untilDate?.message === 'untilRequired'
      ? t('events.untilRequired')
      : errors.untilDate?.message;

  return (
    <form
      onSubmit={(formEvent) => void submit(formEvent)}
      noValidate
      className="flex flex-col gap-5"
    >
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field
            label={t('events.fieldTitle')}
            htmlFor="event-title"
            error={errors.title?.message}
            required
          >
            <Input
              id="event-title"
              autoFocus
              placeholder={t('events.titlePlaceholder')}
              aria-invalid={!!errors.title}
              {...form.register('title')}
            />
          </Field>
          <Controller
            control={form.control}
            name="groupId"
            render={({ field }) => (
              <Field
                label={t('events.fieldScope')}
                htmlFor="event-group"
                error={errors.groupId?.message}
                description={manager ? t('events.scopeHintManager') : t('events.scopeHintLeader')}
              >
                <Select
                  id="event-group"
                  value={field.value ?? ''}
                  onChange={(selectEvent) => field.onChange(selectEvent.target.value || null)}
                  aria-invalid={!!errors.groupId}
                >
                  {manager ? <option value="">{t('events.churchWide')}</option> : null}
                  {!manager && !field.value ? (
                    <option value="">{t('events.chooseGroup')}</option>
                  ) : null}
                  {selectable.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <Field
                  label={t('events.fieldStarts')}
                  htmlFor="event-starts"
                  error={errors.startsAt?.message}
                  required
                >
                  <ChurchDateTimeInput
                    id="event-starts"
                    value={field.value ?? ''}
                    onChange={(value) => {
                      const previous = field.value;
                      field.onChange(value);
                      // Keep the length of the event when the start moves.
                      const endsAt = form.getValues('endsAt');
                      if (previous && endsAt && value) {
                        const length = new Date(endsAt).getTime() - new Date(previous).getTime();
                        if (length > 0)
                          form.setValue('endsAt', plusMinutes(value, length / 60_000));
                      }
                    }}
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
                  label={t('events.fieldEnds')}
                  htmlFor="event-ends"
                  error={errors.endsAt?.message}
                >
                  <ChurchDateTimeInput
                    id="event-ends"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    aria-invalid={!!errors.endsAt}
                  />
                </Field>
              )}
            />
          </div>
          <Controller
            control={form.control}
            name="isAllDay"
            render={({ field }) => (
              <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-lg border px-3.5 py-2">
                <span className="text-sm font-medium">{t('events.fieldAllDay')}</span>
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
              </label>
            )}
          />
          <Field
            label={t('events.fieldLocation')}
            htmlFor="event-location"
            error={errors.location?.message}
          >
            <Input
              id="event-location"
              placeholder={t('events.locationPlaceholder')}
              {...form.register('location')}
            />
          </Field>
          <Controller
            control={form.control}
            name="description"
            render={({ field }) => (
              <Field
                label={t('events.fieldDescription')}
                htmlFor="event-description"
                error={errors.description?.message}
              >
                <MarkdownEditor
                  id="event-description"
                  ref={field.ref}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  rows={5}
                />
              </Field>
            )}
          />
        </CardContent>
      </Card>

      {!event ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Repeat className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
              <div>
                <h2 className="font-semibold">{t('events.repeatTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('events.repeatHint')}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('events.fieldRepeat')} htmlFor="event-repeat">
                <Select id="event-repeat" {...form.register('repeat')}>
                  <option value="none">{t('events.repeatNone')}</option>
                  {EVENT_RECURRENCE_FREQUENCIES.map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {localize(EVENT_RECURRENCE_LABELS[frequency], locale)}
                    </option>
                  ))}
                </Select>
              </Field>
              {repeat && repeat !== 'none' ? (
                <Field
                  label={t('events.fieldUntil')}
                  htmlFor="event-until"
                  error={untilMessage}
                  required
                >
                  <Input
                    id="event-until"
                    type="date"
                    min={startsAt ? churchDateOf(startsAt, zone) : undefined}
                    aria-invalid={!!errors.untilDate}
                    {...form.register('untilDate')}
                  />
                </Field>
              ) : null}
            </div>
            {repeat === 'monthly' &&
            startsAt &&
            Number(churchDateOf(startsAt, zone).slice(8)) > 28 ? (
              <p className="text-xs text-muted-foreground">{t('events.monthlyShortMonths')}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : event.seriesId ? (
        <Alert variant="info" title={t('events.seriesEditTitle')}>
          {t('events.seriesEditHint')}
        </Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Ticket className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
            <div>
              <h2 className="font-semibold">{t('events.registrationTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('events.registrationHint')}</p>
            </div>
          </div>
          <Controller
            control={form.control}
            name="registrationRequired"
            render={({ field }) => (
              <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-lg border px-3.5 py-2">
                <span className="text-sm font-medium">{t('events.fieldRegistration')}</span>
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
              </label>
            )}
          />
          {registrationRequired ? (
            <div className="grid animate-rise-in gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <Field
                    label={t('events.fieldCapacity')}
                    htmlFor="event-capacity"
                    error={errors.capacity?.message}
                    description={t('events.capacityHint')}
                  >
                    <Input
                      id="event-capacity"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={field.value ?? ''}
                      onChange={(input) =>
                        field.onChange(
                          input.target.value === '' ? null : Number(input.target.value),
                        )
                      }
                      aria-invalid={!!errors.capacity}
                    />
                  </Field>
                )}
              />
              {repeat === 'none' || event ? (
                <Controller
                  control={form.control}
                  name="registrationClosesAt"
                  render={({ field }) => (
                    <Field
                      label={t('events.fieldClosesAt')}
                      htmlFor="event-closes"
                      error={errors.registrationClosesAt?.message}
                      description={t('events.closesHint')}
                    >
                      <ChurchDateTimeInput
                        id="event-closes"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    </Field>
                  )}
                />
              ) : null}
              <Controller
                control={form.control}
                name="waitlistEnabled"
                render={({ field }) => (
                  <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-lg border px-3.5 py-2 sm:col-span-2">
                    <span>
                      <span className="block text-sm font-medium">{t('events.fieldWaitlist')}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t('events.waitlistHint')}
                      </span>
                    </span>
                    <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
                  </label>
                )}
              />
            </div>
          ) : null}
          <Controller
            control={form.control}
            name="checkInEnabled"
            render={({ field }) => (
              <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-lg border px-3.5 py-2">
                <span className="flex items-start gap-3">
                  <ClipboardCheck className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">{t('events.fieldCheckIn')}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t('events.checkInHint')}
                    </span>
                  </span>
                </span>
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
              </label>
            )}
          />
          <Controller
            control={form.control}
            name="coverColor"
            render={({ field }) => (
              <Field label={t('events.fieldColor')}>
                <div
                  role="radiogroup"
                  aria-label={t('events.fieldColor')}
                  className="flex flex-wrap gap-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!field.value}
                    onClick={() => field.onChange(null)}
                    className={cn(
                      'flex h-11 items-center rounded-full border px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                      !field.value
                        ? 'border-primary/40 bg-accent text-accent-foreground'
                        : 'hover:bg-muted',
                    )}
                  >
                    {t('events.colorDefault')}
                  </button>
                  {EVENT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={field.value === color}
                      aria-label={color}
                      onClick={() => field.onChange(color)}
                      className="flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      <span
                        className={cn(
                          'flex size-8 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-card transition-transform',
                          field.value === color && 'scale-110 ring-2 ring-foreground/40',
                        )}
                        style={{ backgroundColor: color }}
                      >
                        {field.value === color ? <Check className="size-4" aria-hidden /> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <FormActions>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={busy}>
          {event
            ? t('common.saveChanges')
            : repeat && repeat !== 'none'
              ? t('events.createSeries')
              : t('events.create')}
        </Button>
      </FormActions>

      <Dialog
        open={!!pending}
        onOpenChange={(open) => (!open && !busy ? setPending(null) : undefined)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('events.scopeDialogTitle')}</DialogTitle>
            <DialogDescription>{t('events.scopeDialogBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => pending && void saveUpdate(pending, 'this')}
            >
              {t('events.scopeThis')}
            </Button>
            <Button
              className="w-full"
              loading={busy}
              onClick={() => pending && void saveUpdate(pending, 'future')}
            >
              {t('events.scopeFuture')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {guard}
    </form>
  );
}
