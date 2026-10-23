import {
  CHECKIN_LIMITS,
  fullName,
  type CheckinChild,
  type CheckinChildListItem,
  type CheckinClass,
  type CheckinHousehold,
  type Checkin,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  CircleCheckBig,
  Expand,
  House,
  LogIn,
  LogOut,
  Phone,
  Printer,
  ScanLine,
  Search,
  Shrink,
  UserPlus,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Alert, Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { SkeletonCards, SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useDebounced } from '@/lib/use-debounced';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import {
  classesQuery,
  householdsQuery,
  sessionCheckinsQuery,
  sessionQuery,
  useCheckIn,
} from './api';
import { CHECKIN_TONE, useCheckinAccess } from './checkin-lib';
import { AlertBadges, CheckinListRow, ChildAvatar, SecurityCode } from './checkin-ui';
import { CheckoutDialog } from './checkout-dialog';
import { NewChildDialog } from './child-dialogs';

type Mode = 'in' | 'out';

/** A family picked at the station, or the first-time children registered at the door. */
type Family = Pick<CheckinHousehold, 'name' | 'guardians' | 'phoneLast4'> & {
  householdId: string | null;
  children: CheckinChild[];
};

/**
 * The check-in station: large buttons for the welcome table or a self-service kiosk. Find a
 * family by name or the last four digits of a phone, choose the children, check them in and
 * print the labels. The check-out tab finds a child in class for the pick-up.
 */
export function StationPage() {
  const { sessionId = '' } = useParams();
  const { churchId, base } = useChurch();
  const { t, formatDate } = useI18n();
  const { canOperate } = useCheckinAccess();
  const [state, setState] = useUrlState({ mode: 'in', kiosk: false as boolean });
  const mode: Mode = state.mode === 'out' && !state.kiosk ? 'out' : 'in';
  const session = useQuery(sessionQuery(churchId, sessionId));
  const classes = useQuery(classesQuery(churchId, false));
  const fullscreen = useFullscreen();
  useDocumentTitle(
    session.data ? `${t('checkin.stationTitle')} · ${session.data.session.name}` : null,
  );
  const sessionPath = `${base}/checkin/sessions/${sessionId}`;

  if (session.isPending) {
    return (
      <Page size="wide">
        <SkeletonCards count={3} />
      </Page>
    );
  }
  if (session.isError) {
    return (
      <Page size="wide">
        <ErrorState
          error={session.error}
          message={getErrorMessage(session.error)}
          onRetry={() => void session.refetch()}
          retrying={session.isFetching}
        />
      </Page>
    );
  }
  const { session: current } = session.data;
  const open = current.status === 'open';

  return (
    <Page size="wide" className="gap-4 sm:gap-5">
      <header className="flex animate-page-in flex-col gap-3">
        <div className="flex items-center gap-2">
          {state.kiosk ? null : (
            <Button asChild variant="ghost" size="icon-lg" className="-ml-2.5 shrink-0">
              <Link to={sessionPath} aria-label={t('checkin.backToSession')}>
                <ArrowLeft />
              </Link>
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <p data-tone={CHECKIN_TONE} className="text-overline text-tone-ink">
              {state.kiosk ? t('checkin.kioskEyebrow') : t('checkin.stationTitle')}
            </p>
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
              {current.name} · {formatDate(current.date, 'dayMonth')}
            </h1>
          </div>
          {fullscreen.supported ? (
            <Button
              variant="outline"
              size="icon-lg"
              onClick={fullscreen.toggle}
              aria-label={fullscreen.active ? t('checkin.exitFullscreen') : t('checkin.fullscreen')}
            >
              {fullscreen.active ? <Shrink /> : <Expand />}
            </Button>
          ) : null}
        </div>
        {state.kiosk ? null : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Segmented<Mode>
              aria-label={t('checkin.stationMode')}
              value={mode}
              onChange={(value) => setState({ mode: value })}
              className="h-12 sm:max-w-sm"
              options={[
                { value: 'in', label: t('checkin.checkIn'), icon: LogIn },
                { value: 'out', label: t('checkin.checkOut'), icon: LogOut },
              ]}
            />
            <label className="flex min-h-11 items-center gap-3 text-sm sm:ml-auto">
              <Switch
                checked={state.kiosk}
                onCheckedChange={(kiosk) => {
                  setState({ kiosk, mode: 'in' });
                  if (kiosk && !fullscreen.active) fullscreen.toggle();
                }}
              />
              <span>
                <span className="font-medium">{t('checkin.kioskMode')}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('checkin.kioskModeHint')}
                </span>
              </span>
            </label>
          </div>
        )}
      </header>

      {!open ? (
        <Alert variant="warning" title={t('checkin.sessionClosedBanner')}>
          {t('checkin.stationClosedBody')}
        </Alert>
      ) : mode === 'in' ? (
        <CheckInPanel
          sessionId={sessionId}
          classes={classes.data?.items ?? []}
          kiosk={state.kiosk}
          canRegister={canOperate && !state.kiosk}
        />
      ) : (
        <CheckOutPanel sessionId={sessionId} />
      )}

      {state.kiosk ? (
        <div className="flex justify-center pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setState({ kiosk: false })}
          >
            {t('checkin.exitKiosk')}
          </Button>
        </div>
      ) : null}
    </Page>
  );
}

function CheckInPanel({
  sessionId,
  classes,
  kiosk,
  canRegister,
}: {
  sessionId: string;
  classes: CheckinClass[];
  kiosk: boolean;
  canRegister: boolean;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const searching = q.length >= CHECKIN_LIMITS.kioskQueryMin;
  const households = useQuery({
    ...householdsQuery(churchId, q, sessionId),
    enabled: searching,
  });
  const [family, setFamily] = useState<Family | null>(null);
  const [visitors, setVisitors] = useState<CheckinChild[]>([]);
  const [registering, setRegistering] = useState(false);
  const [done, setDone] = useState<Checkin[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const restart = () => {
    setFamily(null);
    setDone(null);
    setVisitors([]);
    setSearch('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  if (done) return <CheckInDone items={done} onNext={restart} />;

  if (family) {
    return (
      <FamilyCheckIn
        key={family.householdId ?? 'visitors'}
        sessionId={sessionId}
        family={family}
        classes={classes}
        kiosk={kiosk}
        onBack={() => setFamily(null)}
        onDone={setDone}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoFocus
            autoComplete="off"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('checkin.stationSearchShort')}
            aria-label={t('checkin.stationSearch')}
            className="h-14 rounded-xl pl-12 text-lg md:text-lg"
          />
        </div>
        {canRegister ? (
          <Button variant="outline" size="lg" className="h-14" onClick={() => setRegistering(true)}>
            <UserPlus />
            {t('checkin.newChild')}
          </Button>
        ) : null}
      </div>

      {visitors.length > 0 ? (
        <button
          type="button"
          onClick={() =>
            setFamily({
              householdId: null,
              name: t('checkin.firstTimeChildren'),
              guardians: [],
              phoneLast4: null,
              children: visitors,
            })
          }
          className="flex pressable items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/[0.04] p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <UserPlus className="size-6 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t('checkin.firstTimeChildren')}</span>
            <span className="block truncate text-sm text-muted-foreground">
              {visitors.map((child) => child.firstName).join(', ')}
            </span>
          </span>
          <span className="text-sm font-semibold text-primary">{t('checkin.continue')}</span>
        </button>
      ) : null}

      {!searching ? (
        <EmptyState
          icon={ScanLine}
          tone={CHECKIN_TONE}
          title={t('checkin.stationStart')}
          description={t('checkin.stationStartHint')}
        />
      ) : households.isPending ? (
        <SkeletonList rows={3} />
      ) : households.isError ? (
        <ErrorState
          error={households.error}
          message={getErrorMessage(households.error)}
          onRetry={() => void households.refetch()}
          retrying={households.isFetching}
        />
      ) : households.data.items.length === 0 ? (
        <EmptyState
          icon={House}
          tone={CHECKIN_TONE}
          title={t('checkin.noFamilyFound')}
          description={kiosk ? t('checkin.noFamilyKiosk') : t('checkin.noFamilyHint')}
          action={
            canRegister ? (
              <Button onClick={() => setRegistering(true)}>
                <UserPlus />
                {t('checkin.newChild')}
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-busy={households.isFetching || undefined}>
          {households.data.items.map((home) => (
            <li key={home.householdId}>
              <FamilyCard home={home} onSelect={() => setFamily(home)} />
            </li>
          ))}
        </ul>
      )}

      {canRegister ? (
        <NewChildDialog
          classes={classes}
          open={registering}
          onOpenChange={setRegistering}
          onCreated={(child: CheckinChildListItem) => {
            const next = [...visitors, child];
            setVisitors(next);
            setFamily({
              householdId: null,
              name: t('checkin.firstTimeChildren'),
              guardians: [],
              phoneLast4: null,
              children: next,
            });
          }}
        />
      ) : null}
    </div>
  );
}

function FamilyCard({ home, onSelect }: { home: CheckinHousehold; onSelect: () => void }) {
  const { t } = useI18n();
  const inClass = home.children.filter((child) => child.currentCheckinId).length;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full pressable flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      <span className="flex items-start gap-3">
        <span
          data-tone={CHECKIN_TONE}
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-tone-soft text-tone-ink"
          aria-hidden
        >
          <House className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-semibold tracking-tight">{home.name}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {home.guardians.map((guardian) => guardian.firstName).join(' & ') ||
              t('checkin.noGuardians')}
          </span>
        </span>
        {home.phoneLast4 ? (
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono text-xs font-semibold">
            <Phone className="size-3" aria-hidden />
            ••{home.phoneLast4}
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap gap-1.5">
        {home.children.map((child) => (
          <span
            key={child.id}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm',
              child.currentCheckinId
                ? 'border-success/30 bg-success/10 text-muted-foreground'
                : 'border-border/70 bg-sunken/60',
            )}
          >
            {child.currentCheckinId ? <Check className="size-3.5" aria-hidden /> : null}
            {child.firstName}
            {child.age !== null ? (
              <span className="text-xs text-muted-foreground">{child.age}</span>
            ) : null}
          </span>
        ))}
      </span>
      {inClass > 0 ? (
        <span className="text-xs text-muted-foreground">
          {t('checkin.alreadyInClass', { count: inClass })}
        </span>
      ) : null}
    </button>
  );
}

function FamilyCheckIn({
  sessionId,
  family,
  classes,
  kiosk,
  onBack,
  onDone,
}: {
  sessionId: string;
  family: Family;
  classes: CheckinClass[];
  kiosk: boolean;
  onBack: () => void;
  onDone: (items: Checkin[]) => void;
}) {
  const { churchId } = useChurch();
  const { t, formatNumber } = useI18n();
  const available = family.children.filter((child) => !child.currentCheckinId);
  const [selected, setSelected] = useState<string[]>(available.map((child) => child.id));
  const [classFor, setClassFor] = useState<Record<string, string>>({});
  const [guardianId, setGuardianId] = useState<string | null>(family.guardians[0]?.id ?? null);
  const checkIn = useMutationToast(useCheckIn(churchId, sessionId), {
    success: (result) => t('checkin.checkedIn', { count: result.items.length }),
  });
  const classOf = (child: CheckinChild) => classFor[child.id] ?? child.suggestedClassId ?? '';
  const missingClass = selected.some((id) => {
    const child = family.children.find((item) => item.id === id);
    return child ? !classOf(child) : false;
  });
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const submit = async () => {
    const result = await checkIn.run({
      children: selected.map((personId) => {
        const child = family.children.find((item) => item.id === personId);
        return { personId, classId: child ? classOf(child) || null : null };
      }),
      guardianPersonId: guardianId,
      method: kiosk ? 'kiosk' : 'staff',
    });
    if (result) onDone(result.items);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-lg"
          className="-ml-2.5"
          onClick={onBack}
          aria-label={t('common.back')}
        >
          <ArrowLeft />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight">{family.name}</h2>
      </div>

      {family.guardians.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t('checkin.whoBrings')}</legend>
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {family.guardians.map((guardian) => {
              const active = guardianId === guardian.id;
              return (
                <button
                  key={guardian.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setGuardianId(guardian.id)}
                  className={cn(
                    'inline-flex h-12 items-center gap-2 rounded-xl border px-4 text-base font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                    active
                      ? 'border-primary/60 bg-primary/[0.08] text-foreground'
                      : 'border-border/70 bg-card text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {active ? <Check className="size-4 text-primary" aria-hidden /> : null}
                  {fullName(guardian)}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t('checkin.chooseChildren')}</legend>
        <ul className="grid gap-3 md:grid-cols-2">
          {family.children.map((child) => {
            const inClass = !!child.currentCheckinId;
            const active = selected.includes(child.id);
            const classId = classOf(child);
            return (
              <li
                key={child.id}
                className={cn(
                  'flex flex-col gap-3 rounded-2xl border-2 p-3.5 transition-colors',
                  inClass
                    ? 'border-border/60 bg-muted/40'
                    : active
                      ? 'border-primary/60 bg-primary/[0.05]'
                      : 'border-border/70 bg-card',
                )}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  disabled={inClass}
                  onClick={() => toggle(child.id)}
                  className="flex min-h-14 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors',
                      active && !inClass
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-card',
                    )}
                  >
                    {active && !inClass ? <Check className="size-5" /> : null}
                  </span>
                  <ChildAvatar child={child} alerts={child.alerts} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-semibold">{fullName(child)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {child.age !== null
                        ? t('checkin.ageYears', { count: child.age })
                        : t('checkin.ageUnknown')}
                    </span>
                  </span>
                  {inClass ? (
                    <StatusBadge tone="success" dot>
                      {t('checkin.inClass')}
                    </StatusBadge>
                  ) : null}
                </button>
                {!inClass ? (
                  <>
                    <AlertBadges alerts={child.alerts} />
                    {active ? (
                      <Select
                        aria-label={t('checkin.classFor', { name: child.firstName })}
                        value={classId}
                        onChange={(event) =>
                          setClassFor((current) => ({ ...current, [child.id]: event.target.value }))
                        }
                        aria-invalid={!classId}
                        className="h-12"
                      >
                        <option value="" disabled>
                          {t('checkin.chooseClass')}
                        </option>
                        {classes.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </fieldset>

      {available.length === 0 ? <Alert variant="success" title={t('checkin.allInClass')} /> : null}

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button
          size="lg"
          className="h-14 w-full text-lg md:w-auto md:min-w-72"
          disabled={selected.length === 0 || missingClass}
          loading={checkIn.isPending}
          onClick={() => void submit()}
        >
          <LogIn />
          {selected.length === 0
            ? t('checkin.chooseChildrenFirst')
            : t('checkin.checkInCount', { count: formatNumber(selected.length) })}
        </Button>
      </div>
    </div>
  );
}

/** The codes after a check-in, and the way to the labels. */
function CheckInDone({ items, onNext }: { items: Checkin[]; onNext: () => void }) {
  const { base } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  const ids = items.map((item) => item.id).join(',');
  return (
    <div className="flex animate-rise-in flex-col items-center gap-5 py-4 text-center">
      <span
        data-tone="success"
        className="flex size-20 items-center justify-center rounded-full bg-tone-soft text-tone-ink"
        aria-hidden
      >
        <CircleCheckBig className="size-10" />
      </span>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('checkin.doneTitle')}</h2>
        <p className="mt-1 text-muted-foreground">{t('checkin.doneHint')}</p>
      </div>
      <ul className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left shadow-soft"
          >
            <ChildAvatar child={item.child} alerts={item.alerts} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{fullName(item.child)}</span>
              <span className="block truncate text-sm text-muted-foreground">{item.className}</span>
            </span>
            {item.securityCode ? <SecurityCode code={item.securityCode} /> : null}
          </li>
        ))}
      </ul>
      <div className="flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:justify-center">
        <Button
          size="lg"
          variant="outline"
          className="h-14"
          onClick={() => void navigate(`${base}/checkin/labels?ids=${ids}`)}
        >
          <Printer />
          {t('checkin.printLabels')}
        </Button>
        <Button ref={nextRef} size="lg" className="h-14" onClick={onNext}>
          {t('checkin.nextFamily')}
        </Button>
      </div>
    </div>
  );
}

function CheckOutPanel({ sessionId }: { sessionId: string }) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const query = useQuery(
    sessionCheckinsQuery(churchId, sessionId, {
      q: q || undefined,
      status: 'checked_in',
      limit: 50,
    }),
  );
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          inputMode="search"
          autoFocus
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('checkin.checkoutSearch')}
          aria-label={t('checkin.checkoutSearch')}
          className="h-14 rounded-xl pl-12 text-lg md:text-lg"
        />
      </div>
      {query.isPending ? (
        <SkeletonList rows={4} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={LogOut}
          tone={CHECKIN_TONE}
          title={q ? t('checkin.noCheckinsFound') : t('checkin.nobodyInClass')}
          description={q ? t('common.noResultsHint') : undefined}
        />
      ) : (
        <ul
          className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft"
          aria-busy={query.isFetching || undefined}
        >
          {items.map((item) => (
            <CheckinListRow
              key={item.id}
              checkin={item}
              onCheckOut={() => setCheckingOut(item.id)}
            />
          ))}
        </ul>
      )}
      <CheckoutDialog
        checkinId={checkingOut}
        open={!!checkingOut}
        onOpenChange={(next) => {
          if (!next) setCheckingOut(null);
        }}
      />
    </div>
  );
}

/** Full screen for a kiosk tablet, where the browser supports it. */
function useFullscreen() {
  const [active, setActive] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  return {
    supported: typeof document.documentElement.requestFullscreen === 'function',
    active,
    toggle: () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void document.documentElement.requestFullscreen().catch(() => undefined);
    },
  };
}
