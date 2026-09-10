import {
  GROUP_TYPES,
  GROUP_TYPE_LABELS,
  groupInputSchema,
  type Group,
  type GroupInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';

type FormInput = z.input<typeof groupInputSchema>;
const FIELDS = ['name', 'description', 'type', 'meetingSchedule', 'isActive'] as const;

export function GroupForm({
  group,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  group?: Group;
  onSubmit: (values: GroupInput) => Promise<unknown>;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const form = useForm<FormInput, unknown, GroupInput>({
    resolver: zodResolver(groupInputSchema),
    defaultValues: {
      name: group?.name ?? '',
      description: group?.description ?? '',
      type: group?.type ?? 'ministry',
      meetingSchedule: group?.meetingSchedule ?? '',
      isActive: group?.isActive ?? true,
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
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}
      <Field label="Group name" htmlFor="group-name" error={errors.name?.message} required>
        <Input id="group-name" {...form.register('name')} aria-invalid={!!errors.name} />
      </Field>
      <Field label="Type" htmlFor="group-type" error={errors.type?.message}>
        <Select id="group-type" {...form.register('type')}>
          {GROUP_TYPES.map((type) => (
            <option key={type} value={type}>
              {GROUP_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Meeting schedule"
        htmlFor="meetingSchedule"
        error={errors.meetingSchedule?.message}
        description="Free text, e.g. “Every Friday, 7pm”."
      >
        <Input id="meetingSchedule" {...form.register('meetingSchedule')} />
      </Field>
      <Field label="Description" htmlFor="group-description" error={errors.description?.message}>
        <Textarea id="group-description" rows={3} {...form.register('description')} />
      </Field>
      <Controller
        control={form.control}
        name="isActive"
        render={({ field }) => (
          <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <span className="text-sm">
              <span className="font-medium">Active</span>
              <span className="block text-muted-foreground">
                Inactive groups are hidden from the group list by default.
              </span>
            </span>
            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
          </label>
        )}
      />
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
