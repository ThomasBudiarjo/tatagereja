import { occurrenceDateOf, type FacilityBooking } from '@tatagereja/shared';
import { useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useCancelBooking, useDecideBooking } from './api';

/** Approve or reject a request, with an optional note for the requester. */
export function DecisionDialog({
  booking,
  decision,
  onOpenChange,
}: {
  booking: Pick<FacilityBooking, 'id' | 'title' | 'resourceName' | 'requesterName'>;
  decision: 'approved' | 'rejected' | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useBookingChurch();
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const decide = useMutationToast(useDecideBooking(churchId), {
    success: (result) =>
      result.booking.status === 'approved'
        ? t('facilities.bookingApproved', { title: result.booking.title })
        : t('facilities.bookingRejected', { title: result.booking.title }),
  });
  const approve = decision === 'approved';
  return (
    <ConfirmDialog
      open={decision !== null}
      onOpenChange={(open) => {
        if (!open) setNote('');
        onOpenChange(open);
      }}
      title={
        approve
          ? t('facilities.approveTitle', { title: booking.title })
          : t('facilities.rejectTitle', { title: booking.title })
      }
      description={
        approve
          ? t('facilities.approveBody', {
              name: booking.requesterName ?? '—',
              resource: booking.resourceName,
            })
          : t('facilities.rejectBody', { name: booking.requesterName ?? '—' })
      }
      variant={approve ? 'default' : 'destructive'}
      confirmLabel={approve ? t('facilities.approve') : t('facilities.reject')}
      loading={decide.isPending}
      onConfirm={async () => {
        if (!decision) return;
        const result = await decide.run({ id: booking.id, decision, note });
        if (result) {
          setNote('');
          onOpenChange(false);
        }
      }}
    >
      <Field
        label={approve ? t('facilities.noteForRequester') : t('facilities.rejectReason')}
        htmlFor={`decision-note-${booking.id}`}
      >
        <Textarea
          id={`decision-note-${booking.id}`}
          rows={2}
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            approve ? t('facilities.notePlaceholder') : t('facilities.rejectPlaceholder')
          }
        />
      </Field>
    </ConfirmDialog>
  );
}

/**
 * Cancel a booking, or with `occurrenceStartsAt` only that date of a weekly booking. Says
 * what is freed and who is told.
 */
export function CancelBookingDialog({
  booking,
  open,
  occurrenceStartsAt,
  onOpenChange,
  onCancelled,
}: {
  booking: Pick<FacilityBooking, 'id' | 'title' | 'recurrence' | 'requestedBy'>;
  open: boolean;
  occurrenceStartsAt?: string | null;
  onOpenChange: (open: boolean) => void;
  onCancelled?: () => void;
}) {
  const { churchId, userId } = useBookingChurch();
  const { t, formatDateTime } = useI18n();
  const [reason, setReason] = useState('');
  const cancel = useMutationToast(useCancelBooking(churchId), {
    success: occurrenceStartsAt
      ? t('facilities.occurrenceCancelled')
      : t('facilities.bookingCancelled', { title: booking.title }),
  });
  const someoneElse = booking.requestedBy && booking.requestedBy !== userId;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
      title={
        occurrenceStartsAt
          ? t('facilities.cancelOccurrenceTitle', { date: formatDateTime(occurrenceStartsAt) })
          : t('facilities.cancelBookingTitle', { title: booking.title })
      }
      description={
        <>
          {occurrenceStartsAt
            ? t('facilities.cancelOccurrenceBody')
            : booking.recurrence === 'weekly'
              ? t('facilities.cancelWeeklyBody')
              : t('facilities.cancelBookingBody')}
          {someoneElse ? ` ${t('facilities.requesterWillBeTold')}` : ''}
        </>
      }
      confirmLabel={
        occurrenceStartsAt ? t('facilities.cancelThisDate') : t('facilities.cancelBooking')
      }
      cancelLabel={t('facilities.keepBooking')}
      loading={cancel.isPending}
      onConfirm={async () => {
        const result = await cancel.run({
          id: booking.id,
          reason,
          occurrenceDate: occurrenceStartsAt ? occurrenceDateOf(occurrenceStartsAt) : null,
        });
        if (result) {
          setReason('');
          onOpenChange(false);
          onCancelled?.();
        }
      }}
    >
      <Field label={t('facilities.cancelReason')} htmlFor={`cancel-reason-${booking.id}`}>
        <Textarea
          id={`cancel-reason-${booking.id}`}
          rows={2}
          maxLength={200}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </ConfirmDialog>
  );
}

function useBookingChurch() {
  const { churchId, access } = useChurch();
  return { churchId, userId: access.userId };
}
