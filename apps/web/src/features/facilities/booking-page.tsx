import {
  canCancelBooking,
  canDecideBooking,
  canEditBooking,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  CalendarOff,
  CircleCheck,
  CircleX,
  DoorOpen,
  MessageSquareText,
  Pencil,
  Repeat,
  StickyNote,
  Target,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/misc';
import { SkeletonText } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { bookingQuery } from './api';
import { CancelBookingDialog, DecisionDialog } from './booking-dialogs';
import { FACILITIES_TONE } from './facilities-lib';
import { BookingStatusBadge, ConflictList, FacilitiesNav } from './facilities-ui';

export function BookingPage() {
  const { bookingId = '' } = useParams();
  const { churchId, base, access } = useChurch();
  const { t, formatDateRange, formatDate, formatDateTime, formatNumber } = useI18n();
  const query = useQuery(bookingQuery(churchId, bookingId));
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDate, setCancelDate] = useState<string | null>(null);
  const crumbs = [
    { label: t('facilities.nav'), to: `${base}/facilities` },
    { label: t('facilities.bookingsTitle'), to: `${base}/facilities/bookings` },
  ];

  if (query.isPending) {
    return (
      <Page>
        <SkeletonText lines={12} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('facilities.bookingsTitle')} breadcrumbs={crumbs} />
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={
            isApiClientError(query.error) && query.error.status === 404
              ? undefined
              : () => void query.refetch()
          }
        />
      </Page>
    );
  }

  const { booking, conflicts, occurrences } = query.data;
  const live = booking.status === 'pending' || booking.status === 'approved';
  const manager = canDecideBooking(access);
  const canCancel = live && canCancelBooking(access, booking);
  const canEdit = canEditBooking(access, booking) && !!booking.nextOccurrence;
  const weekly = booking.recurrence === 'weekly';

  return (
    <Page>
      <PageHeader
        title={booking.title}
        eyebrow={booking.resourceName}
        icon={CalendarClock}
        tone={FACILITIES_TONE}
        breadcrumbs={[...crumbs, { label: booking.title }]}
        actions={
          canEdit ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`${base}/facilities/bookings/${booking.id}/edit`}>
                <Pencil />
                {t('common.edit')}
              </Link>
            </Button>
          ) : null
        }
      />
      <FacilitiesNav />

      <div className="flex flex-wrap items-center gap-2">
        <BookingStatusBadge status={booking.status} size="md" />
        {weekly ? (
          <StatusBadge tone="sky" icon={Repeat}>
            {booking.recurrenceUntil
              ? t('facilities.weeklyUntil', { date: formatDate(booking.recurrenceUntil, 'dateShort') })
              : t('facilities.weekly')}
          </StatusBadge>
        ) : null}
      </div>

      {booking.status === 'pending' && manager ? (
        <Card data-tone="warning" className="border-tone/30">
          <CardContent className="flex flex-col gap-3">
            <div>
              <p className="font-semibold">{t('facilities.decisionNeeded')}</p>
              <p className="text-sm text-muted-foreground">
                {t('facilities.decisionNeededBody', { name: booking.requesterName ?? '—' })}
              </p>
            </div>
            {conflicts.length > 0 ? (
              <Alert variant="error" title={t('facilities.conflictsTitle')}>
                <ConflictList conflicts={conflicts} className="mt-1.5" />
              </Alert>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setDecision('rejected')}>
                <CircleX />
                {t('facilities.reject')}
              </Button>
              <Button onClick={() => setDecision('approved')} disabled={conflicts.length > 0}>
                <CircleCheck />
                {t('facilities.approve')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : booking.status === 'pending' ? (
        <Alert variant="warning" title={t('facilities.waitingTitle')}>
          {t('facilities.waitingBody')}
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail icon={CalendarClock} label={weekly ? t('facilities.firstDate') : t('facilities.when')}>
              {formatDateRange(booking.startsAt, booking.endsAt)}
            </Detail>
            <Detail icon={DoorOpen} label={t('facilities.fieldResource')}>
              <Link
                to={`${base}/facilities/rooms/${booking.resourceId}`}
                className="underline-offset-2 hover:underline"
              >
                {booking.resourceName}
              </Link>
            </Detail>
            <Detail icon={UserRound} label={t('facilities.requester')}>
              {booking.requesterName ?? '—'}
              {booking.groupName ? (
                <span className="block text-sm font-normal text-muted-foreground">
                  {booking.groupName}
                </span>
              ) : null}
            </Detail>
            {booking.expectedAttendees ? (
              <Detail icon={Users} label={t('facilities.fieldExpectedAttendees')}>
                {formatNumber(booking.expectedAttendees)}
              </Detail>
            ) : null}
            {booking.purpose ? (
              <Detail icon={Target} label={t('facilities.fieldPurpose')}>
                {booking.purpose}
              </Detail>
            ) : null}
            {booking.notes ? (
              <Detail icon={StickyNote} label={t('facilities.fieldNotes')} wide>
                <span className="whitespace-pre-line">{booking.notes}</span>
              </Detail>
            ) : null}
            {booking.decidedAt && booking.status !== 'pending' ? (
              <Detail
                icon={MessageSquareText}
                label={
                  booking.status === 'rejected'
                    ? t('facilities.rejectedBy')
                    : booking.status === 'cancelled'
                      ? t('facilities.cancelledOn')
                      : t('facilities.approvedBy')
                }
                wide
              >
                {booking.status === 'cancelled' && booking.cancelledAt
                  ? formatDateTime(booking.cancelledAt)
                  : `${booking.deciderName ?? '—'} · ${formatDateTime(booking.decidedAt)}`}
                {booking.decisionNote ? (
                  <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                    “{booking.decisionNote}”
                  </span>
                ) : null}
              </Detail>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {live && weekly ? (
        <Section
          title={t('facilities.upcomingDates')}
          description={t('facilities.upcomingDatesHint')}
          icon={Repeat}
        >
          {occurrences.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('facilities.noMoreDates')}</p>
          ) : (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
              {occurrences.map((item) => (
                <li key={item.startsAt} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 text-sm tabular">
                    {formatDateRange(item.startsAt, item.endsAt)}
                  </span>
                  {canCancel ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setCancelDate(item.startsAt)}
                    >
                      <CalendarOff />
                      <span className="hidden sm:inline">{t('facilities.cancelThisDate')}</span>
                      <span className="sr-only sm:hidden">{t('facilities.cancelThisDate')}</span>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {booking.skippedDates.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('facilities.skippedDates', {
                dates: booking.skippedDates.map((date) => formatDate(date, 'dayMonth')).join(', '),
              })}
            </p>
          ) : null}
        </Section>
      ) : null}

      {canCancel ? (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => setCancelling(true)}
          >
            <XCircle />
            {weekly ? t('facilities.cancelAllDates') : t('facilities.cancelBooking')}
          </Button>
        </div>
      ) : null}

      <DecisionDialog booking={booking} decision={decision} onOpenChange={() => setDecision(null)} />
      <CancelBookingDialog booking={booking} open={cancelling} onOpenChange={setCancelling} />
      <CancelBookingDialog
        booking={booking}
        open={cancelDate !== null}
        occurrenceStartsAt={cancelDate}
        onOpenChange={(open) => {
          if (!open) setCancelDate(null);
        }}
      />
    </Page>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
  wide = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'flex gap-3 sm:col-span-2' : 'flex gap-3'}>
      <span
        data-tone={FACILITIES_TONE}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tone-soft text-tone-ink"
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium text-pretty">{children}</dd>
      </div>
    </div>
  );
}
