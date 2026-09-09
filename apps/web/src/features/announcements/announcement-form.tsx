import {
  announcementInputSchema,
  isAdmin,
  type Announcement,
  type AnnouncementInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { groupsQuery } from '@/features/groups/api';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';

type FormInput = z.input<typeof announcementInputSchema>;
const FIELDS = ['title', 'body', 'groupId', 'status'] as const;

export function AnnouncementForm({
  announcement,
  defaultGroupId,
  onSubmit,
  onCancel,
}: {
  announcement?: Announcement;
  defaultGroupId?: string | null;
  onSubmit: (values: AnnouncementInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const { churchId, access } = useChurch();
  const groups = useQuery(groupsQuery(churchId, { includeInactive: true }));
  const admin = isAdmin(access);
  const selectable = (groups.data?.items ?? []).filter(
    (group) => admin || access.leaderGroupIds.includes(group.id),
  );

  const form = useForm<FormInput, unknown, AnnouncementInput>({
    resolver: zodResolver(announcementInputSchema),
    defaultValues: {
      title: announcement?.title ?? '',
      body: announcement?.body ?? '',
      groupId:
        announcement?.groupId ?? defaultGroupId ?? (admin ? null : (selectable[0]?.id ?? null)),
      status: announcement?.status ?? 'draft',
    },
  });
  const errors = form.formState.errors;

  const submitWith = (status: 'draft' | 'published') =>
    form.handleSubmit(async (values) => {
      try {
        await onSubmit({ ...values, status });
      } catch (error) {
        if (!applyServerErrors(error, form.setError, FIELDS)) {
          form.setError('root', { message: getErrorMessage(error) });
        }
      }
    });

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => void submitWith('published')(event)}
    >
      {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}
      <Field label="Title" htmlFor="announcement-title" error={errors.title?.message} required>
        <Input id="announcement-title" {...form.register('title')} aria-invalid={!!errors.title} />
      </Field>
      <Controller
        control={form.control}
        name="groupId"
        render={({ field }) => (
          <Field
            label="Audience"
            htmlFor="announcement-group"
            error={errors.groupId?.message}
            description={
              admin
                ? 'Church-wide announcements reach everyone.'
                : 'You can publish to groups you lead.'
            }
          >
            <Select
              id="announcement-group"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              disabled={groups.isPending}
            >
              {admin ? <option value="">Whole church</option> : null}
              {selectable.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      />
      <Field label="Message" htmlFor="announcement-body" error={errors.body?.message} required>
        <Textarea
          id="announcement-body"
          rows={8}
          {...form.register('body')}
          aria-invalid={!!errors.body}
        />
      </Field>
      <FormActions>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          loading={form.formState.isSubmitting}
          onClick={(event) => void submitWith('draft')(event)}
        >
          Save draft
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          Publish
        </Button>
      </FormActions>
    </form>
  );
}
