import {
  canManageFacilities,
  canManageInventory,
  canRequestBooking,
  canViewFacilities,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  Building2,
  CalendarCheck,
  CalendarPlus,
  CalendarRange,
  DoorOpen,
  Hourglass,
  Package,
  PackagePlus,
  Wallet,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import type { ModuleTone } from '@/components/ui/tone';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { overviewQuery, resourcesQuery } from './api';
import { FACILITIES_TONE, INVENTORY_TONE } from './facilities-lib';
import { BookingStatusBadge, FacilitiesNav, OccurrenceRow } from './facilities-ui';

/** The module home: what happens today, what waits for a decision, and what needs attention. */
export function FacilitiesHomePage() {
  const { churchId, base, access } = useChurch();
  const { t, formatNumber, formatCurrency, formatDate, formatDateRange } = useI18n();
  const overview = useQuery(overviewQuery(churchId));
  const facilities = canViewFacilities(access);
  const manager = canManageFacilities(access);
  const canBook = canRequestBooking(access);
  const data = overview.data;
  // Today's rows name their room; the overview only carries its id.
  const resources = useQuery({ ...resourcesQuery(churchId), enabled: facilities });
  const resourceName = (id: string) =>
    resources.data?.items.find((resource) => resource.id === id)?.name;

  return (
    <Page size="wide">
      <PageHeader
        title={t('facilities.title')}
        description={t('facilities.description')}
        icon={Building2}
        tone={FACILITIES_TONE}
        actions={
          canBook ? (
            <Button asChild size="sm">
              <Link to={`${base}/facilities/bookings/new`}>
                <CalendarPlus />
                <span className="hidden sm:inline">{t('facilities.newBooking')}</span>
                <span className="sm:hidden">{t('facilities.book')}</span>
              </Link>
            </Button>
          ) : canManageInventory(access) ? (
            <Button asChild size="sm">
              <Link to={`${base}/facilities/inventory/new`}>
                <PackagePlus />
                {t('facilities.newAsset')}
              </Link>
            </Button>
          ) : null
        }
      />
      <FacilitiesNav />

      {data && manager && data.pendingCount > 0 ? (
        <Alert
          variant="warning"
          title={t('facilities.pendingBanner', { count: data.pendingCount })}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to={`${base}/facilities/bookings?tab=pending`}>{t('facilities.review')}</Link>
            </Button>
          }
        />
      ) : null}
      {data?.inventory && data.inventory.overdue > 0 ? (
        <Alert
          variant="error"
          title={t('facilities.overdueBanner', { count: data.inventory.overdue })}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to={`${base}/facilities/loans?scope=overdue`}>{t('common.open')}</Link>
            </Button>
          }
        />
      ) : null}

      {overview.isPending ? (
        <>
          <SkeletonStats />
          <SkeletonList rows={4} avatar={false} />
        </>
      ) : overview.isError ? (
        <ErrorState
          error={overview.error}
          message={getErrorMessage(overview.error)}
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
        />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {facilities ? (
              <>
                <StatCard
                  label={t('facilities.statRooms')}
                  value={formatNumber(data.resources.total)}
                  hint={t('facilities.statRoomsHint')}
                  icon={DoorOpen}
                  tone={FACILITIES_TONE}
                  to={`${base}/facilities/rooms`}
                />
                <StatCard
                  label={t('facilities.statAvailable')}
                  value={formatNumber(data.resources.availableNow)}
                  hint={t('facilities.statAvailableHint', { total: data.resources.total })}
                  icon={CalendarCheck}
                  tone="emerald"
                  to={`${base}/facilities/schedule`}
                />
                <StatCard
                  label={manager ? t('facilities.statPending') : t('facilities.statMyPending')}
                  value={formatNumber(data.pendingCount)}
                  icon={Hourglass}
                  tone={data.pendingCount > 0 ? 'amber' : 'slate'}
                  to={`${base}/facilities/bookings?tab=${manager ? 'pending' : 'mine'}`}
                />
              </>
            ) : null}
            {data.inventory ? (
              <StatCard
                label={t('facilities.statAssets')}
                value={formatNumber(data.inventory.totalAssets)}
                hint={formatCurrency(data.inventory.totalValue, { compact: true })}
                icon={Package}
                tone={INVENTORY_TONE}
                to={`${base}/facilities/inventory`}
              />
            ) : null}
            {data.inventory && !facilities ? (
              <>
                <StatCard
                  label={t('facilities.statOnLoan')}
                  value={formatNumber(data.inventory.onLoan)}
                  icon={AlarmClock}
                  tone={data.inventory.overdue > 0 ? 'rose' : 'sky'}
                  hint={
                    data.inventory.overdue > 0
                      ? t('facilities.statOverdueHint', { count: data.inventory.overdue })
                      : undefined
                  }
                  to={`${base}/facilities/loans`}
                />
                <StatCard
                  label={t('facilities.statMaintenanceDue')}
                  value={formatNumber(data.inventory.maintenanceDue)}
                  icon={Wrench}
                  tone={data.inventory.maintenanceDue > 0 ? 'amber' : 'slate'}
                />
                <StatCard
                  label={t('facilities.statValue')}
                  value={formatCurrency(data.inventory.totalValue, { compact: true })}
                  icon={Wallet}
                  tone="emerald"
                />
              </>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {facilities ? (
              <Section
                title={t('facilities.today')}
                description={formatDate(new Date(), 'dateLong')}
                icon={CalendarRange}
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`${base}/facilities/schedule`}>{t('facilities.fullSchedule')}</Link>
                  </Button>
                }
              >
                {data.today.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CalendarCheck}
                    tone={FACILITIES_TONE}
                    title={t('facilities.todayEmpty')}
                    description={t('facilities.todayEmptyBody')}
                    action={
                      canBook ? (
                        <Button asChild variant="outline">
                          <Link to={`${base}/facilities/bookings/new`}>
                            <CalendarPlus />
                            {t('facilities.newBooking')}
                          </Link>
                        </Button>
                      ) : null
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.today.map((item) => (
                      <OccurrenceRow
                        key={`${item.bookingId}-${item.startsAt}`}
                        occurrence={item}
                        resourceName={resourceName(item.resourceId)}
                        showDate={false}
                        to={`${base}/facilities/bookings/${item.bookingId}`}
                      />
                    ))}
                  </div>
                )}
              </Section>
            ) : null}

            <div className="flex min-w-0 flex-col gap-6">
              {facilities ? (
                <Section
                  title={t('facilities.myBookings')}
                  icon={CalendarCheck}
                  action={
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`${base}/facilities/bookings?tab=mine`}>{t('common.seeAll')}</Link>
                    </Button>
                  }
                >
                  {data.myUpcoming.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                      {t('facilities.myBookingsEmpty')}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {data.myUpcoming.map((booking) => (
                        <li key={booking.id}>
                          <Link
                            to={`${base}/facilities/bookings/${booking.id}`}
                            className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-soft pressable hover:border-border"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">
                                {booking.title}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {booking.resourceName}
                                {booking.nextOccurrence
                                  ? ` · ${formatDateRange(
                                      booking.nextOccurrence.startsAt,
                                      booking.nextOccurrence.endsAt,
                                    )}`
                                  : ''}
                              </span>
                            </span>
                            <BookingStatusBadge status={booking.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              ) : null}

              {data.inventory ? (
                <Section
                  title={t('facilities.inventoryHealth')}
                  icon={Package}
                  action={
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`${base}/facilities/inventory`}>{t('common.seeAll')}</Link>
                    </Button>
                  }
                >
                  <div className="grid grid-cols-2 gap-2">
                    <HealthTile
                      label={t('facilities.statOnLoan')}
                      value={formatNumber(data.inventory.onLoan)}
                      tone="sky"
                      to={`${base}/facilities/loans`}
                    />
                    <HealthTile
                      label={t('facilities.statOverdue')}
                      value={formatNumber(data.inventory.overdue)}
                      tone={data.inventory.overdue > 0 ? 'rose' : 'slate'}
                      to={`${base}/facilities/loans?scope=overdue`}
                    />
                    <HealthTile
                      label={t('facilities.statMaintenance')}
                      value={formatNumber(data.inventory.inMaintenance)}
                      tone={data.inventory.inMaintenance > 0 ? 'amber' : 'slate'}
                      to={`${base}/facilities/inventory?status=maintenance`}
                    />
                    <HealthTile
                      label={t('facilities.statNeedsAttention')}
                      value={formatNumber(data.inventory.needsAttention)}
                      tone={data.inventory.needsAttention > 0 ? 'amber' : 'slate'}
                      to={`${base}/facilities/inventory?condition=poor`}
                    />
                  </div>
                  {data.inventory.maintenanceDue > 0 ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Wrench className="size-4" aria-hidden />
                      {t('facilities.maintenanceDueSoon', { count: data.inventory.maintenanceDue })}
                    </p>
                  ) : null}
                  {data.inventory.overdueLoans.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {data.inventory.overdueLoans.map((loan) => (
                        <li key={loan.id}>
                          <Link
                            to={`${base}/facilities/inventory/${loan.assetId}`}
                            className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-2.5 shadow-soft pressable hover:border-border"
                          >
                            <EntityAvatar
                              name={loan.borrowerName}
                              src={loan.borrower?.photoUrl}
                              size="sm"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {loan.assetName}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {loan.borrowerName}
                              </span>
                            </span>
                            <StatusBadge tone="danger" size="sm">
                              {t('facilities.overdueSinceShort', {
                                date: formatDate(loan.dueDate, 'dayMonth'),
                              })}
                            </StatusBadge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Section>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </Page>
  );
}

function HealthTile({
  label,
  value,
  tone,
  to,
}: {
  label: string;
  value: string;
  tone: ModuleTone;
  to: string;
}) {
  return (
    <Link
      to={to}
      data-tone={tone}
      className="flex flex-col gap-0.5 rounded-xl border border-border/70 bg-card p-3 shadow-soft pressable hover:border-border"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-bold tracking-tight text-tone-ink tabular">{value}</span>
    </Link>
  );
}
