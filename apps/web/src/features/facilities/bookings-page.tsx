import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  canCancelBooking,
  canDecideBooking,
  canEditBooking,
  canRequestBooking,
  localize,
  type BookingStatus,
  type FacilityBooking,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  CalendarPlus,
  CircleCheck,
  CircleX,
  Pencil,
  Repeat,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { DataList } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { bookingsQuery, resourcesQuery, type BookingListParams } from './api';
import { CancelBookingDialog, DecisionDialog } from './booking-dialogs';
import { BOOKING_STATUS_TONES, FACILITIES_TONE } from './facilities-lib';
import { BookingStatusBadge, FacilitiesNav } from './facilities-ui';

const PAGE_SIZE = 25;
const TABS = ['upcoming', 'mine', 'pending', 'past'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, MessageKey> = {
  upcoming: 'facilities.tabUpcoming',
  mine: 'facilities.tabMine',
  pending: 'facilities.tabPending',
  past: 'facilities.tabPast',
};

export function BookingsPage() {
  const { churchId, base, access } = useChurch();
  const { t, locale, formatDateRange, formatDate } = useI18n();
  const navigate = useNavigate();
  const manager = canDecideBooking(access);
  const tabs = TABS.filter((tab) => tab !== 'pending' || manager);
  const [state, setState, reset] = useUrlState({
    tab: 'upcoming',
    q: '',
    resourceId: '',
    status: '',
    page: 1,
  });
  const tab: Tab = (tabs as readonly string[]).includes(state.tab)
    ? (state.tab as Tab)
    : 'upcoming';
  const status = (BOOKING_STATUSES as readonly string[]).includes(state.status)
    ? (state.status as BookingStatus)
    : undefined;
  const params: BookingListParams = {
    q: state.q || undefined,
    resourceId: state.resourceId || undefined,
    page: state.page,
    limit: PAGE_SIZE,
    ...(tab === 'upcoming' ? { scope: 'upcoming', status } : {}),
    ...(tab === 'mine' ? { scope: 'all', mine: true, status } : {}),
    ...(tab === 'pending' ? { scope: 'upcoming', status: 'pending' } : {}),
    ...(tab === 'past' ? { scope: 'past', status } : {}),
  };
  const query = useQuery(bookingsQuery(churchId, params));
  const resources = useQuery(resourcesQuery(churchId, {}));
  const [deciding, setDeciding] = useState<{
    booking: FacilityBooking;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [cancelling, setCancelling] = useState<FacilityBooking | null>(null);
  const filtered = !!(state.q || state.resourceId || state.status);

  const filters: FilterDefinition[] = [
    {
      id: 'resourceId',
      label: t('facilities.filterRoom'),
      value: state.resourceId,
      onChange: (resourceId) => setState({ resourceId }),
      options: (resources.data?.items ?? []).map((resource) => ({
        value: resource.id,
        label: resource.name,
      })),
    },
    ...(tab !== 'pending'
      ? [
          {
            id: 'status',
            label: t('facilities.filterStatus'),
            value: state.status,
            onChange: (value: string) => setState({ status: value }),
            options: BOOKING_STATUSES.filter(
              (value) => manager || tab === 'mine' || value === 'approved',
            ).map((value) => ({
              value,
              label: localize(BOOKING_STATUS_LABELS[value], locale),
            })),
          },
        ]
      : []),
  ];

  const emptyTitle: Record<Tab, MessageKey> = {
    upcoming: 'facilities.noUpcoming',
    mine: 'facilities.noMine',
    pending: 'facilities.noPending',
    past: 'facilities.noPast',
  };

  return (
    <Page size="wide">
      <PageHeader
        title={t('facilities.bookingsTitle')}
        description={t('facilities.bookingsDescription')}
        breadcrumbs={[
          { label: t('facilities.nav'), to: `${base}/facilities` },
          { label: t('facilities.bookingsTitle') },
        ]}
        actions={
          canRequestBooking(access) ? (
            <Button asChild size="sm">
              <Link to={`${base}/facilities/bookings/new`}>
                <CalendarPlus />
                {t('facilities.newBooking')}
              </Link>
            </Button>
          ) : null
        }
      />
      <FacilitiesNav />
      <Tabs
        value={tab}
        onValueChange={(value) => setState({ tab: value, status: '' }, { push: true })}
      >
        <TabsList variant="underline">
          {tabs.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(TAB_LABELS[value])}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('facilities.searchBookings'),
        }}
        filters={filters}
        onReset={() => reset(['tab'])}
      />

      {query.isPending ? (
        <SkeletonList rows={6} avatar={false} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          tone={tab === 'pending' ? 'success' : FACILITIES_TONE}
          title={filtered ? t('facilities.noBookingsFound') : t(emptyTitle[tab])}
          description={filtered ? t('common.noResultsHint') : t('facilities.noBookingsBody')}
          action={
            filtered ? (
              <Button variant="outline" onClick={() => reset(['tab'])}>
                {t('common.clearAll')}
              </Button>
            ) : canRequestBooking(access) && tab !== 'pending' ? (
              <Button asChild>
                <Link to={`${base}/facilities/bookings/new`}>
                  <CalendarPlus />
                  {t('facilities.newBooking')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-3" aria-busy={query.isFetching || undefined}>
          <DataList
            items={query.data.items}
            getKey={(booking) => booking.id}
            href={(booking) => `${base}/facilities/bookings/${booking.id}`}
            leading={(booking) => {
              const when = booking.nextOccurrence?.startsAt ?? booking.startsAt;
              return (
                <span
                  data-tone={booking.status === 'pending' ? 'warning' : FACILITIES_TONE}
                  className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-tone-soft py-1.5 text-tone-ink"
                  aria-hidden
                >
                  <span className="text-[10px] font-semibold uppercase">
                    {formatDate(when, 'weekdayShort')}
                  </span>
                  <span className="text-lg leading-tight font-bold tabular">
                    {formatDate(when, { options: { day: 'numeric' } })}
                  </span>
                </span>
              );
            }}
            title={(booking) => (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{booking.title}</span>
                {booking.recurrence === 'weekly' ? (
                  <Repeat
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-label={t('facilities.weekly')}
                  />
                ) : null}
              </span>
            )}
            subtitle={(booking) => (
              <>
                {/* Phones have no room for the badge: the status leads the second line. */}
                {booking.status !== 'approved' ? (
                  <span
                    data-tone={BOOKING_STATUS_TONES[booking.status]}
                    className="font-medium text-tone-ink sm:hidden"
                  >
                    {localize(BOOKING_STATUS_LABELS[booking.status], locale)}
                    {' · '}
                  </span>
                ) : null}
                {[
                  booking.resourceName,
                  booking.nextOccurrence
                    ? formatDateRange(
                        booking.nextOccurrence.startsAt,
                        booking.nextOccurrence.endsAt,
                      )
                    : formatDateRange(booking.startsAt, booking.endsAt),
                  booking.groupName ?? booking.requesterName,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </>
            )}
            trailing={(booking) => (
              <span className="hidden sm:contents">
                <BookingStatusBadge status={booking.status} />
              </span>
            )}
            actionsLabel={(booking) => t('facilities.bookingActions', { title: booking.title })}
            actions={(booking) => [
              {
                id: 'approve',
                label: t('facilities.approve'),
                icon: CircleCheck,
                hidden: !manager || booking.status !== 'pending',
                onSelect: () => setDeciding({ booking, decision: 'approved' }),
              },
              {
                id: 'reject',
                label: t('facilities.reject'),
                icon: CircleX,
                hidden: !manager || booking.status !== 'pending',
                onSelect: () => setDeciding({ booking, decision: 'rejected' }),
              },
              {
                id: 'edit',
                label: t('common.edit'),
                icon: Pencil,
                hidden: !canEditBooking(access, booking) || !booking.nextOccurrence,
                onSelect: () => void navigate(`${base}/facilities/bookings/${booking.id}/edit`),
              },
              {
                id: 'cancel',
                label: t('facilities.cancelBooking'),
                icon: XCircle,
                destructive: true,
                hidden:
                  !canCancelBooking(access, booking) ||
                  (booking.status !== 'pending' && booking.status !== 'approved'),
                onSelect: () => setCancelling(booking),
              },
            ]}
          />
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => {
              setState({ page }, { push: true });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      )}

      {deciding ? (
        <DecisionDialog
          booking={deciding.booking}
          decision={deciding.decision}
          onOpenChange={(open) => {
            if (!open) setDeciding(null);
          }}
        />
      ) : null}
      {cancelling ? (
        <CancelBookingDialog
          booking={cancelling}
          open
          onOpenChange={(open) => {
            if (!open) setCancelling(null);
          }}
        />
      ) : null}
    </Page>
  );
}
