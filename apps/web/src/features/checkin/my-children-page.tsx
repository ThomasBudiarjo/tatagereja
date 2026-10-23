import { fullName, type CheckinChild, type CheckinMe } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Baby, Check, ChevronRight, Clock, House, LogIn, Printer, School } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { SkeletonCards, SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { checkinMeQuery, useCheckIn } from './api';
import { CHECKIN_TONE } from './checkin-lib';
import { AlertBadges, CheckinNav, ChildAvatar, SecurityCode } from './checkin-ui';

/**
 * The guardian's phone: who is in class now with the pick-up codes, self check-in for their
 * own household's children, and the way to each child's alerts and pick-up list.
 */
export function MyChildrenPage() {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const query = useQuery(checkinMeQuery(churchId));

  return (
    <Page>
      <PageHeader
        title={t('checkin.myChildrenTitle')}
        description={t('checkin.myChildrenDescription')}
        icon={Baby}
        tone={CHECKIN_TONE}
      />
      <CheckinNav />
      {query.isPending ? (
        <>
          <SkeletonCards count={1} />
          <SkeletonList rows={3} />
        </>
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <MyChildren me={query.data} />
      )}
    </Page>
  );
}

function MyChildren({ me }: { me: CheckinMe }) {
  const { base } = useChurch();
  const { t } = useI18n();
  const household = me.household;
  return (
    <>
      <CurrentCard me={me} />
      {!household ? (
        me.current.length === 0 ? (
          <EmptyState
            icon={House}
            tone={CHECKIN_TONE}
            title={t('checkin.noHousehold')}
            description={t('checkin.noHouseholdHint')}
          />
        ) : null
      ) : (
        <>
          <SelfCheckIn me={me} />
          <Section title={t('checkin.familyChildren', { name: household.name })} icon={House}>
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
              {household.children.map((child) => (
                <li key={child.id}>
                  <Link
                    to={`${base}/checkin/children/${child.id}`}
                    className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
                  >
                    <ChildAvatar child={child} alerts={child.alerts} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{fullName(child)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {child.age !== null
                          ? t('checkin.ageYears', { count: child.age })
                          : t('checkin.ageUnknown')}
                        {' · '}
                        {child.alerts.length > 0
                          ? t('checkin.alertsCount', { count: child.alerts.length })
                          : t('checkin.manageAlertsPickups')}
                      </p>
                      <AlertBadges alerts={child.alerts} className="mt-1" />
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </>
  );
}

/** "My children currently checked in", with the codes to show at pick-up. */
function CurrentCard({ me }: { me: CheckinMe }) {
  const { base } = useChurch();
  const { t, formatTime } = useI18n();
  if (me.current.length === 0) {
    return me.household ? (
      <Card>
        <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
          <School className="size-5 shrink-0" aria-hidden />
          {t('checkin.noneInClass')}
        </CardContent>
      </Card>
    ) : null;
  }
  const ids = me.current.map((item) => item.id).join(',');
  return (
    <section
      data-tone="success"
      aria-labelledby="checkin-current"
      className="flex animate-rise-in flex-col gap-3 rounded-2xl border border-tone/30 bg-tone-soft/50 p-4 shadow-soft"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="checkin-current" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-tone opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-tone" />
          </span>
          {t('checkin.currentTitle', { count: me.current.length })}
        </h2>
        <Button asChild size="sm" variant="outline">
          <Link to={`${base}/checkin/labels?ids=${ids}`}>
            <Printer />
            {t('checkin.showTags')}
          </Link>
        </Button>
      </div>
      <ul className="flex flex-col gap-2.5">
        {me.current.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3"
          >
            <ChildAvatar child={item.child} alerts={item.alerts} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{item.child.firstName}</p>
              <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3 shrink-0" aria-hidden />
                <span className="truncate">
                  {item.className} · {t('checkin.inSince', { time: formatTime(item.checkedInAt) })}
                </span>
              </p>
            </div>
            {item.securityCode ? <SecurityCode code={item.securityCode} size="sm" /> : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t('checkin.showCodeHint')}</p>
    </section>
  );
}

function SelfCheckIn({ me }: { me: CheckinMe }) {
  const { churchId } = useChurch();
  const { t, formatDate } = useI18n();
  const household = me.household!;
  const [sessionId, setSessionId] = useState(me.openSessions[0]?.id ?? '');
  const sessionValid = me.openSessions.some((session) => session.id === sessionId);
  const activeSessionId = sessionValid ? sessionId : (me.openSessions[0]?.id ?? '');
  // Children already in class (in any session today) cannot be checked in again.
  const inClassIds = new Set(me.current.map((item) => item.child.id));
  const ready = household.children.filter((child) => !inClassIds.has(child.id));
  const [selected, setSelected] = useState<string[]>([]);
  const checkIn = useMutationToast(useCheckIn(churchId, activeSessionId), {
    success: (result) => t('checkin.selfCheckedIn', { count: result.items.length }),
  });

  if (!me.allowSelfCheckIn) {
    return (
      <Alert variant="info" title={t('checkin.selfOff')}>
        {t('checkin.selfOffHint')}
      </Alert>
    );
  }
  if (me.openSessions.length === 0) {
    return (
      <Alert variant="info" title={t('checkin.selfNoSession')}>
        {t('checkin.selfNoSessionHint')}
      </Alert>
    );
  }
  if (ready.length === 0) return null;

  const toggle = (child: CheckinChild) =>
    setSelected((current) =>
      current.includes(child.id) ? current.filter((id) => id !== child.id) : [...current, child.id],
    );
  const submit = async () => {
    const result = await checkIn.run({
      children: selected.map((personId) => ({ personId, classId: null })),
      method: 'self',
    });
    if (result) setSelected([]);
  };

  return (
    <Section title={t('checkin.selfTitle')} description={t('checkin.selfHint')} icon={LogIn}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {me.openSessions.length > 1 ? (
            <Select
              aria-label={t('checkin.chooseSession')}
              value={activeSessionId}
              onChange={(event) => setSessionId(event.target.value)}
            >
              {me.openSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} · {formatDate(session.date, 'dayMonth')}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm font-medium">
              {me.openSessions[0]!.name} · {formatDate(me.openSessions[0]!.date, 'dateLong')}
            </p>
          )}
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {ready.map((child) => {
              const active = selected.includes(child.id);
              const noClass = !child.suggestedClassId;
              return (
                <li key={child.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    disabled={noClass}
                    onClick={() => toggle(child)}
                    className={cn(
                      'flex min-h-16 w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60',
                      active ? 'border-primary/60 bg-primary/[0.05]' : 'border-border/70 bg-card',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-lg border-2',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input',
                      )}
                    >
                      {active ? <Check className="size-4" /> : null}
                    </span>
                    <ChildAvatar child={child} alerts={child.alerts} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{child.firstName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {noClass
                          ? t('checkin.askTeacher')
                          : child.age !== null
                            ? t('checkin.ageYears', { count: child.age })
                            : t('checkin.ageUnknown')}
                      </span>
                    </span>
                    {child.currentCheckinId ? (
                      <StatusBadge tone="success" size="sm">
                        {t('checkin.inClass')}
                      </StatusBadge>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <Button
            size="lg"
            className="w-full sm:w-auto sm:self-start"
            disabled={selected.length === 0}
            loading={checkIn.isPending}
            onClick={() => void submit()}
          >
            <LogIn />
            {selected.length === 0
              ? t('checkin.chooseChildrenFirst')
              : t('checkin.checkInCount', { count: selected.length })}
          </Button>
        </CardContent>
      </Card>
    </Section>
  );
}
