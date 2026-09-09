import { announcementInputSchema, isAdmin, type Announcement, type AnnouncementInput, type Group } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert, ErrorState, PageLoader } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { groupsQuery } from '@/features/groups/api';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';

type FormInput = z.input<typeof announcementInputSchema>;
const FIELDS = ['title', 'body', 'groupId', 'status'] as const;

type AnnouncementFormProps = {
  announcement?: Announcement;
  defaultGroupId?: string | null;
  onSubmit: (values: AnnouncementInput) => Promise<unknown>;
  onCancel?: () => void;
};

/** Groups load first so the audience select and the form state always agree. */
export function AnnouncementForm(props: AnnouncementFormProps) {
  const { churchId } = useChurch();
  const groups = useQuery(groupsQuery(churchId, { includeInactive: true }));
  if (groups.isPending) return <PageLoader />;
  if (groups.isError) {
    return <ErrorState message={getErrorMessage(groups.error)} onRetry={() => void groups.refetch()} />;
  }
  return <AnnouncementFormFields groups={groups.data.items} {...props} />;
}

function AnnouncementFormFields({
  groups,
  announcement,
  defaultGroupId,
  onSubmit,
  onCancel,
}: AnnouncementFormProps & { groups: Group[] }) {
  const { access } = useChurch();
  const admin = isAdmin(access);
  const selectable = admin ? groups : groups.filter((group) => access.leaderGroupIds.includes(group.id));

  const form = useForm<FormInput, unknown, AnnouncementInput>({
    resolver: zodResolver(announcementInputSchema),
    defaultValues: {
      title: announcement?.title ?? '',
      body: announcement?.body ?? '',
      groupId: announcement?.groupId ?? defaultGroupId ?? (admin ? null : (selectable[0]?.id ?? null)),
      status: announcement?.status ?? 'draft',
    },
  });
  const errors = form.formState.errors;

  const submitWith = (status: 'draft' | 'published') =>
    form.handleSubmit(async (values) => {
      if (!admin && !values.groupId) {
        form.setError('groupId', { message: 'Choose one of the groups you lead' });
        return;
      }
      try {
        await onSubmit({ ...values, status });
      } catch (error) {
        if (!applyServerErrors(error, form.setError, FIELDS)) {
          form.setError('root', { message: getErrorMessage(error) });
        }
      }
    });

  if (!admin && selectable.length === 0) {
    return (
      <Alert variant="warning" title="No audience to publish to">
        You can publish announcements to groups you lead. Ask an administrator to assign you to a group.
      </Alert>
    );
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void submitWith('published')(event)}>
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
            description={admin ? 'Church-wide announcements reach everyone.' : 'You can publish to groups you lead.'}
          >
            <Select
              id="announcement-group"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              aria-invalid={!!errors.groupId}
            >
              {admin ? <option value="">Whole church</option> : null}
              {!admin && !field.value ? <option value="">Select a group…</option> : null}
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
        <Textarea id="announcement-body" rows={8} {...form.register('body')} aria-invalid={!!errors.body} />
      </Field>
      <FormActions>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" variant="outline" loading={form.formState.isSubmitting} onClick={(event) => void submitWith('draft')(event)}>
          Save draft
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          Publish
        </Button>
      </FormActions>
    </form>
  );
}
