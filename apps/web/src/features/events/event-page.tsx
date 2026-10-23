import { EVENT_RECURRENCE_LABELS, localize, type EventEditScope } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Clock,
  MapPin,
  MoreHorizontal,
  Pencil,
  Repeat,
  RotateCcw,
  Share2,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { copyText } from '@/components/ui/copy-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/ui/list';
import { Alert, Segmented } from '@/components/ui/misc';
import { SkeletonPage } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Markdown } from '@/features/comms/markdown';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isGone, useMutationToast } from '@/lib/use-mutation-toast';
import { eventQuery, useCancelEvent, useDeleteEvent } from './api';
import { EVENT_TONE, mapsUrl } from './event-lib';
import { OrganiserPanel, RegistrationCard, RsvpCard, SelfCheckInCard } from './event-panels';
import { EventBadges, EventDateTile } from './event-ui';

export function EventPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base } = useChurch();
  const { t, locale, formatDateRange, formatDate, formatDateTime, formatNumber } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(eventQuery(churchId, id));
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteScope, setDeleteScope] = useState<EventEditScope>('this');
  const cancel = useMutationToast(useCancelEvent(churchId, id), {
    success: (result) =>
      result.event.cancelledAt ? t('events.cancelledToast') : t('events.restoredToast'),
  });
  const remove = useMutationToast(useDeleteEvent(churchId), {
    success: (result) => t('events.deletedToast', { count: result.deleted }),
  });

  if (query.isPending) return <SkeletonPage />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('events.title')} backTo={`${base}/events`} />
        <ErrorState
          error={query.error}
          title={isGone(query.error) ? t('events.goneTitle') : undefined}
          message={isGone(query.error) ? t('events.goneBody') : getErrorMessage(query.error)}
          onRetry={isGone(query.error) ? undefined : () => void query.refetch()}
          retrying={query.isFetching}
        />
      </Page>
    );
  }

  const detail = query.data;
  const { event, canManage, canCheckIn, canRecordAttendance, sessions } = detail;
  const cancelled = !!event.cancelledAt;

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: formatDateRange(event.startsAt, event.endsAt, event.isAllDay),
          url,
        });
        return;
      } catch {
        // Cancelled: fall back to copying the link.
      }
    }
    if (await copyText(url)) toast.success(t('common.copied'));
    else toast.error(t('common.copyFailed'));
  };

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: t('events.title'), to: `${base}/events` }, { label: event.title }]}
        eyebrow={event.groupName ?? t('events.churchWide')}
        tone={EVENT_TONE}
        title={event.title}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void share()}
              aria-label={t('common.share')}
            >
              <Share2 />
              <span className="hidden sm:inline">{t('common.share')}</span>
            </Button>
            {canManage ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`${base}/events/${event.id}/edit`}>
                  <Pencil />
                  <span className="hidden sm:inline">{t('common.edit')}</span>
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-9"
                    aria-label={t('common.moreActions')}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {cancelled ? (
                    <DropdownMenuItem onSelect={() => void cancel.run({ cancel: false })}>
                      <RotateCcw />
                      {t('events.restore')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => setCancelOpen(true)}>
                      <XCircle />
                      {t('events.cancelEvent')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                    <Trash2 />
                    {t('common.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />

      {cancelled ? (
        <Alert variant="error" title={t('events.cancelledTitle')}>
          {t('events.cancelledBody', { when: formatDateTime(event.cancelledAt) })}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        {event.coverColor ? (
          <div className="h-1.5" style={{ backgroundColor: event.coverColor }} aria-hidden />
        ) : null}
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <EventDateTile
            startsAt={event.startsAt}
            color={event.coverColor}
            muted={cancelled}
            size="lg"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <p className="flex items-start gap-2.5 text-[0.9375rem]">
              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="font-medium">
                {formatDateRange(event.startsAt, event.endsAt, event.isAllDay)}
              </span>
            </p>
            {event.location ? (
              <p className="flex items-start gap-2.5 text-[0.9375rem]">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a
                  href={mapsUrl(event.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {event.location}
                </a>
              </p>
            ) : null}
            {event.series ? (
              <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Repeat className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {t('events.seriesSummary', {
                    frequency: localize(EVENT_RECURRENCE_LABELS[event.series.frequency], locale),
                    until: formatDate(event.series.untilDate, 'dateShort'),
                  })}
                  {event.isSeriesException ? ` · ${t('events.editedSeparately')}` : ''}
                </span>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              <EventBadges event={event} />
            </div>
          </div>
        </CardContent>
      </Card>

      <SelfCheckInCard detail={detail} />
      {event.registrationRequired ? (
        <RegistrationCard detail={detail} />
      ) : (
        <RsvpCard detail={detail} />
      )}

      {event.description ? (
        <Section title={t('events.about')}>
          <Card>
            <CardContent>
              <Markdown source={event.description} />
            </CardContent>
          </Card>
        </Section>
      ) : null}

      {canCheckIn && !cancelled ? (
        <Button asChild variant="soft" size="lg" className="w-full sm:w-fit">
          <Link to={`${base}/events/${event.id}/check-in`}>
            <ClipboardCheck />
            {t('events.openCheckIn')}
          </Link>
        </Button>
      ) : null}

      {canManage ? <OrganiserPanel detail={detail} /> : null}

      {canRecordAttendance && sessions.length > 0 ? (
        <Section title={t('events.attendanceTitle')} icon={ClipboardList}>
          <ListGroup>
            {sessions.map((session) => (
              <ListRow
                key={session.id}
                to={`${base}/attendance/${session.id}`}
                title={session.title}
                subtitle={formatDateTime(session.sessionAt)}
                trailing={t('events.presentOf', {
                  present: formatNumber(session.presentCount),
                  total: formatNumber(session.totalCount),
                })}
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('events.cancelTitle', { title: event.title })}
        description={t('events.cancelBody')}
        confirmLabel={t('events.cancelEvent')}
        cancelLabel={t('events.keepEvent')}
        loading={cancel.isPending}
        onConfirm={async () => {
          if (await cancel.run({ cancel: true, reason })) {
            setCancelOpen(false);
            setReason('');
          }
        }}
      >
        <Field
          label={t('events.cancelReason')}
          htmlFor="cancel-reason"
          description={t('events.cancelReasonHint')}
        >
          <Input
            id="cancel-reason"
            value={reason}
            maxLength={200}
            onChange={(input) => setReason(input.target.value)}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('events.deleteTitle', { title: event.title })}
        description={t('events.deleteBody')}
        confirmLabel={t('common.delete')}
        confirmText={event.registeredCount > 0 || event.goingCount > 0 ? event.title : undefined}
        loading={remove.isPending}
        onConfirm={async () => {
          const result = await remove.run({ id: event.id, scope: deleteScope });
          if (result) {
            setDeleteOpen(false);
            void navigate(`${base}/events`, { replace: true });
          }
        }}
      >
        {event.seriesId ? (
          <Segmented
            aria-label={t('events.deleteScope')}
            value={deleteScope}
            onChange={setDeleteScope}
            options={[
              { value: 'this', label: t('events.scopeThisShort') },
              { value: 'future', label: t('events.scopeFutureShort'), icon: CalendarClock },
            ]}
          />
        ) : null}
      </ConfirmDialog>
    </Page>
  );
}
