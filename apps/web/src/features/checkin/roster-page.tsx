import { fullName } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, RefreshCw, School, ScanLine, TriangleAlert, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { AvatarGroup } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { PrintButton, PrintHeader } from '@/components/ui/print';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isGone } from '@/lib/use-mutation-toast';
import { rosterQuery } from './api';
import { CHECKIN_TONE } from './checkin-lib';
import { AlertCallout, CheckinListRow, ChildAvatar, ClassDot } from './checkin-ui';
import { CheckoutDialog } from './checkout-dialog';

/**
 * The live class roster for teachers: who is in class, every alert in full, the headcount and
 * the ratio of children per teacher. It refreshes on its own while it is open.
 */
export function RosterPage() {
  const { sessionId = '', classId = '' } = useParams();
  const { churchId, base, church } = useChurch();
  const { t, formatNumber, formatDate, formatTime } = useI18n();
  const query = useQuery(rosterQuery(churchId, sessionId, classId));
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const sessionPath = `${base}/checkin/sessions/${sessionId}`;
  const breadcrumbs = [
    { label: t('checkin.nav'), to: `${base}/checkin` },
    { label: query.data?.session.name ?? t('checkin.sessionTitle'), to: sessionPath },
  ];

  if (query.isPending) {
    return (
      <Page size="wide">
        <PageHeader title={t('checkin.rosterTitle')} breadcrumbs={breadcrumbs} />
        <SkeletonStats count={3} />
        <SkeletonList rows={6} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page size="wide">
        <PageHeader title={t('checkin.rosterTitle')} breadcrumbs={breadcrumbs} />
        {isGone(query.error) ? (
          <EmptyState
            icon={School}
            tone={CHECKIN_TONE}
            title={t('checkin.rosterNotFound')}
            action={
              <Button asChild variant="outline">
                <Link to={`${base}/checkin`}>{t('checkin.nav')}</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            error={query.error}
            message={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )}
      </Page>
    );
  }

  const { class: item, session, checkins, presentCount, teacherCount, ratioExceeded } = query.data;
  const present = checkins.filter((checkin) => checkin.status === 'checked_in');
  const pickedUp = checkins.filter((checkin) => checkin.status === 'checked_out');
  const withAlerts = present.filter((checkin) => checkin.alerts.length > 0);
  const open = session.status === 'open';
  const full = item.capacity !== null && presentCount >= item.capacity;

  return (
    <Page size="wide">
      <PrintHeader
        churchName={church.name}
        logoUrl={church.logoUrl}
        title={`${item.name} · ${session.name}`}
        subtitle={formatDate(session.date, 'dateLong')}
      />
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <ClassDot color={item.color} className="size-3.5" />
            {item.name}
          </span>
        }
        documentTitle={`${item.name} · ${session.name}`}
        eyebrow={`${session.name} · ${formatDate(session.date, 'dayMonth')}`}
        tone={CHECKIN_TONE}
        breadcrumbs={[...breadcrumbs, { label: item.name }]}
        actions={
          <>
            <PrintButton size="sm" label={t('checkin.printRoster')} />
            {open ? (
              <Button asChild size="sm" data-print="hide">
                <Link to={`${sessionPath}/station`}>
                  <ScanLine />
                  <span className="hidden sm:inline">{t('checkin.startStation')}</span>
                  <span className="sr-only sm:hidden">{t('checkin.startStation')}</span>
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <p
        data-print="hide"
        className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <RefreshCw
          className={query.isFetching ? 'size-3.5 animate-spin' : 'size-3.5'}
          aria-hidden
        />
        {t('checkin.liveUpdated', { time: formatTime(new Date(query.dataUpdatedAt)) })}
      </p>

      {ratioExceeded ? (
        <Alert variant="warning" title={t('checkin.ratioWarningTitle')}>
          {t('checkin.ratioWarningBody', {
            children: presentCount,
            teachers: teacherCount,
            max: item.maxChildrenPerTeacher ?? 0,
          })}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('checkin.headcount')}
          value={
            <>
              {formatNumber(presentCount)}
              {item.capacity !== null ? (
                <span className="text-base font-medium text-muted-foreground">
                  {' '}
                  / {formatNumber(item.capacity)}
                </span>
              ) : null}
            </>
          }
          hint={full ? t('checkin.classFull') : t('checkin.headcountHint')}
          icon={Users}
          tone={full ? 'danger' : CHECKIN_TONE}
        />
        <StatCard
          label={t('checkin.statTeachersInClass')}
          value={formatNumber(teacherCount)}
          hint={
            item.maxChildrenPerTeacher
              ? t('checkin.ratioLimit', { max: item.maxChildrenPerTeacher })
              : undefined
          }
          icon={School}
          tone={ratioExceeded ? 'warning' : 'teal'}
        />
        <StatCard
          label={t('checkin.statAlertsInClass')}
          value={formatNumber(withAlerts.length)}
          icon={TriangleAlert}
          tone={withAlerts.length > 0 ? 'rose' : 'emerald'}
        />
        <StatCard
          label={t('checkin.statPickedUp')}
          value={formatNumber(pickedUp.length)}
          icon={CircleCheck}
          tone="sky"
        />
      </div>

      {item.teachers.length > 0 ? (
        <div className="flex items-center gap-3">
          <AvatarGroup
            people={item.teachers.map((teacher) => ({
              id: teacher.id,
              name: fullName(teacher),
              src: teacher.photoUrl,
            }))}
            max={5}
          />
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {item.teachers.map((teacher) => teacher.firstName).join(', ')}
          </p>
        </div>
      ) : null}

      {withAlerts.length > 0 ? (
        <Section title={t('checkin.alertsInClass')} icon={TriangleAlert}>
          <div className="grid gap-2.5 md:grid-cols-2">
            {withAlerts.map((checkin) => (
              <div
                key={checkin.id}
                className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-3 shadow-soft"
              >
                <div className="flex items-center gap-2.5">
                  <ChildAvatar child={checkin.child} alerts={checkin.alerts} size="sm" />
                  <p className="min-w-0 flex-1 truncate font-medium">{fullName(checkin.child)}</p>
                </div>
                <AlertCallout alerts={checkin.alerts} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={t('checkin.inClassNow', { count: present.length })} icon={Users}>
        {present.length === 0 ? (
          <EmptyState
            icon={Users}
            tone={CHECKIN_TONE}
            title={t('checkin.rosterEmpty')}
            description={open ? t('checkin.rosterEmptyHint') : undefined}
          />
        ) : (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
            {present.map((checkin) => (
              <CheckinListRow
                key={checkin.id}
                checkin={checkin}
                showClass={false}
                alertsInFull
                onCheckOut={() => setCheckingOut(checkin.id)}
              />
            ))}
          </ul>
        )}
      </Section>

      {pickedUp.length > 0 ? (
        <Section title={t('checkin.pickedUpList', { count: pickedUp.length })} icon={CircleCheck}>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card/70">
            {pickedUp.map((checkin) => (
              <CheckinListRow key={checkin.id} checkin={checkin} showClass={false} />
            ))}
          </ul>
        </Section>
      ) : null}

      <CheckoutDialog
        checkinId={checkingOut}
        open={!!checkingOut}
        onOpenChange={(next) => {
          if (!next) setCheckingOut(null);
        }}
      />
    </Page>
  );
}
