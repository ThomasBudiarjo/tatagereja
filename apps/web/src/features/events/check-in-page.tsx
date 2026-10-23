import { fullName } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, ClipboardCheck, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput, Segmented } from '@/components/ui/misc';
import { SkeletonList, SkeletonPage } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { PersonPickerDialog } from '@/features/people/person-picker';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { checkInQuery, eventQuery, useCheckIn, useUndoCheckIn } from './api';
import { EVENT_TONE } from './event-lib';

/**
 * Door check-in: one tap per person marks them present (it records attendance for the
 * event). Walk-ins are added from the directory. Big rows for a phone held at the door.
 */
export function CheckInPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base } = useChurch();
  const { t, formatNumber, formatTime, formatDateRange } = useI18n();
  const event = useQuery(eventQuery(churchId, id));
  const list = useQuery({ ...checkInQuery(churchId, id), enabled: !!event.data?.canCheckIn });
  const checkIn = useCheckIn(churchId, id);
  const undo = useUndoCheckIn(churchId, id);
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<'waiting' | 'all'>('waiting');
  const [pickerOpen, setPickerOpen] = useState(false);

  if (event.isPending) return <SkeletonPage />;
  if (event.isError) {
    return (
      <Page>
        <PageHeader title={t('events.checkInTitle')} backTo={`${base}/events/${id}`} />
        <ErrorState
          error={event.error}
          message={getErrorMessage(event.error)}
          onRetry={() => void event.refetch()}
          retrying={event.isFetching}
        />
      </Page>
    );
  }
  if (!event.data.canCheckIn) return <NoAccessState />;

  const toggle = (personId: string, name: string, checked: boolean) => {
    if (checked) {
      undo.mutate(personId, { onError: (error) => toast.error(getErrorMessage(error)) });
    } else {
      checkIn.mutate(
        { personIds: [personId] },
        {
          onSuccess: () => toast.success(t('events.checkedInToast', { name })),
          onError: (error) => toast.error(getErrorMessage(error)),
        },
      );
    }
  };

  const term = search.trim().toLowerCase();
  const items = (list.data?.items ?? []).filter((item) => {
    if (term && !fullName(item.person).toLowerCase().includes(term)) return false;
    return show === 'all' || !item.checkedInAt || !!term;
  });
  const expected = list.data?.items.length ?? 0;
  const present = list.data?.checkedInCount ?? 0;
  const headcount = (list.data?.items ?? [])
    .filter((item) => item.checkedInAt)
    .reduce((sum, item) => sum + item.partySize, 0);

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: t('events.title'), to: `${base}/events` },
          { label: event.data.event.title, to: `${base}/events/${id}` },
          { label: t('events.checkInTitle') },
        ]}
        title={t('events.checkInTitle')}
        description={`${event.data.event.title} · ${formatDateRange(event.data.event.startsAt, event.data.event.endsAt, event.data.event.isAllDay)}`}
        icon={ClipboardCheck}
        tone={EVENT_TONE}
        actions={
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            <UserPlus />
            {t('events.walkIn')}
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label={t('events.statPresent')}
          value={formatNumber(present)}
          icon={Check}
          tone="success"
          loading={list.isPending}
        />
        <StatCard
          label={t('events.statExpected')}
          value={formatNumber(expected)}
          icon={Users}
          tone={EVENT_TONE}
          loading={list.isPending}
        />
        <StatCard
          className="col-span-2 sm:col-span-1"
          label={t('events.statHeadcount')}
          value={formatNumber(headcount)}
          hint={t('events.statHeadcountHint')}
          icon={Users}
          tone="violet"
          loading={list.isPending}
        />
      </div>
      <div className="sticky top-14 z-10 -mx-4 flex flex-col gap-2 bg-background/90 px-4 py-2 backdrop-blur md:top-16 sm:flex-row">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('events.searchAttendee')}
          className="flex-1"
        />
        <Segmented
          aria-label={t('events.checkInShow')}
          className="sm:w-64"
          value={show}
          onChange={setShow}
          options={[
            { value: 'waiting', label: t('events.notYet') },
            { value: 'all', label: t('events.everyone') },
          ]}
        />
      </div>
      {list.isPending ? (
        <SkeletonList rows={6} />
      ) : list.isError ? (
        <ErrorState
          error={list.error}
          message={getErrorMessage(list.error)}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={show === 'waiting' && expected > 0 ? Check : Users}
          tone={show === 'waiting' && expected > 0 ? 'success' : EVENT_TONE}
          title={
            term
              ? t('events.noAttendeeFound')
              : show === 'waiting' && expected > 0
                ? t('events.everyoneIn')
                : t('events.nobodyExpected')
          }
          description={term ? t('events.walkInHint') : t('events.nobodyExpectedHint')}
          action={
            <Button variant="outline" onClick={() => setPickerOpen(true)}>
              <UserPlus />
              {t('events.walkIn')}
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
          {items.map((item) => {
            const name = fullName(item.person);
            const checked = !!item.checkedInAt;
            return (
              <li key={item.person.id}>
                <button
                  type="button"
                  onClick={() => toggle(item.person.id, name, checked)}
                  aria-pressed={checked}
                  className={cn(
                    'flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset',
                    checked && 'bg-success/[0.06]',
                  )}
                >
                  <EntityAvatar name={name} src={item.person.photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.source === 'registration'
                        ? t('events.sourceRegistration', { count: item.partySize })
                        : item.source === 'rsvp'
                          ? t('events.sourceRsvp')
                          : t('events.sourceWalkIn')}
                      {checked && item.checkedInAt ? ` · ${formatTime(item.checkedInAt)}` : ''}
                    </span>
                  </span>
                  <span
                    data-tone={checked ? 'success' : 'neutral'}
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
                      checked
                        ? 'border-transparent bg-tone text-tone-foreground'
                        : 'border-border text-transparent',
                    )}
                    aria-hidden
                  >
                    <Check className="size-5" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <PersonPickerDialog
        churchId={churchId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={t('events.walkIn')}
        description={t('events.walkInHint')}
        confirmLabel={t('events.checkInButton')}
        excludeIds={(list.data?.items ?? [])
          .filter((item) => item.checkedInAt)
          .map((item) => item.person.id)}
        loading={checkIn.isPending}
        onConfirm={(personIds) =>
          new Promise<void>((resolve) =>
            checkIn.mutate(
              { personIds },
              {
                onSuccess: () => {
                  toast.success(t('events.walkInsAdded', { count: personIds.length }));
                  setPickerOpen(false);
                },
                onError: (error) => toast.error(getErrorMessage(error)),
                onSettled: () => resolve(),
              },
            ),
          )
        }
      />
    </Page>
  );
}
