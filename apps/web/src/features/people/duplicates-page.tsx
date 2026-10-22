import {
  GENDER_TEXT,
  PERSON_STATUS_TEXT,
  fullName,
  localize,
  type DirectoryPerson,
  type DuplicateCandidate,
  type MergePeopleBody,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Copy, GitMerge, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { Skeleton, SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { duplicatesQuery, personQuery, useMergePeople } from './api';

const REASON_LABELS: Record<DuplicateCandidate['reasons'][number], MessageKey> = {
  name: 'people.reasonName',
  email: 'people.reasonEmail',
  phone: 'people.reasonPhone',
  birthDate: 'people.reasonBirthDate',
};

type TakeField = MergePeopleBody['takeFields'][number];
const MERGE_FIELDS: { key: TakeField; label: MessageKey }[] = [
  { key: 'lastName', label: 'people.lastName' },
  { key: 'gender', label: 'people.gender' },
  { key: 'birthDate', label: 'people.birthDate' },
  { key: 'email', label: 'people.emailLabel' },
  { key: 'phone', label: 'people.phone' },
  { key: 'address', label: 'people.address' },
  { key: 'membershipStatus', label: 'people.status' },
  { key: 'joinedAt', label: 'people.joinedAt' },
  { key: 'weddingDate', label: 'people.weddingDate' },
  { key: 'notes', label: 'people.notes' },
];

export function DuplicatesPage() {
  const { churchId, base } = useChurch();
  const { t, formatPercent } = useI18n();
  const query = useQuery(duplicatesQuery(churchId));
  const [pair, setPair] = useState<DuplicateCandidate | null>(null);

  return (
    <Page>
      <PageHeader
        icon={Copy}
        tone="sky"
        breadcrumbs={[
          { label: t('people.title'), to: `${base}/people` },
          { label: t('people.duplicatesTitle') },
        ]}
        title={t('people.duplicatesTitle')}
        description={t('people.duplicatesDescription')}
      />
      {query.isPending ? (
        <SkeletonList rows={4} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          tone="success"
          title={t('people.noDuplicates')}
          description={t('people.noDuplicatesHint')}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {query.data.items.map((candidate) => {
            const [a, b] = candidate.people;
            if (!a || !b) return null;
            return (
              <li
                key={`${a.id}-${b.id}`}
                className="rounded-xl border border-border/70 bg-card p-4 shadow-soft"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {[a, b].map((person, index) => (
                      <div key={person.id} className="flex min-w-0 flex-1 items-center gap-2.5">
                        {index === 1 ? (
                          <ArrowRightLeft
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        ) : null}
                        <EntityAvatar name={fullName(person)} src={person.photoUrl} size="sm" />
                        <Link
                          to={`${base}/people/${person.id}`}
                          className="min-w-0 truncate text-sm font-semibold hover:underline"
                        >
                          {fullName(person)}
                        </Link>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="flex flex-wrap gap-1">
                      {candidate.reasons.map((reason) => (
                        <StatusBadge key={reason} size="sm" tone="warning">
                          {t(REASON_LABELS[reason])}
                        </StatusBadge>
                      ))}
                      <StatusBadge size="sm" tone="neutral">
                        {formatPercent(candidate.score, 0)}
                      </StatusBadge>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setPair(candidate)}>
                      <GitMerge /> {t('people.compare')}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pair ? (
        <MergeDialog
          key={`${pair.people[0]?.id}-${pair.people[1]?.id}`}
          candidate={pair}
          onClose={() => setPair(null)}
        />
      ) : null}
    </Page>
  );
}

function MergeDialog({
  candidate,
  onClose,
}: {
  candidate: DuplicateCandidate;
  onClose: () => void;
}) {
  const { churchId } = useChurch();
  const { t, locale, formatDate } = useI18n();
  const [first, second] = candidate.people;
  const a = useQuery(personQuery(churchId, first?.id ?? ''));
  const b = useQuery(personQuery(churchId, second?.id ?? ''));
  const [keepIndex, setKeepIndex] = useState(0);
  const [take, setTake] = useState<TakeField[]>([]);
  const [confirming, setConfirming] = useState(false);
  const merge = useMutationToast(useMergePeople(churchId));
  const records = [a.data?.person, b.data?.person];
  const keep = records[keepIndex];
  const other = records[keepIndex === 0 ? 1 : 0];

  const display = (person: DirectoryPerson | undefined, field: TakeField): string => {
    const value = person?.[field];
    if (value === null || value === undefined || value === '') return '—';
    if (field === 'gender')
      return localize(GENDER_TEXT[value as DirectoryPerson['gender']], locale);
    if (field === 'membershipStatus')
      return localize(PERSON_STATUS_TEXT[value as DirectoryPerson['membershipStatus']], locale);
    if (field === 'birthDate' || field === 'joinedAt' || field === 'weddingDate')
      return formatDate(String(value), 'dateShort');
    return String(value);
  };

  return (
    <>
      <Dialog open={!confirming} onOpenChange={(open) => !open && !merge.isPending && onClose()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('people.mergeTitle')}</DialogTitle>
            <DialogDescription>{t('people.mergeHint')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            {a.isPending || b.isPending ? (
              <Skeleton className="h-64" />
            ) : a.isError || b.isError || !keep || !other ? (
              <ErrorState compact message={getErrorMessage(a.error ?? b.error)} />
            ) : (
              <>
                <div
                  role="radiogroup"
                  aria-label={t('people.mergeKeep')}
                  className="grid grid-cols-2 gap-3"
                >
                  {records.map((person, index) =>
                    person ? (
                      <button
                        key={person.id}
                        type="button"
                        role="radio"
                        aria-checked={keepIndex === index}
                        onClick={() => {
                          setKeepIndex(index);
                          setTake([]);
                        }}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                          keepIndex === index
                            ? 'border-primary bg-accent/50'
                            : 'border-border/70 hover:bg-muted/50',
                        )}
                      >
                        <EntityAvatar name={fullName(person)} src={person.photoUrl} />
                        <span className="text-sm font-semibold">{fullName(person)}</span>
                        <StatusBadge size="sm" tone={keepIndex === index ? 'success' : 'neutral'}>
                          {keepIndex === index ? t('people.mergeKept') : t('people.mergeRemoved')}
                        </StatusBadge>
                      </button>
                    ) : null,
                  )}
                </div>
                <div className="overflow-hidden rounded-xl border border-border/70 text-sm">
                  <div
                    aria-hidden
                    className="grid grid-cols-2 gap-3 bg-muted/45 px-3 py-2 text-xs font-semibold text-muted-foreground sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <span className="hidden sm:block">{t('people.mergeField')}</span>
                    <span>{t('people.mergeKept')}</span>
                    <span>{t('people.mergeUseOther')}</span>
                  </div>
                  <ul>
                    {MERGE_FIELDS.map(({ key, label }) => {
                      const kept = display(keep, key);
                      const incoming = display(other, key);
                      const differs = kept !== incoming && incoming !== '—';
                      return (
                        <li
                          key={key}
                          className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/60 px-3 py-2 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]"
                        >
                          <span className="col-span-2 text-xs text-muted-foreground sm:col-span-1 sm:text-sm">
                            {t(label)}
                          </span>
                          <span
                            className={cn(
                              'min-w-0 break-words',
                              take.includes(key) && 'text-muted-foreground line-through',
                            )}
                          >
                            {kept}
                          </span>
                          {differs ? (
                            <label className="flex min-w-0 cursor-pointer items-start gap-2 break-words">
                              <Checkbox
                                className="mt-0.5"
                                checked={take.includes(key)}
                                aria-label={t('people.mergeTakeField', { field: t(label) })}
                                onCheckedChange={(checked) =>
                                  setTake((current) =>
                                    checked
                                      ? [...current, key]
                                      : current.filter((value) => value !== key),
                                  )
                                }
                              />
                              <span className="min-w-0">{incoming}</span>
                            </label>
                          ) : (
                            <span className="text-muted-foreground">
                              {incoming === '—' ? '—' : t('people.mergeSame')}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <Alert variant="info">{t('people.mergeMoves')}</Alert>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button disabled={!keep || !other} onClick={() => setConfirming(true)}>
              <GitMerge /> {t('people.mergeContinue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {keep && other ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={(open) => !open && setConfirming(false)}
          title={t('people.mergeConfirmTitle', { merged: fullName(other), kept: fullName(keep) })}
          description={t('people.mergeConfirmDescription', { merged: fullName(other) })}
          confirmText={fullName(other)}
          confirmLabel={t('people.merge')}
          loading={merge.isPending}
          onConfirm={async () => {
            const result = await merge.run({
              keepId: keep.id,
              mergeId: other.id,
              takeFields: take,
            });
            if (!result) return;
            const moved = Object.values(result.moved).reduce((sum, value) => sum + value, 0);
            toast.success(t('people.merged', { name: fullName(result.person), count: moved }));
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
