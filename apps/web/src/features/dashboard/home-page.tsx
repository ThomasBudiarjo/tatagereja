import {
  HOME_WIDGET_LABELS,
  can,
  has,
  localize,
  type Dashboard,
  type HomeWidget,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  EyeOff,
  LayoutDashboard,
  RotateCcw,
  SlidersHorizontal,
  UserCheck,
  Users,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton, SkeletonCards, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useAuth } from '@/stores/auth';
import { dashboardQuery, useSaveDashboardPreferences } from './api';
import { HomeQuickActions } from './quick-actions';
import {
  AnnouncementsWidget,
  AttendanceWidget,
  CelebrationsWidget,
  EventsWidget,
  GroupsWidget,
  KidsWidget,
  NotificationsWidget,
  ScheduleWidget,
  TasksWidget,
} from './widgets';

const greetingKey = (hour: number): MessageKey =>
  hour < 11
    ? 'dashboard.greetingMorning'
    : hour < 15
      ? 'dashboard.greetingMidday'
      : hour < 18
        ? 'dashboard.greetingAfternoon'
        : 'dashboard.greetingEvening';

/** The hour of day in the church time zone, so the greeting matches the congregation's clock. */
const hourIn = (timeZone: string | undefined) => {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(
        new Date(),
      ),
    );
  } catch {
    return new Date().getHours();
  }
};

/** The personalised home: greeting, quick actions and the widgets the caller may use. */
export function HomePage() {
  const { church, base, access } = useChurch();
  const { user } = useAuth();
  const { t, timeZone, formatDate, formatNumber } = useI18n();
  const query = useQuery(dashboardQuery(church.id));
  const [customizing, setCustomizing] = useState(false);
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <Page size="wide">
      <div className="flex animate-page-in items-start gap-4">
        <EntityAvatar
          name={church.name}
          src={church.logoUrl}
          size="lg"
          className="hidden rounded-2xl sm:flex"
        />
        <PageHeader
          className="min-w-0 flex-1"
          eyebrow={church.name}
          tone="brand"
          title={
            firstName
              ? t(greetingKey(hourIn(timeZone)), { name: firstName })
              : t('dashboard.greetingNoName')
          }
          description={formatDate(new Date(), 'dateLong')}
          documentTitle={t('dashboard.title')}
          actions={
            query.data ? (
              <Button variant="outline" size="sm" onClick={() => setCustomizing(true)}>
                <SlidersHorizontal />
                <span className="hidden sm:inline">{t('dashboard.customize')}</span>
                <span className="sr-only sm:hidden">{t('dashboard.customizeTitle')}</span>
              </Button>
            ) : undefined
          }
        />
      </div>

      {query.isPending ? (
        <>
          <SkeletonStats />
          <Skeleton className="h-24" />
          <SkeletonCards count={4} className="lg:grid-cols-2" />
        </>
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t('dashboard.statPeople')}
              value={formatNumber(query.data.stats.people)}
              icon={Users}
              tone="sky"
              to={can.viewDirectory(access) ? `${base}/people` : undefined}
            />
            <StatCard
              label={t('dashboard.statGroups')}
              value={formatNumber(query.data.stats.activeGroups)}
              icon={UsersRound}
              tone="violet"
              to={has(access, 'groups.view') ? `${base}/groups` : undefined}
            />
            <StatCard
              label={t('dashboard.statUpcoming')}
              value={formatNumber(query.data.stats.upcomingEvents)}
              hint={t('dashboard.statUpcomingHint')}
              icon={CalendarDays}
              tone="amber"
              to={has(access, 'events.view') ? `${base}/events` : undefined}
            />
            <StatCard
              label={t('dashboard.statAccounts')}
              value={formatNumber(query.data.stats.members)}
              hint={t('dashboard.statAccountsHint')}
              icon={UserCheck}
              tone="teal"
            />
          </div>
          <Widgets data={query.data} onCustomize={() => setCustomizing(true)} />
          <CustomizeSheet open={customizing} onOpenChange={setCustomizing} data={query.data} />
        </>
      )}
    </Page>
  );
}

function Widgets({ data, onCustomize }: { data: Dashboard; onCustomize: () => void }) {
  const { t } = useI18n();
  const cards = data.widgets.flatMap((widget): { id: HomeWidget; node: React.ReactNode }[] => {
    switch (widget) {
      case 'quick_actions':
        return [];
      case 'notifications':
        return [{ id: widget, node: <NotificationsWidget data={data.notifications} /> }];
      case 'my_schedule':
        return data.mySchedule
          ? [{ id: widget, node: <ScheduleWidget items={data.mySchedule} /> }]
          : [];
      case 'my_tasks':
        return data.myTasks ? [{ id: widget, node: <TasksWidget data={data.myTasks} /> }] : [];
      case 'my_kids':
        // Only parents with children in class need this card.
        return data.myKids && data.myKids.length > 0
          ? [{ id: widget, node: <KidsWidget items={data.myKids} /> }]
          : [];
      case 'upcoming_events':
        return data.upcomingEvents
          ? [{ id: widget, node: <EventsWidget items={data.upcomingEvents} /> }]
          : [];
      case 'announcements':
        return data.announcements
          ? [{ id: widget, node: <AnnouncementsWidget data={data.announcements} /> }]
          : [];
      case 'birthdays':
        return data.celebrations
          ? [{ id: widget, node: <CelebrationsWidget items={data.celebrations} /> }]
          : [];
      case 'attendance_summary':
        return [{ id: widget, node: <AttendanceWidget data={data.attendance} /> }];
    }
  });
  const quickActions = data.widgets.includes('quick_actions');

  if (cards.length === 0 && !quickActions) {
    return (
      <EmptyState
        icon={EyeOff}
        tone="slate"
        title={t('dashboard.allHidden')}
        description={t('dashboard.allHiddenBody')}
        action={
          <Button variant="outline" onClick={onCustomize}>
            <SlidersHorizontal />
            {t('dashboard.customize')}
          </Button>
        }
      />
    );
  }

  return (
    <>
      {quickActions ? <HomeQuickActions /> : null}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <div key={card.id} className="min-w-0">
            {card.node}
          </div>
        ))}
        {data.myGroups.length > 0 ? <GroupsWidget items={data.myGroups} /> : null}
      </div>
    </>
  );
}

function CustomizeSheet({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Dashboard;
}) {
  const { churchId } = useChurch();
  const { t, locale } = useI18n();
  const save = useMutationToast(useSaveDashboardPreferences(churchId), {
    success: t('dashboard.layoutSaved'),
  });
  // Every available widget, in the caller's order (hidden ones keep their place).
  const ordered = [
    ...data.preferences.widgetOrder.filter((widget) => data.availableWidgets.includes(widget)),
    ...data.availableWidgets.filter((widget) => !data.preferences.widgetOrder.includes(widget)),
  ];
  const hidden = new Set(data.preferences.hiddenWidgets);

  const persist = (order: HomeWidget[], hiddenWidgets: HomeWidget[]) =>
    void save.run({ widgetOrder: order, hiddenWidgets });
  const move = (index: number, delta: number) => {
    const next = [...ordered];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    persist(next, [...hidden]);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <LayoutDashboard className="size-5 text-muted-foreground" aria-hidden />
            {t('dashboard.customizeTitle')}
          </SheetTitle>
          <SheetDescription>{t('dashboard.customizeDescription')}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <ul className="flex flex-col gap-2">
            {ordered.map((widget, index) => {
              const name = localize(HOME_WIDGET_LABELS[widget], locale);
              const visible = !hidden.has(widget);
              return (
                <li
                  key={widget}
                  className="flex min-h-14 items-center gap-2 rounded-xl border border-border/70 bg-card py-1.5 pr-1.5 pl-3"
                >
                  <Switch
                    checked={visible}
                    aria-label={t('dashboard.show', { name })}
                    onCheckedChange={(checked) =>
                      persist(
                        ordered,
                        checked
                          ? [...hidden].filter((item) => item !== widget)
                          : [...hidden, widget],
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={t('dashboard.moveUp', { name })}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={t('dashboard.moveDown', { name })}
                    disabled={index === ordered.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </li>
              );
            })}
          </ul>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => persist([], [])} disabled={save.isPending}>
            <RotateCcw />
            {t('dashboard.resetLayout')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('common.done')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
