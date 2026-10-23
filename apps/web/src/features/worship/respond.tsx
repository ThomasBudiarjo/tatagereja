import {
  rosterRespondBodySchema,
  type MyScheduleItem,
  type RosterAssignment,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Clock, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { useRespondToAssignment } from './api';
import { withMessages } from './worship-lib';
import { ConflictBadges, DateTile, RosterStatusBadge } from './worship-ui';

type RespondForm = z.input<typeof rosterRespondBodySchema>;

/** Asks for the reason before declining; the reason reaches the scheduler. */
export function DeclineDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: Pick<RosterAssignment, 'id' | 'serviceId' | 'positionName'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const form = useForm<RespondForm, unknown, z.output<typeof rosterRespondBodySchema>>({
    resolver: withMessages(zodResolver(rosterRespondBodySchema), {
      reason: () => t('worship.declineReasonRequired'),
    }),
    defaultValues: { status: 'declined', reason: '' },
  });
  const respond = useMutationToast(useRespondToAssignment(churchId), {
    success: t('worship.declined'),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const done = await respond.run({
      id: assignment.id,
      serviceId: assignment.serviceId,
      ...values,
    });
    if (done) {
      form.reset();
      onOpenChange(false);
    }
  });
  const error = form.formState.errors.reason?.message;
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
            <DialogTitle>{t('worship.declineTitle')}</DialogTitle>
            <DialogDescription>{t('worship.declineBody')}</DialogDescription>
          </DialogHeader>
          <Field label={t('worship.declineReason')} htmlFor="decline-reason" error={error} required>
            <Input
              id="decline-reason"
              autoFocus
              placeholder={t('worship.declineReasonPlaceholder')}
              aria-invalid={!!error}
              aria-describedby={error ? 'decline-reason-error' : undefined}
              {...form.register('reason')}
            />
          </Field>
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
            <Button type="submit" variant="destructive" loading={respond.isPending}>
              {t('worship.declineConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Accept and decline buttons for one assignment (the volunteer, or a scheduler for them). */
export function RespondButtons({
  assignment,
  size = 'sm',
  className,
}: {
  assignment: Pick<RosterAssignment, 'id' | 'serviceId' | 'status' | 'positionName'>;
  size?: 'sm' | 'default';
  className?: string;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const [declining, setDeclining] = useState(false);
  const respond = useMutationToast(useRespondToAssignment(churchId), {
    success: t('worship.accepted'),
  });
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {assignment.status !== 'accepted' ? (
        <Button
          size={size}
          variant={assignment.status === 'pending' ? 'default' : 'outline'}
          loading={respond.isPending}
          onClick={() =>
            void respond.run({
              id: assignment.id,
              serviceId: assignment.serviceId,
              status: 'accepted',
              reason: null,
            })
          }
        >
          {!respond.isPending ? <Check /> : null}
          {t('worship.accept')}
        </Button>
      ) : null}
      {assignment.status !== 'declined' ? (
        <Button size={size} variant="outline" onClick={() => setDeclining(true)}>
          <X />
          {t('worship.decline')}
        </Button>
      ) : null}
      <DeclineDialog assignment={assignment} open={declining} onOpenChange={setDeclining} />
    </div>
  );
}

/** One of the caller's assignments: when, where, as what, and the reply. */
export function ScheduleCard({
  item,
  actions = true,
  className,
}: {
  item: MyScheduleItem;
  actions?: boolean;
  className?: string;
}) {
  const { base } = useChurch();
  const { t, formatTime, formatDate } = useI18n();
  return (
    <article
      className={cn(
        'flex animate-rise-in flex-col gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-soft sm:p-4',
        item.status === 'pending' && 'border-warning/40',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <DateTile iso={item.serviceStartsAt} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <Link
              to={`${base}/worship/services/${item.serviceId}`}
              className="min-w-0 truncate font-semibold tracking-tight hover:underline"
            >
              {item.serviceTitle}
            </Link>
            <RosterStatusBadge status={item.status} />
          </div>
          <p className="text-sm font-medium">
            {item.teamName} ·{' '}
            <span data-tone="violet" className="text-tone-ink">
              {item.positionName}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1 tabular">
              <Clock className="size-3.5" aria-hidden />
              {formatDate(item.serviceStartsAt, 'weekday')}, {formatTime(item.serviceStartsAt)}
            </span>
            {item.serviceLocation ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{item.serviceLocation}</span>
              </span>
            ) : null}
          </p>
          {item.status === 'declined' && item.declineReason ? (
            <p className="text-sm text-muted-foreground">
              {t('worship.reasonShown', { reason: item.declineReason })}
            </p>
          ) : null}
          <ConflictBadges conflicts={item.conflicts} hideDeclined className="mt-0.5" />
        </div>
      </div>
      {actions ? <RespondButtons assignment={item} className="sm:pl-[4.375rem]" /> : null}
    </article>
  );
}
