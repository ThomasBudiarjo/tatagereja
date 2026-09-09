import { eventInputSchema, isAdmin, type Event, type EventInput } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { DateTimeInput } from '@/components/ui/date-time-input';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { groupsQuery } from '@/features/groups/api';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';

type FormInput = z.input<typeof eventInputSchema>;
const FIELDS = [
  'title',
  'description',
  'location',
  'groupId',
  'startsAt',
  'endsAt',
  'isAllDay',
] as const;

const inOneHour = () => {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date.toISOString();
};

export function EventForm({
  event,
  defaultGroupId,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  event?: Event;
  defaultGroupId?: string | null;
  onSubmit: (values: EventInput) => Promise<unknown>;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const { churchId, access } = useChurch();
  const groups = useQuery(groupsQuery(churchId, { includeInactive: true }));
  const admin = isAdmin(access);
  const allGroups = groups.data?.items ?? [];
  const selectableGroups = admin
    ? allGroups
    : allGroups.filter((group) => access.leaderGroupIds.includes(group.id));

  const form = useForm<FormInput, unknown, EventInput>({
    resolver: zodResolver(eventInputSchema),
    defaultValues: {
      title: event?.title ?? '',
      description: event?.description ?? '',
      location: event?.location ?? '',
      groupId:
        event?.groupId ?? defaultGroupId ?? (admin ? null : (selectableGroups[0]?.id ?? null)),
      startsAt: event?.startsAt ?? inOneHour(),
      endsAt: event?.endsAt ?? '',
      isAllDay: event?.isAllDay ?? false,
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

  return (
    <form onSubmit={(event_) => void submit(event_)} className="flex flex-col gap-4" noValidate>
      {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}
      <Field label="Title" htmlFor="event-title" error={errors.title?.message} required>
        <Input id="event-title" {...form.register('title')} aria-invalid={!!errors.title} />
      </Field>
      <Controller
        control={form.control}
        name="groupId"
        render={({ field }) => (
          <Field
            label="Scope"
            htmlFor="event-group"
            error={errors.groupId?.message}
            description={
              admin
                ? 'Church-wide events are visible to everyone.'
                : 'You can create events for groups you lead.'
            }
          >
            <Select
              id="event-group"
              value={field.value ?? ''}
              onChange={(selectEvent) => field.onChange(selectEvent.target.value || null)}
              disabled={groups.isPending}
            >
              {admin ? <option value="">Church-wide</option> : null}
              {selectableGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="startsAt"
        render={({ field }) => (
          <Field label="Starts" htmlFor="event-starts" error={errors.startsAt?.message} required>
            <DateTimeInput
              id="event-starts"
              value={field.value ?? ''}
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
            label="Ends"
            htmlFor="event-ends"
            error={errors.endsAt?.message}
            description="Optional."
          >
            <DateTimeInput
              id="event-ends"
              value={field.value ?? ''}
              onChange={field.onChange}
              aria-invalid={!!errors.endsAt}
            />
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="isAllDay"
        render={({ field }) => (
          <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <span className="text-sm font-medium">All-day event</span>
            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
          </label>
        )}
      />
      <Field label="Location" htmlFor="event-location" error={errors.location?.message}>
        <Input id="event-location" {...form.register('location')} />
      </Field>
      <Field label="Description" htmlFor="event-description" error={errors.description?.message}>
        <Textarea id="event-description" rows={3} {...form.register('description')} />
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
