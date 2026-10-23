import {
  GROUP_TYPES,
  GROUP_TYPE_TEXT,
  GROUP_VISIBILITY_LABELS,
  MEETING_FREQUENCIES,
  MEETING_FREQUENCY_LABELS,
  WEEKDAY_TEXT,
  groupDetailsInputSchema,
  localize,
  type GroupDetails,
  type GroupDetailsInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Globe, Lock } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ColorSwatches, GroupCover } from '@/features/people/people-ui';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useCreateGroup, useUpdateGroup } from './api';

type FormInput = z.input<typeof groupDetailsInputSchema>;
const FIELDS = [
  'name',
  'description',
  'type',
  'meetingDay',
  'meetingTime',
  'meetingFrequency',
  'location',
  'capacity',
  'coverColor',
  'visibility',
  'joinPolicy',
  'isActive',
];

/** Create or edit a group: schedule, place, capacity, colour and who can find and join it. */
export function GroupFormDialog({
  group,
  open,
  onOpenChange,
  onSaved,
}: {
  group?: GroupDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (group: GroupDetails) => void;
}) {
  const { churchId } = useChurch();
  const { t, locale } = useI18n();
  const form = useForm<FormInput, unknown, GroupDetailsInput>({
    resolver: zodResolver(groupDetailsInputSchema),
    defaultValues: {
      name: group?.name ?? '',
      description: group?.description ?? '',
      type: group?.type ?? 'ministry',
      meetingSchedule: group?.meetingSchedule ?? '',
      isActive: group?.isActive ?? true,
      meetingDay: group?.meetingDay ?? null,
      meetingTime: group?.meetingTime ?? null,
      meetingFrequency: group?.meetingFrequency ?? null,
      location: group?.location ?? '',
      capacity: group?.capacity ?? null,
      coverColor: group?.coverColor ?? null,
      visibility: group?.visibility ?? 'public',
      joinPolicy: group?.joinPolicy ?? 'request',
    },
  });
  const create = useMutationToast(useCreateGroup(churchId), {
    success: (data) => t('groups.created', { name: data.group.name }),
    form,
    fields: FIELDS,
  });
  const update = useMutationToast(useUpdateGroup(churchId, group?.id ?? ''), {
    success: t('groups.saved'),
    form,
    fields: FIELDS,
  });
  const pending = create.isPending || update.isPending;
  const errors = form.formState.errors;
  const [type = 'ministry', color, visibility] = useWatch({
    control: form.control,
    name: ['type', 'coverColor', 'visibility'],
  });
  const submit = form.handleSubmit(async (values) => {
    const result = group ? await update.run(values) : await create.run(values);
    if (!result) return;
    form.reset(values);
    onOpenChange(false);
    onSaved?.(result.group);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{group ? t('groups.edit') : t('groups.new')}</DialogTitle>
          <DialogDescription>{t('groups.formHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="group-form"
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="flex items-end gap-3">
              <GroupCover type={type} color={color ?? null} size="lg" />
              <Field
                label={t('groups.name')}
                htmlFor="group-name"
                error={errors.name?.message}
                required
                className="min-w-0 flex-1"
              >
                <Input
                  id="group-name"
                  autoFocus
                  placeholder={t('groups.namePlaceholder')}
                  {...form.register('name')}
                  aria-invalid={!!errors.name}
                />
              </Field>
            </div>
            <Field label={t('groups.type')} htmlFor="group-type">
              <Select id="group-type" {...form.register('type')}>
                {GROUP_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {localize(GROUP_TYPE_TEXT[value], locale)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t('groups.descriptionLabel')}
              htmlFor="group-description"
              error={errors.description?.message}
            >
              <Textarea id="group-description" rows={3} {...form.register('description')} />
            </Field>
            <fieldset className="flex flex-col gap-3 rounded-xl border border-border/70 p-3.5">
              <legend className="px-1 text-sm font-semibold">{t('groups.schedule')}</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t('groups.frequency')} htmlFor="group-frequency">
                  <Controller
                    control={form.control}
                    name="meetingFrequency"
                    render={({ field }) => (
                      <Select
                        id="group-frequency"
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value || null)}
                      >
                        <option value="">{t('groups.noSchedule')}</option>
                        {MEETING_FREQUENCIES.map((value) => (
                          <option key={value} value={value}>
                            {localize(MEETING_FREQUENCY_LABELS[value], locale)}
                          </option>
                        ))}
                      </Select>
                    )}
                  />
                </Field>
                <Field
                  label={t('groups.day')}
                  htmlFor="group-day"
                  error={errors.meetingDay?.message}
                >
                  <Controller
                    control={form.control}
                    name="meetingDay"
                    render={({ field }) => (
                      <Select
                        id="group-day"
                        value={
                          field.value === null || field.value === undefined
                            ? ''
                            : String(field.value)
                        }
                        onChange={(event) =>
                          field.onChange(
                            event.target.value === '' ? null : Number(event.target.value),
                          )
                        }
                      >
                        <option value="">—</option>
                        {WEEKDAY_TEXT.map((day, index) => (
                          <option key={day.en} value={index}>
                            {localize(day, locale)}
                          </option>
                        ))}
                      </Select>
                    )}
                  />
                </Field>
                <Field
                  label={t('groups.time')}
                  htmlFor="group-time"
                  error={errors.meetingTime?.message}
                >
                  <Controller
                    control={form.control}
                    name="meetingTime"
                    render={({ field }) => (
                      <Input
                        id="group-time"
                        type="time"
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value || null)}
                        aria-invalid={!!errors.meetingTime}
                      />
                    )}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <Field
                  label={t('groups.location')}
                  htmlFor="group-location"
                  error={errors.location?.message}
                >
                  <Input
                    id="group-location"
                    placeholder={t('groups.locationPlaceholder')}
                    {...form.register('location')}
                  />
                </Field>
                <Field
                  label={t('groups.capacity')}
                  htmlFor="group-capacity"
                  error={errors.capacity?.message}
                  description={t('groups.capacityHint')}
                >
                  <Controller
                    control={form.control}
                    name="capacity"
                    render={({ field }) => (
                      <Input
                        id="group-capacity"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={field.value ?? ''}
                        onChange={(event) =>
                          field.onChange(
                            event.target.value === '' ? null : Number(event.target.value),
                          )
                        }
                        aria-invalid={!!errors.capacity}
                      />
                    )}
                  />
                </Field>
              </div>
            </fieldset>
            <Field label={t('groups.color')}>
              <Controller
                control={form.control}
                name="coverColor"
                render={({ field }) => (
                  <ColorSwatches
                    value={field.value}
                    onChange={field.onChange}
                    label={t('groups.color')}
                  />
                )}
              />
            </Field>
            <Field
              label={t('groups.visibility')}
              description={
                visibility === 'private'
                  ? localize(GROUP_VISIBILITY_LABELS.private, locale)
                  : localize(GROUP_VISIBILITY_LABELS.public, locale)
              }
            >
              <Controller
                control={form.control}
                name="visibility"
                render={({ field }) => (
                  <Segmented
                    aria-label={t('groups.visibility')}
                    value={field.value ?? 'public'}
                    onChange={field.onChange}
                    options={[
                      { value: 'public', label: t('groups.public'), icon: Globe },
                      { value: 'private', label: t('groups.private'), icon: Lock },
                    ]}
                  />
                )}
              />
            </Field>
            <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/70">
              <Controller
                control={form.control}
                name="joinPolicy"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-sm">
                    <span>
                      <span className="block font-medium">{t('groups.acceptRequests')}</span>
                      <span className="block text-muted-foreground">
                        {t('groups.acceptRequestsHint')}
                      </span>
                    </span>
                    <Switch
                      checked={field.value !== 'closed'}
                      disabled={visibility === 'private'}
                      onCheckedChange={(checked) => field.onChange(checked ? 'request' : 'closed')}
                    />
                  </label>
                )}
              />
              <Controller
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-sm">
                    <span>
                      <span className="block font-medium">{t('groups.active')}</span>
                      <span className="block text-muted-foreground">{t('groups.activeHint')}</span>
                    </span>
                    <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
                  </label>
                )}
              />
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="group-form" loading={pending}>
            {group ? t('common.saveChanges') : t('groups.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
