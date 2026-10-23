import {
  announcementDetailsInputSchema,
  canTargetChurchWide,
  type AnnouncementAudience,
  type AnnouncementDetails,
  type AnnouncementDetailsInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ImageIcon, Pin, Send, Timer } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FormActions } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert, Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { ChurchDateTimeInput } from '@/features/comms/church-time-input';
import { useCommsResolver, useServerErrors } from '@/features/comms/forms';
import { MarkdownEditor } from '@/features/comms/markdown';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { audienceOptionsQuery, useSaveAnnouncement, type AnnouncementFormInput } from './api';
import { AUDIENCE_ICONS } from './announcement-lib';

type Timing = 'now' | 'schedule';

type Props = {
  announcement?: AnnouncementDetails;
  defaultGroupId?: string | null;
  onSaved: (id: string) => void;
  onCancel: () => void;
};

/**
 * The announcement form: audience (church, group or roles), markdown-lite body, cover image,
 * pinning, and publishing now or at a set time with an optional expiry. Options load first, so
 * the audience choice and the form state always agree.
 */
export function AnnouncementForm(props: Props) {
  const { churchId } = useChurch();
  const options = useQuery(audienceOptionsQuery(churchId));
  if (options.isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-11" />
          <Skeleton className="h-48" />
          <Skeleton className="h-11 w-1/2" />
        </CardContent>
      </Card>
    );
  }
  if (options.isError) {
    return (
      <ErrorState
        error={options.error}
        message={getErrorMessage(options.error)}
        onRetry={() => void options.refetch()}
        retrying={options.isFetching}
      />
    );
  }
  return <AnnouncementFormFields options={options.data} {...props} />;
}

function AnnouncementFormFields({
  options,
  announcement,
  defaultGroupId,
  onSaved,
  onCancel,
}: Props & {
  options: {
    churchWide: boolean;
    groups: { id: string; name: string }[];
    roles: { id: string; name: string }[];
  };
}) {
  const { t } = useI18n();
  const { access, churchId } = useChurch();
  const churchWide = options.churchWide && canTargetChurchWide(access);
  const audiences: AnnouncementAudience[] = churchWide ? ['church', 'group', 'roles'] : ['group'];
  const initialGroup =
    announcement?.groupId ??
    (defaultGroupId && options.groups.some((group) => group.id === defaultGroupId)
      ? defaultGroupId
      : churchWide
        ? null
        : (options.groups[0]?.id ?? null));

  const form = useForm<AnnouncementFormInput, unknown, AnnouncementDetailsInput>({
    resolver: useCommsResolver(zodResolver(announcementDetailsInputSchema)),
    defaultValues: {
      title: announcement?.title ?? '',
      body: announcement?.body ?? '',
      audience: announcement?.audience ?? (churchWide && !initialGroup ? 'church' : 'group'),
      groupId: initialGroup,
      roleIds: announcement?.roleIds ?? [],
      status: announcement?.status ?? 'published',
      publishAt: announcement?.publishAt ?? '',
      expiresAt: announcement?.expiresAt ?? '',
      pinned: announcement?.pinned ?? false,
      coverImageUrl: announcement?.coverImageUrl ?? '',
    },
  });
  const serverErrors = useServerErrors(form);
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful);
  const [audience, coverImageUrl, publishAt] = useWatch({
    control: form.control,
    name: ['audience', 'coverImageUrl', 'publishAt'],
  });
  const [timing, setTiming] = useState<Timing>(announcement?.publishAt ? 'schedule' : 'now');
  const [coverFailed, setCoverFailed] = useState(false);

  const save = useMutationToast(useSaveAnnouncement(churchId, announcement?.id), {
    success: (result) =>
      result.announcement.state === 'draft'
        ? t('announcements.savedDraft')
        : result.announcement.state === 'scheduled'
          ? t('announcements.savedScheduled')
          : t('announcements.savedPublished'),
    form: serverErrors,
  });

  const submit = (status: 'draft' | 'published') =>
    form.handleSubmit(async (values) => {
      if (status === 'published' && timing === 'schedule' && !values.publishAt) {
        form.setError(
          'publishAt',
          { message: t('announcements.schedulePick') },
          { shouldFocus: true },
        );
        return;
      }
      const result = await save.run({
        ...values,
        status,
        publishAt: timing === 'schedule' ? values.publishAt : null,
      });
      if (result) onSaved(result.announcement.id);
    });

  if (!churchWide && options.groups.length === 0) {
    return (
      <Alert variant="warning" title={t('announcements.noScopeTitle')}>
        {t('announcements.noScopeBody')}
      </Alert>
    );
  }

  const publishLabel =
    timing === 'schedule'
      ? t('announcements.schedule')
      : announcement?.status === 'published'
        ? t('announcements.saveAndPublish')
        : t('announcements.publish');

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit('published')(event);
      }}
      className="flex flex-col gap-5"
    >
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field
            label={t('announcements.fieldTitle')}
            htmlFor="announcement-title"
            error={errors.title?.message}
            required
          >
            <Input
              id="announcement-title"
              autoFocus
              placeholder={t('announcements.titlePlaceholder')}
              aria-invalid={!!errors.title}
              {...form.register('title')}
            />
          </Field>
          <Controller
            control={form.control}
            name="body"
            render={({ field }) => (
              <Field
                label={t('announcements.fieldBody')}
                htmlFor="announcement-body"
                error={errors.body?.message}
                required
              >
                <MarkdownEditor
                  id="announcement-body"
                  ref={field.ref}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  rows={9}
                  placeholder={t('announcements.bodyPlaceholder')}
                  aria-invalid={!!errors.body}
                />
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div>
            <h2 className="font-semibold">{t('announcements.audienceTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('announcements.audienceHint')}</p>
          </div>
          {audiences.length > 1 ? (
            <Controller
              control={form.control}
              name="audience"
              render={({ field }) => (
                <Segmented
                  aria-label={t('announcements.audienceTitle')}
                  value={field.value ?? 'church'}
                  onChange={(value) => field.onChange(value)}
                  options={audiences.map((value) => ({
                    value,
                    label:
                      value === 'church'
                        ? t('announcements.audienceChurch')
                        : value === 'group'
                          ? t('announcements.audienceGroup')
                          : t('announcements.audienceRoles'),
                    icon: AUDIENCE_ICONS[value],
                  }))}
                />
              )}
            />
          ) : null}
          {audience === 'group' ? (
            <Controller
              control={form.control}
              name="groupId"
              render={({ field }) => (
                <Field
                  label={t('announcements.fieldGroup')}
                  htmlFor="announcement-group"
                  error={errors.groupId?.message}
                  required
                >
                  <Select
                    id="announcement-group"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                    aria-invalid={!!errors.groupId}
                  >
                    <option value="">{t('announcements.chooseGroup')}</option>
                    {options.groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            />
          ) : null}
          {audience === 'roles' ? (
            <Controller
              control={form.control}
              name="roleIds"
              render={({ field }) => {
                const value = field.value ?? [];
                return (
                  <Field
                    label={t('announcements.fieldRoles')}
                    error={errors.roleIds?.message}
                    required
                  >
                    <div
                      role="group"
                      aria-label={t('announcements.fieldRoles')}
                      className="grid gap-1.5 sm:grid-cols-2"
                    >
                      {options.roles.map((role) => {
                        const checked = value.includes(role.id);
                        return (
                          <label
                            key={role.id}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-accent/50"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) =>
                                field.onChange(
                                  next ? [...value, role.id] : value.filter((id) => id !== role.id),
                                )
                              }
                            />
                            {role.name}
                          </label>
                        );
                      })}
                    </div>
                  </Field>
                );
              }}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="font-semibold">{t('announcements.optionsTitle')}</h2>
          <Field
            label={t('announcements.fieldCover')}
            htmlFor="announcement-cover"
            error={errors.coverImageUrl?.message}
            description={t('announcements.coverHint')}
          >
            <Input
              id="announcement-cover"
              type="url"
              inputMode="url"
              placeholder="https://"
              aria-invalid={!!errors.coverImageUrl}
              {...form.register('coverImageUrl', { onChange: () => setCoverFailed(false) })}
            />
          </Field>
          {coverImageUrl && /^https?:\/\//.test(coverImageUrl) ? (
            coverFailed ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ImageIcon className="size-4" aria-hidden />
                {t('announcements.coverBroken')}
              </p>
            ) : (
              <img
                src={coverImageUrl}
                alt=""
                onError={() => setCoverFailed(true)}
                className="aspect-[16/7] w-full rounded-lg border object-cover"
              />
            )
          ) : null}
          {churchWide || announcement?.pinned ? (
            <Controller
              control={form.control}
              name="pinned"
              render={({ field }) => (
                <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5">
                  <Pin className="size-4 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {t('announcements.fieldPinned')}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t('announcements.pinnedHint')}
                    </span>
                  </span>
                  <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                </label>
              )}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="font-semibold">{t('announcements.timingTitle')}</h2>
          <Segmented
            aria-label={t('announcements.timingTitle')}
            value={timing}
            onChange={setTiming}
            options={[
              { value: 'now', label: t('announcements.timingNow'), icon: Send },
              { value: 'schedule', label: t('announcements.timingSchedule'), icon: CalendarClock },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {timing === 'schedule' ? (
              <Controller
                control={form.control}
                name="publishAt"
                render={({ field }) => (
                  <Field
                    label={t('announcements.fieldPublishAt')}
                    htmlFor="announcement-publish"
                    error={errors.publishAt?.message}
                    required
                  >
                    <ChurchDateTimeInput
                      id="announcement-publish"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      aria-invalid={!!errors.publishAt}
                    />
                  </Field>
                )}
              />
            ) : null}
            <Controller
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
                <Field
                  label={t('announcements.fieldExpiresAt')}
                  htmlFor="announcement-expires"
                  error={errors.expiresAt?.message}
                  description={t('announcements.expiresHint')}
                >
                  <ChurchDateTimeInput
                    id="announcement-expires"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    aria-invalid={!!errors.expiresAt}
                  />
                </Field>
              )}
            />
          </div>
          {timing === 'schedule' && !publishAt ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Timer className="size-4" aria-hidden />
              {t('announcements.scheduleHint')}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <FormActions className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur safe-bottom sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={(event) => void submit('draft')(event)}
        >
          {t('announcements.saveDraft')}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {timing === 'schedule' ? <CalendarClock /> : <Send />}
          {publishLabel}
        </Button>
      </FormActions>
      {guard}
    </form>
  );
}
