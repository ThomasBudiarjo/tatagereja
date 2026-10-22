import { volunteerBlockoutInputSchema, type VolunteerBlockout } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CalendarOff, CalendarPlus, Link2Off, Trash2, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { blockoutsQuery, myScheduleQuery, useAddBlockout, useDeleteBlockout } from './api';
import { ScheduleCard } from './respond';
import { WorshipNav } from './worship-ui';
import { WORSHIP_TONE, useWorshipMe } from './worship-lib';

type Scope = 'upcoming' | 'past';

/** Every member's own serving schedule: reply to assignments and keep unavailable dates. */
export function MySchedulePage() {
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const me = useWorshipMe();
  const [state, setState] = useUrlState({ scope: 'upcoming' });
  const scope: Scope = state.scope === 'past' ? 'past' : 'upcoming';
  const schedule = useQuery(myScheduleQuery(churchId, scope));
  const linked = me.data ? !!me.data.personId : true;

  return (
    <Page size="wide">
      <PageHeader
        title={t('worship.myTitle')}
        description={t('worship.myDescription')}
        icon={UserRoundCheck}
        tone={WORSHIP_TONE}
        breadcrumbs={[
          { label: t('worship.nav'), to: `${base}/worship` },
          { label: t('worship.myTitle') },
        ]}
      />
      <WorshipNav />
      {!linked ? (
        <EmptyState
          icon={Link2Off}
          tone="warning"
          title={t('worship.notLinked')}
          description={t('worship.notLinkedBody')}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Section>
            <Segmented<Scope>
              aria-label={t('worship.myTitle')}
              value={scope}
              onChange={(value) => setState({ scope: value })}
              className="sm:max-w-xs"
              options={[
                { value: 'upcoming', label: t('worship.scopeUpcoming') },
                { value: 'past', label: t('worship.scopePast') },
              ]}
            />
            {schedule.isPending ? (
              <SkeletonList rows={4} avatar={false} />
            ) : schedule.isError ? (
              <ErrorState
                error={schedule.error}
                message={getErrorMessage(schedule.error)}
                onRetry={() => void schedule.refetch()}
                retrying={schedule.isFetching}
              />
            ) : schedule.data.items.length === 0 ? (
              <EmptyState
                icon={UserRoundCheck}
                tone={WORSHIP_TONE}
                title={scope === 'upcoming' ? t('worship.myEmpty') : t('worship.myPastEmpty')}
                description={scope === 'upcoming' ? t('worship.myEmptyBody') : undefined}
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                {schedule.data.items.map((item) => (
                  <ScheduleCard key={item.id} item={item} actions={scope === 'upcoming'} />
                ))}
              </div>
            )}
          </Section>
          <Blockouts />
        </div>
      )}
    </Page>
  );
}

function Blockouts() {
  const { churchId } = useChurch();
  const { t, formatDate } = useI18n();
  const query = useQuery(blockoutsQuery(churchId));
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<VolunteerBlockout | null>(null);
  const remove = useMutationToast(useDeleteBlockout(churchId), {
    success: t('worship.blockoutRemoved'),
  });
  const today = new Date().toISOString().slice(0, 10);
  const range = (item: Pick<VolunteerBlockout, 'startDate' | 'endDate'>) =>
    item.startDate === item.endDate
      ? formatDate(item.startDate, 'dateLong')
      : `${formatDate(item.startDate, 'dayMonth')} – ${formatDate(item.endDate, 'dateShort')}`;
  const items = (query.data?.items ?? []).filter((item) => item.endDate >= today);

  return (
    <Section
      title={t('worship.blockouts')}
      description={t('worship.blockoutsDescription')}
      icon={CalendarOff}
      action={
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <CalendarPlus />
          {t('worship.addBlockout')}
        </Button>
      }
    >
      {query.isPending ? (
        <SkeletonList rows={2} avatar={false} />
      ) : query.isError ? (
        <ErrorState
          compact
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarOff}
          tone="slate"
          title={t('worship.noBlockouts')}
          description={t('worship.noBlockoutsBody')}
        />
      ) : (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
          {items.map((item) => (
            <li key={item.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <span
                data-tone="slate"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tone-soft text-tone-ink"
                aria-hidden
              >
                <CalendarOff className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{range(item)}</p>
                {item.reason ? (
                  <p className="truncate text-xs text-muted-foreground">{item.reason}</p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                aria-label={t('worship.removeBlockout')}
                onClick={() => setRemoving(item)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <BlockoutDialog open={adding} onOpenChange={setAdding} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => (!open ? setRemoving(null) : undefined)}
        title={t('worship.removeBlockoutTitle', { range: removing ? range(removing) : '' })}
        description={t('worship.removeBlockoutBody')}
        confirmLabel={t('common.remove')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (removing && (await remove.run(removing.id))) setRemoving(null);
        }}
      />
    </Section>
  );
}

type BlockoutForm = z.input<typeof volunteerBlockoutInputSchema>;

function BlockoutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const form = useForm<BlockoutForm, unknown, z.output<typeof volunteerBlockoutInputSchema>>({
    resolver: zodResolver(volunteerBlockoutInputSchema),
    defaultValues: { startDate: today, endDate: today, reason: '' },
  });
  const errors = form.formState.errors;
  const startDate = useWatch({ control: form.control, name: 'startDate' });
  const add = useMutationToast(useAddBlockout(churchId), {
    success: t('worship.blockoutAdded'),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    if (await add.run(values)) {
      form.reset();
      onOpenChange(false);
    }
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
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t('worship.blockoutTitle')}</DialogTitle>
            <DialogDescription>{t('worship.blockoutsDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('worship.blockoutFrom')}
              htmlFor="blockout-from"
              error={errors.startDate?.message}
              required
            >
              <Input
                id="blockout-from"
                type="date"
                autoFocus
                min={today}
                aria-invalid={!!errors.startDate}
                {...form.register('startDate', {
                  onChange: (event: { target: { value: string } }) => {
                    if (form.getValues('endDate') < event.target.value) {
                      form.setValue('endDate', event.target.value);
                    }
                  },
                })}
              />
            </Field>
            <Field
              label={t('worship.blockoutTo')}
              htmlFor="blockout-to"
              error={errors.endDate?.message}
              required
            >
              <Input
                id="blockout-to"
                type="date"
                min={startDate || today}
                aria-invalid={!!errors.endDate}
                {...form.register('endDate')}
              />
            </Field>
          </div>
          <Field
            label={t('worship.blockoutReason')}
            htmlFor="blockout-reason"
            error={errors.reason?.message}
          >
            <Input
              id="blockout-reason"
              placeholder={t('worship.blockoutReasonPlaceholder')}
              {...form.register('reason')}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={add.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
