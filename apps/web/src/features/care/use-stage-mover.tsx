import {
  FOLLOW_UP_STAGE_LABELS,
  localize,
  type FollowUpStage,
  type VisitorFollowUp,
} from '@tatagereja/shared';
import { useState } from 'react';
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
import { useMoveFollowUp } from './api';

/** Moves a follow-up through the pipeline; closing asks for a reason. */
export function useStageMover() {
  const { t, locale } = useI18n();
  const { churchId } = useChurch();
  const move = useMutationToast(useMoveFollowUp(churchId), {
    success: (_data, variables) =>
      t('care.movedTo', { stage: localize(FOLLOW_UP_STAGE_LABELS[variables.stage], locale) }),
  });
  const [closing, setClosing] = useState<VisitorFollowUp | null>(null);
  const [reason, setReason] = useState('');
  const moveTo = (followUp: VisitorFollowUp, stage: FollowUpStage) => {
    if (stage === followUp.stage) return;
    if (stage === 'closed') {
      setReason('');
      setClosing(followUp);
      return;
    }
    void move.run({ id: followUp.id, stage });
  };
  const dialog = (
    <Dialog open={!!closing} onOpenChange={(open) => !open && setClosing(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('care.closeFollowUpTitle')}</DialogTitle>
          <DialogDescription>{t('care.closeFollowUpDescription')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!closing || !reason.trim()) return;
            if (await move.run({ id: closing.id, stage: 'closed', closedReason: reason.trim() })) {
              setClosing(null);
            }
          }}
        >
          <Field label={t('care.closedReason')} htmlFor="follow-up-close-reason" required>
            <Input
              id="follow-up-close-reason"
              autoFocus
              value={reason}
              placeholder={t('care.followUpClosedPlaceholder')}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClosing(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!reason.trim()} loading={move.isPending}>
              {t('care.closeFollowUp')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
  return { moveTo, dialog, isPending: move.isPending };
}
