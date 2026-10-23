import {
  checkinSessionInputSchema,
  checkinSettingsSchema,
  isModuleEnabled,
  type CheckinSession,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { servicesQuery, settingsQuery, useSaveSession, useSaveSettings } from './api';
import { todayIn, useCheckinAccess } from './checkin-lib';

type SessionForm = z.input<typeof checkinSessionInputSchema>;

/** Opens a check-in session (one per service or date), or renames one. */
export function SessionDialog({
  session,
  open,
  onOpenChange,
}: {
  session?: CheckinSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId, base, church } = useChurch();
  const { t, formatDate, formatTime } = useI18n();
  const { canManage } = useCheckinAccess();
  const navigate = useNavigate();
  const today = todayIn(church.timezone);
  const form = useForm<SessionForm, unknown, z.output<typeof checkinSessionInputSchema>>({
    resolver: zodResolver(checkinSessionInputSchema),
    values: {
      name: session?.name ?? t('checkin.defaultSessionName'),
      date: session?.date ?? today,
      worshipServiceId: session?.worshipServiceId ?? null,
    },
  });
  const errors = form.formState.errors;
  const withWorship = isModuleEnabled(church.enabledModules, 'worship') && canManage;
  const date = useWatch({ control: form.control, name: 'date' });
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '');
  const services = useQuery({
    ...servicesQuery(churchId, date ?? ''),
    enabled: open && withWorship && validDate,
  });
  const linked = session?.worshipServiceId ?? null;
  const options = [
    ...(services.data?.items ?? []),
    // Keep the linked service selectable after the date is changed.
    ...(linked && session?.serviceTitle && !services.data?.items.some((item) => item.id === linked)
      ? [{ id: linked, title: session.serviceTitle, startsAt: null }]
      : []),
  ];
  const save = useMutationToast(useSaveSession(churchId, session?.id), {
    success: (result) =>
      session
        ? t('checkin.sessionSaved', { name: result.session.name })
        : t('checkin.sessionOpened', {
            name: result.session.name,
            date: formatDate(result.session.date, 'dayMonth'),
          }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (!result) return;
    onOpenChange(false);
    if (!session) void navigate(`${base}/checkin/sessions/${result.session.id}`);
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 flex-col gap-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>
              {session ? t('checkin.editSession') : t('checkin.openSession')}
            </DialogTitle>
            {session ? null : <DialogDescription>{t('checkin.openSessionHint')}</DialogDescription>}
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field
              label={t('checkin.sessionName')}
              htmlFor="session-name"
              error={errors.name?.message}
              required
            >
              <Input
                id="session-name"
                autoFocus
                placeholder={t('checkin.sessionNamePlaceholder')}
                aria-invalid={!!errors.name}
                {...form.register('name')}
              />
            </Field>
            <Field
              label={t('checkin.sessionDate')}
              htmlFor="session-date"
              error={errors.date?.message}
              required
            >
              <Input
                id="session-date"
                type="date"
                aria-invalid={!!errors.date}
                {...form.register('date')}
              />
            </Field>
            {withWorship ? (
              <Controller
                control={form.control}
                name="worshipServiceId"
                render={({ field }) => (
                  <Field
                    label={t('checkin.sessionService')}
                    htmlFor="session-service"
                    description={
                      services.isSuccess && options.length === 0
                        ? t('checkin.sessionNoService')
                        : t('checkin.sessionServiceHint')
                    }
                    error={errors.worshipServiceId?.message}
                  >
                    <Select
                      id="session-service"
                      value={field.value ?? ''}
                      disabled={services.isPending && validDate}
                      onChange={(event) => {
                        const id = event.target.value || null;
                        field.onChange(id);
                        const service = options.find((item) => item.id === id);
                        // A fresh session takes the service's name; a typed name stays.
                        if (service && !form.getFieldState('name').isDirty) {
                          form.setValue(
                            'name',
                            t('checkin.sessionNameForService', {
                              service: service.title,
                            }),
                          );
                        }
                      }}
                    >
                      <option value="">{t('checkin.sessionNoServiceOption')}</option>
                      {options.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.startsAt
                            ? `${service.title} · ${formatTime(service.startsAt)}`
                            : service.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                form.reset();
                onOpenChange(false);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {session ? t('common.saveChanges') : t('checkin.openSession')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SettingsForm = z.input<typeof checkinSettingsSchema>;

/** Self check-in from guardians' phones and the oldest age offered for check-in. */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const query = useQuery({ ...settingsQuery(churchId), enabled: open });
  const form = useForm<SettingsForm, unknown, z.output<typeof checkinSettingsSchema>>({
    resolver: zodResolver(checkinSettingsSchema),
    values: query.data?.settings,
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useSaveSettings(churchId), {
    success: t('checkin.settingsSaved'),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (result) onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 flex-col gap-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{t('checkin.settingsTitle')}</DialogTitle>
            <DialogDescription>{t('checkin.settingsHint')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            {query.isPending ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : query.isError ? (
              <ErrorState
                compact
                error={query.error}
                message={getErrorMessage(query.error)}
                onRetry={() => void query.refetch()}
                retrying={query.isFetching}
              />
            ) : (
              <>
                <Controller
                  control={form.control}
                  name="allowSelfCheckIn"
                  render={({ field }) => (
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3.5">
                      <div>
                        <Label htmlFor="settings-self">{t('checkin.allowSelfCheckIn')}</Label>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t('checkin.allowSelfCheckInHint')}
                        </p>
                      </div>
                      <Switch
                        id="settings-self"
                        checked={field.value ?? true}
                        onCheckedChange={field.onChange}
                      />
                    </div>
                  )}
                />
                <Field
                  label={t('checkin.childMaxAge')}
                  htmlFor="settings-age"
                  error={errors.childMaxAge?.message}
                  description={t('checkin.childMaxAgeHint')}
                >
                  <Input
                    id="settings-age"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={25}
                    aria-invalid={!!errors.childMaxAge}
                    {...form.register('childMaxAge', { valueAsNumber: true })}
                  />
                </Field>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!query.data}>
              {t('common.saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
