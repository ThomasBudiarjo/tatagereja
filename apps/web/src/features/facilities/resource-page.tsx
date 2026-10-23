import {
  RESOURCE_KIND_LABELS,
  canManageFacilities,
  canRequestBooking,
  localize,
  type BookingOccurrence,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  ShieldCheck,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/misc';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isGone, useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { resourceQuery, scheduleQuery, useDeleteResource } from './api';
import {
  FACILITIES_TONE,
  RESOURCE_KIND_ICONS,
  isValidDate,
  resourceTone,
  shiftDate,
  startOfZonedDay,
  todayIn,
  weekStartOf,
} from './facilities-lib';
import {
  AvailabilityBadge,
  DayTimeline,
  FacilitiesNav,
  OccurrenceRow,
  ResourceThumb,
} from './facilities-ui';

const DAY_MS = 86_400_000;

export function ResourcePage() {
  const { resourceId = '' } = useParams();
  const { churchId, base, access } = useChurch();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(resourceQuery(churchId, resourceId));
  const [deleting, setDeleting] = useState(false);
  const remove = useMutationToast(useDeleteResource(churchId), {
    success: t('facilities.roomDeleted'),
  });
  const manager = canManageFacilities(access);
  const crumbs = [
    { label: t('facilities.nav'), to: `${base}/facilities` },
    { label: t('facilities.roomsTitle'), to: `${base}/facilities/rooms` },
  ];

  if (query.isPending) {
    return (
      <Page size="wide">
        <Skeleton className="h-48 rounded-2xl" />
        <SkeletonText lines={6} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page size="wide">
        <PageHeader title={t('facilities.roomsTitle')} breadcrumbs={crumbs} />
        <ErrorState
          error={query.error}
          title={isGone(query.error) ? t('facilities.resourceGone') : undefined}
          message={getErrorMessage(query.error)}
          onRetry={isGone(query.error) ? undefined : () => void query.refetch()}
        />
      </Page>
    );
  }

  const { resource } = query.data;
  const Icon = RESOURCE_KIND_ICONS[resource.kind];
  const canBook = canRequestBooking(access) && resource.isActive;

  return (
    <Page size="wide">
      <PageHeader
        title={resource.name}
        eyebrow={localize(RESOURCE_KIND_LABELS[resource.kind], locale)}
        icon={Icon}
        tone={resourceTone(resource.kind)}
        breadcrumbs={[...crumbs, { label: resource.name }]}
        actions={
          <>
            {canBook ? (
              <Button asChild size="sm">
                <Link to={`${base}/facilities/bookings/new?resourceId=${resource.id}`}>
                  <CalendarPlus />
                  {t('facilities.book')}
                </Link>
              </Button>
            ) : null}
            {manager ? (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link to={`${base}/facilities/rooms/${resource.id}/edit`}>
                    <Pencil />
                    <span className="hidden sm:inline">{t('common.edit')}</span>
                  </Link>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-9 text-muted-foreground hover:text-destructive"
                  aria-label={t('facilities.deleteRoom')}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 />
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <FacilitiesNav />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <Card className="overflow-hidden p-0">
            {resource.photoUrl ? (
              <img
                src={resource.photoUrl}
                alt={resource.name}
                className="aspect-[16/9] w-full object-cover"
              />
            ) : null}
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                {!resource.photoUrl ? <ResourceThumb resource={resource} /> : null}
                <AvailabilityBadge resource={resource} size="md" />
              </div>
              {resource.description ? (
                <p className="text-sm text-pretty whitespace-pre-line">{resource.description}</p>
              ) : null}
              <dl className="flex flex-col gap-2 text-sm">
                {resource.location ? (
                  <InfoRow icon={MapPin} label={t('facilities.fieldLocation')}>
                    {resource.location}
                  </InfoRow>
                ) : null}
                {resource.capacity ? (
                  <InfoRow icon={Users} label={t('facilities.fieldCapacity')}>
                    {t('facilities.capacityValue', { count: resource.capacity })}
                  </InfoRow>
                ) : null}
                <InfoRow
                  icon={resource.requiresApproval ? ShieldCheck : Zap}
                  label={t('facilities.approvalLabel')}
                >
                  {resource.requiresApproval
                    ? t('facilities.needsApproval')
                    : t('facilities.instantBooking')}
                </InfoRow>
              </dl>
              {resource.features.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {resource.features.map((feature) => (
                    <li
                      key={feature}
                      data-tone={FACILITIES_TONE}
                      className="rounded-md bg-tone-soft px-2 py-0.5 text-xs font-medium text-tone-ink"
                    >
                      {feature}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </aside>
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <ResourceSchedule resourceId={resource.id} canBook={canBook} />
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('facilities.deleteRoomTitle', { name: resource.name })}
        description={t('facilities.deleteRoomBody')}
        confirmLabel={t('facilities.deleteRoom')}
        confirmText={resource.name}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(resource.id)) {
            setDeleting(false);
            void navigate(`${base}/facilities/rooms`, { replace: true });
          }
        }}
      />
    </Page>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}

/** Day or week of one resource; the day and view live in the URL. */
function ResourceSchedule({ resourceId, canBook }: { resourceId: string; canBook: boolean }) {
  const { churchId, base, church } = useChurch();
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
  const timeZone = church.timezone;
  const today = todayIn(timeZone);
  const [state, setState] = useUrlState({ view: 'day', date: '' });
  const view = state.view === 'week' ? 'week' : 'day';
  const date = isValidDate(state.date) ? state.date : today;
  const first = view === 'week' ? weekStartOf(date) : date;
  const days =
    view === 'week' ? Array.from({ length: 7 }, (_, index) => shiftDate(first, index)) : [first];
  const from = startOfZonedDay(first, timeZone);
  const to = new Date(from.getTime() + days.length * DAY_MS);
  const [nowIso] = useState(() => new Date().toISOString());
  const schedule = useQuery(
    scheduleQuery(churchId, { from: from.toISOString(), to: to.toISOString(), resourceId }),
  );
  const occurrences = schedule.data?.items[0]?.occurrences ?? [];
  const onDay = (day: string): BookingOccurrence[] => {
    const start = startOfZonedDay(day, timeZone).getTime();
    const end = start + DAY_MS;
    return occurrences.filter(
      (item) => new Date(item.startsAt).getTime() < end && new Date(item.endsAt).getTime() > start,
    );
  };
  const step = view === 'week' ? 7 : 1;
  const bookAt = (day: string, minutes: number) => {
    const startsAt = new Date(startOfZonedDay(day, timeZone).getTime() + minutes * 60_000);
    void navigate(
      `${base}/facilities/bookings/new?resourceId=${resourceId}&startsAt=${encodeURIComponent(startsAt.toISOString())}`,
    );
  };
  const hrefFor = (item: BookingOccurrence) => `${base}/facilities/bookings/${item.bookingId}`;
  const title =
    view === 'week'
      ? `${formatDate(first, 'dayMonth')} – ${formatDate(shiftDate(first, 6), 'dateShort')}`
      : formatDate(date, 'dateLong');

  return (
    <Section
      title={t('facilities.scheduleTitle')}
      icon={CalendarDays}
      action={
        <Segmented
          aria-label={t('facilities.viewLabel')}
          value={view}
          onChange={(value) => setState({ view: value })}
          options={[
            { value: 'day', label: t('facilities.viewDay') },
            { value: 'week', label: t('facilities.viewWeek') },
          ]}
          className="h-10 w-44"
        />
      }
    >
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={view === 'week' ? t('facilities.previousWeek') : t('facilities.previousDay')}
          onClick={() => setState({ date: shiftDate(date, -step) })}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={view === 'week' ? t('facilities.nextWeek') : t('facilities.nextDay')}
          onClick={() => setState({ date: shiftDate(date, step) })}
        >
          <ChevronRight />
        </Button>
        <p className="min-w-0 flex-1 truncate font-semibold tabular" aria-live="polite">
          {title}
        </p>
        {date !== today ? (
          <Button variant="ghost" size="sm" onClick={() => setState({ date: '' })}>
            {t('common.today')}
          </Button>
        ) : null}
      </div>

      {schedule.isPending ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : schedule.isError ? (
        <ErrorState
          error={schedule.error}
          message={getErrorMessage(schedule.error)}
          onRetry={() => void schedule.refetch()}
          retrying={schedule.isFetching}
        />
      ) : view === 'day' ? (
        <div className="flex flex-col gap-4" aria-busy={schedule.isFetching || undefined}>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <DayTimeline
                day={date}
                occurrences={onDay(date)}
                timeZone={timeZone}
                nowIso={nowIso}
                hrefFor={hrefFor}
                onSelect={canBook ? (minutes) => bookAt(date, minutes) : undefined}
              />
              {canBook ? (
                <p className="mt-2 text-xs text-muted-foreground">{t('facilities.tapToBook')}</p>
              ) : null}
            </CardContent>
          </Card>
          {onDay(date).length === 0 ? (
            <EmptyState
              compact
              icon={CalendarDays}
              tone={FACILITIES_TONE}
              title={t('facilities.dayFree')}
              description={t('facilities.dayFreeBody')}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {onDay(date).map((item) => (
                <OccurrenceRow
                  key={`${item.bookingId}-${item.startsAt}`}
                  occurrence={item}
                  showDate={false}
                  to={hrefFor(item)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2" aria-busy={schedule.isFetching || undefined}>
          {days.map((day) => {
            const items = onDay(day);
            return (
              <div
                key={day}
                className="grid grid-cols-1 gap-2 rounded-xl border border-border/70 bg-card p-3 shadow-soft sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-center"
              >
                <button
                  type="button"
                  onClick={() => setState({ view: 'day', date: day })}
                  className="flex items-baseline gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:flex-col sm:gap-0"
                >
                  <span className={day === today ? 'font-bold text-primary' : 'font-semibold'}>
                    {formatDate(day, 'weekday')}
                  </span>
                  <span className="text-xs text-muted-foreground tabular">
                    {formatDate(day, 'dayMonth')}
                  </span>
                </button>
                <div className="hidden sm:block">
                  <DayTimeline
                    day={day}
                    occurrences={items}
                    timeZone={timeZone}
                    nowIso={nowIso}
                    hrefFor={hrefFor}
                    compact
                    onSelect={canBook ? (minutes) => bookAt(day, minutes) : undefined}
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:hidden">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('facilities.dayFree')}</p>
                  ) : (
                    items.map((item) => (
                      <OccurrenceRow
                        key={`${item.bookingId}-${item.startsAt}`}
                        occurrence={item}
                        showDate={false}
                        to={hrefFor(item)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
