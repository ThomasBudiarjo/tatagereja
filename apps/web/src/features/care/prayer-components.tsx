import {
  PRAYER_MODERATION_LABELS,
  PRAYER_VISIBILITIES,
  localize,
  prayerRequestInputSchema,
  type PrayerRequest,
  type PrayerRequestInput,
  type PrayerVisibility,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  CircleCheckBig,
  EyeOff,
  HandHeart,
  Lock,
  Pencil,
  Quote,
  RotateCcw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
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
import { RowActions } from '@/components/ui/row-actions';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { StatusBadge } from '@/components/ui/status-badge';
import type { Tone } from '@/components/ui/tone';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import {
  useAnswerPrayer,
  useDeletePrayer,
  useModeratePrayer,
  usePray,
  useSavePrayerRequest,
} from './api';
import { ToggleRow, VisibilityBadge } from './components';

const VISIBILITY_OPTIONS: Record<
  PrayerVisibility,
  {
    icon: React.ComponentType<{ className?: string }>;
    labelKey: MessageKey;
    hintKey: MessageKey;
    tone: Tone;
  }
> = {
  church: {
    icon: Users,
    labelKey: 'care.visibilityChurch',
    hintKey: 'care.visibilityChurchHint',
    tone: 'brand',
  },
  care_team: {
    icon: ShieldCheck,
    labelKey: 'care.visibilityCareTeam',
    hintKey: 'care.visibilityCareTeamHint',
    tone: 'info',
  },
  pastors: {
    icon: Lock,
    labelKey: 'care.visibilityPastors',
    hintKey: 'care.visibilityPastorsHint',
    tone: 'violet',
  },
};

type FormValues = z.input<typeof prayerRequestInputSchema>;

/** Shares or edits a prayer request in a sheet. */
export function PrayerSheet({
  open,
  onOpenChange,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request?: PrayerRequest | null;
}) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{request ? t('care.editPrayer') : t('care.newPrayer')}</SheetTitle>
          <SheetDescription>{t('care.newPrayerDescription')}</SheetDescription>
        </SheetHeader>
        {open ? (
          <PrayerForm
            key={request?.id ?? 'new'}
            request={request ?? undefined}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PrayerForm({ request, onDone }: { request?: PrayerRequest; onDone: () => void }) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const form = useForm<FormValues, unknown, PrayerRequestInput>({
    resolver: zodResolver(prayerRequestInputSchema),
    defaultValues: {
      title: request?.title ?? '',
      body: request?.body ?? '',
      visibility: request?.visibility ?? 'church',
      isAnonymous: request?.isAnonymous ?? false,
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useSavePrayerRequest(churchId), {
    success: (data) =>
      data.request.moderationStatus === 'pending'
        ? t('care.prayerWaitsForReview')
        : request
          ? t('care.prayerSaved')
          : t('care.prayerShared'),
    form,
  });
  const onSubmit = form.handleSubmit(async (values) => {
    if (await save.run({ ...values, id: request?.id })) onDone();
  });
  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <SheetBody className="flex flex-col gap-4">
        <Field
          label={t('care.prayerTopic')}
          htmlFor="prayer-title"
          error={errors.title?.message}
          required
        >
          <Input
            id="prayer-title"
            autoFocus
            placeholder={t('care.prayerTopicPlaceholder')}
            aria-invalid={!!errors.title}
            {...form.register('title')}
          />
        </Field>
        <Field
          label={t('care.prayerBody')}
          htmlFor="prayer-body"
          error={errors.body?.message}
          required
        >
          <Textarea
            id="prayer-body"
            rows={5}
            placeholder={t('care.prayerBodyPlaceholder')}
            aria-invalid={!!errors.body}
            {...form.register('body')}
          />
        </Field>
        <Field label={t('care.shareWith')}>
          <Controller
            control={form.control}
            name="visibility"
            render={({ field }) => (
              <div
                role="radiogroup"
                aria-label={t('care.shareWith')}
                className="flex flex-col gap-2"
              >
                {PRAYER_VISIBILITIES.map((value) => {
                  const option = VISIBILITY_OPTIONS[value];
                  const selected = (field.value ?? 'church') === value;
                  return (
                    <label
                      key={value}
                      data-tone={option.tone}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30',
                        selected
                          ? 'border-tone bg-tone-soft/50'
                          : 'border-border/80 hover:bg-muted/50',
                      )}
                    >
                      <input
                        type="radio"
                        name="prayer-visibility"
                        value={value}
                        checked={selected}
                        onChange={() => field.onChange(value)}
                        className="sr-only"
                      />
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tone-soft text-tone-ink">
                        <option.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{t(option.labelKey)}</span>
                        <span className="block text-xs text-pretty text-muted-foreground">
                          {t(option.hintKey)}
                        </span>
                      </span>
                      {selected ? <Check className="mt-1 size-4 text-tone-ink" /> : null}
                    </label>
                  );
                })}
              </div>
            )}
          />
        </Field>
        <Controller
          control={form.control}
          name="isAnonymous"
          render={({ field }) => (
            <ToggleRow
              id="prayer-anonymous"
              label={t('care.anonymous')}
              description={t('care.anonymousHint')}
              checked={!!field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {request ? t('common.saveChanges') : t('care.sendPrayer')}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** "I prayed": instant, counted once per short window on the server. */
export function PrayButton({ request, className }: { request: PrayerRequest; className?: string }) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const pray = useMutationToast(usePray(churchId), { success: false });
  if (request.answeredAt || request.moderationStatus !== 'approved') return null;
  return (
    <Button
      variant={request.prayedByMe ? 'soft' : 'outline'}
      size="sm"
      aria-pressed={request.prayedByMe}
      className={cn('pressable', className)}
      onClick={() => void pray.run(request.id)}
    >
      {request.prayedByMe ? <Check className="animate-in zoom-in-50" /> : <HandHeart />}
      {request.prayedByMe ? t('care.prayed') : t('care.iPrayed')}
    </Button>
  );
}

const MODERATION_TONES: Record<PrayerRequest['moderationStatus'], Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'neutral',
};

/** A prayer request card for the wall, the answered list, my requests and the review queue. */
export function PrayerCard({
  request,
  onEdit,
  onAnswer,
  onDeleted,
  showStatus = false,
  moderation = false,
}: {
  request: PrayerRequest;
  onEdit?: (request: PrayerRequest) => void;
  onAnswer?: (request: PrayerRequest) => void;
  onDeleted?: () => void;
  showStatus?: boolean;
  moderation?: boolean;
}) {
  const { t, locale, formatRelative, formatDate } = useI18n();
  const { churchId, base } = useChurch();
  const [deleting, setDeleting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const remove = useMutationToast(useDeletePrayer(churchId), { success: t('care.prayerDeleted') });
  const moderate = useMutationToast(useModeratePrayer(churchId), {
    success: (_data, variables) =>
      variables.decision === 'approved' ? t('care.prayerApproved') : t('care.prayerRejected'),
  });
  const answer = useMutationToast(useAnswerPrayer(churchId), { success: t('care.prayerReopened') });
  const name = request.requesterName ?? t('care.anonymousName');

  return (
    <article className="flex min-w-0 animate-rise-in flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
      <header className="flex items-start gap-3">
        {request.requesterName ? (
          <EntityAvatar name={name} src={request.requesterAvatarUrl} size="sm" />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <EyeOff className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {name}
            {request.isAnonymous && request.requesterName ? (
              <span className="ml-1.5 font-normal text-muted-foreground">
                ({t('care.anonymousToOthers')})
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">{formatRelative(request.createdAt)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {request.visibility !== 'church' ? (
            <VisibilityBadge visibility={request.visibility} />
          ) : null}
          {showStatus && request.visibility === 'church' ? (
            <StatusBadge tone={MODERATION_TONES[request.moderationStatus]} size="sm" dot>
              {localize(PRAYER_MODERATION_LABELS[request.moderationStatus], locale)}
            </StatusBadge>
          ) : null}
          <RowActions
            label={t('care.prayerActions', { title: request.title })}
            actions={[
              {
                id: 'edit',
                label: t('common.edit'),
                icon: Pencil,
                hidden: !request.isMine || !onEdit,
                onSelect: () => onEdit?.(request),
              },
              {
                id: 'answer',
                label: request.answeredAt ? t('care.editTestimony') : t('care.markAnswered'),
                icon: CircleCheckBig,
                // A declined testimony can be rewritten; a declined request is not answered.
                hidden:
                  !request.canManage ||
                  !onAnswer ||
                  (request.moderationStatus === 'rejected' && !request.answeredAt),
                onSelect: () => onAnswer?.(request),
              },
              {
                id: 'reopen',
                label: t('care.stillPraying'),
                icon: RotateCcw,
                hidden: !request.canManage || !request.answeredAt,
                onSelect: () => void answer.run({ id: request.id, reopen: true }),
              },
              {
                id: 'delete',
                label: request.isMine ? t('care.withdrawPrayer') : t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !request.canManage,
                onSelect: () => setDeleting(true),
              },
            ]}
          />
        </div>
      </header>
      <Link
        to={`${base}/care/prayer/${request.id}`}
        className="group -m-1 rounded-lg p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <h3 className="font-semibold text-balance group-hover:underline group-hover:underline-offset-2">
          {request.title}
        </h3>
        <p className="mt-1 line-clamp-4 text-sm whitespace-pre-line text-pretty text-muted-foreground">
          {request.body}
        </p>
      </Link>
      {request.answeredAt ? (
        <div data-tone="success" className="rounded-xl bg-tone-soft/60 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-tone-ink">
            <CircleCheckBig className="size-3.5" />
            {t('care.answeredOn', { date: formatDate(request.answeredAt, 'dateShort') })}
          </p>
          {request.testimony ? (
            <p className="mt-1.5 flex gap-2 text-sm text-pretty">
              <Quote className="mt-0.5 size-3.5 shrink-0 text-tone-ink" aria-hidden />
              <span className="whitespace-pre-line">{request.testimony}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      {request.moderationStatus === 'rejected' && request.moderationNote ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {t('care.moderatorNote', { note: request.moderationNote })}
        </p>
      ) : null}
      {moderation ? (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRejecting(true)}
            disabled={moderate.isPending}
          >
            <ThumbsDown />
            {t('care.rejectPrayer')}
          </Button>
          <Button
            size="sm"
            loading={moderate.isPending}
            onClick={() => void moderate.run({ id: request.id, decision: 'approved' })}
          >
            <ThumbsUp />
            {t('care.approvePrayer')}
          </Button>
        </footer>
      ) : request.moderationStatus === 'approved' ? (
        <footer className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground tabular">
            {request.prayedCount > 0
              ? t('care.prayedCount', { count: request.prayedCount })
              : request.answeredAt
                ? ''
                : t('care.beFirstToPray')}
          </p>
          <PrayButton request={request} />
        </footer>
      ) : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={request.isMine ? t('care.withdrawPrayerTitle') : t('care.deletePrayerTitle')}
        description={t('care.deletePrayerDescription')}
        confirmLabel={request.isMine ? t('care.withdrawPrayer') : t('common.delete')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(request.id)) {
            setDeleting(false);
            onDeleted?.();
          }
        }}
      />
      <Dialog
        open={rejecting}
        onOpenChange={(open) => {
          setRejecting(open);
          if (!open) setNote('');
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('care.rejectPrayerTitle')}</DialogTitle>
            <DialogDescription>{t('care.rejectPrayerDescription')}</DialogDescription>
          </DialogHeader>
          <Field label={t('care.noteToRequester')} htmlFor={`reject-${request.id}`}>
            <Input
              id={`reject-${request.id}`}
              autoFocus
              value={note}
              placeholder={t('care.noteToRequesterPlaceholder')}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejecting(false)}
              disabled={moderate.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              loading={moderate.isPending}
              onClick={async () => {
                if (
                  await moderate.run({ id: request.id, decision: 'rejected', note: note || null })
                ) {
                  setRejecting(false);
                  setNote('');
                }
              }}
            >
              {t('care.rejectPrayer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

/** Marks a request answered with an optional testimony. */
export function AnswerDialog({
  request,
  onOpenChange,
}: {
  request: PrayerRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const [testimony, setTestimony] = useState('');
  const answer = useMutationToast(useAnswerPrayer(churchId), {
    success: (data) =>
      data.request.moderationStatus === 'pending'
        ? t('care.testimonyInReview')
        : t('care.prayerAnswered'),
  });
  // Testimonies of requesters are reviewed before the church sees them.
  const reviewed = !!request && request.visibility === 'church' && !request.canModerate;
  return (
    <Dialog
      open={!!request}
      onOpenChange={(open) => {
        if (open) setTestimony(request?.testimony ?? '');
        onOpenChange(open);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={() => setTestimony(request?.testimony ?? '')}
      >
        <DialogHeader>
          <DialogTitle>{t('care.answeredTitle')}</DialogTitle>
          <DialogDescription>{t('care.answeredDescription')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label={t('care.testimony')} htmlFor="prayer-testimony">
            <Textarea
              id="prayer-testimony"
              rows={4}
              autoFocus
              value={testimony}
              placeholder={t('care.testimonyPlaceholder')}
              onChange={(event) => setTestimony(event.target.value)}
            />
          </Field>
          {reviewed ? (
            <p className="text-xs text-muted-foreground">{t('care.testimonyReviewHint')}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={answer.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={answer.isPending}
            onClick={async () => {
              if (!request) return;
              if (await answer.run({ id: request.id, testimony })) onOpenChange(false);
            }}
          >
            <CircleCheckBig />
            {t('care.markAnswered')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
