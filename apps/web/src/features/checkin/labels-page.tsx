import {
  CHILD_ALERT_KIND_LABELS,
  fullName,
  highestSeverity,
  localize,
  type CheckinLabel,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Scissors, Tag, TriangleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PrintButton } from '@/components/ui/print';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { isGone } from '@/lib/use-mutation-toast';
import { labelsQuery } from './api';
import { CHECKIN_TONE, useCheckinAccess } from './checkin-lib';
import { KioskFrame } from './checkin-ui';

/** Labels print two per child: one stays on the child, the tag goes home with the guardian. */
const PRINT_CSS = `
@page { size: A4 portrait; margin: 8mm; }
@media print {
  .checkin-labels { gap: 4mm !important; }
  .checkin-label { break-inside: avoid; border-color: #888 !important; box-shadow: none !important; }
}
`;

const ID_PATTERN = /^[0-9a-f-]{36}$/i;

/** Printable child labels and guardian tags for one or more check-ins. */
export function LabelsPage() {
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const { canOperate } = useCheckinAccess();
  const [params] = useSearchParams();
  const ids = (params.get('ids') ?? '')
    .split(',')
    .filter((id) => ID_PATTERN.test(id))
    .slice(0, 50);
  const query = useQuery({ ...labelsQuery(churchId, ids), enabled: ids.length > 0 });
  useDocumentTitle(t('checkin.labelsTitle'));
  const printed = useRef(false);
  const items = query.data?.items ?? [];
  const kiosk = canOperate && params.get('kiosk') === '1';
  // Guardians printing at home go back to their children; volunteers to the station.
  const back = !canOperate
    ? `${base}/checkin/me`
    : items[0]
      ? `${base}/checkin/sessions/${items[0].sessionId}/station${kiosk ? '?kiosk=true' : ''}`
      : `${base}/checkin`;

  // Open the print dialog once the labels are on screen, when asked to (`print=1`).
  useEffect(() => {
    if (printed.current || !query.isSuccess || params.get('print') !== '1') return;
    printed.current = true;
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, [query.isSuccess, params]);

  return (
    <KioskFrame active={kiosk}>
      <Page size="wide" className="print:p-0">
        <style>{PRINT_CSS}</style>
        <div data-print="hide" className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2.5 text-muted-foreground">
            <Link to={back}>
              <ArrowLeft />
              {canOperate ? t('checkin.backToStation') : t('checkin.backToMine')}
            </Link>
          </Button>
          {items.length > 0 ? <PrintButton label={t('checkin.printLabels')} /> : null}
        </div>
        <div data-print="hide">
          <h1 className="text-2xl font-bold tracking-tight">{t('checkin.labelsTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('checkin.labelsHint')}</p>
        </div>

        {ids.length === 0 || (query.isError && isGone(query.error)) ? (
          <EmptyState
            icon={Tag}
            tone={CHECKIN_TONE}
            title={t('checkin.noLabels')}
            description={t('checkin.noLabelsHint')}
          />
        ) : query.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        ) : query.isError ? (
          <ErrorState
            error={query.error}
            message={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : (
          <div className="checkin-labels grid gap-4 sm:grid-cols-2 print:grid-cols-2">
            {items.map((label) => (
              <LabelPair key={label.id} label={label} />
            ))}
          </div>
        )}
      </Page>
    </KioskFrame>
  );
}

function LabelPair({ label }: { label: CheckinLabel }) {
  return (
    <>
      <ChildLabel label={label} />
      <GuardianTag label={label} />
    </>
  );
}

function ChildLabel({ label }: { label: CheckinLabel }) {
  const { church } = useChurch();
  const { t, locale, formatDate, formatTime } = useI18n();
  const severity = highestSeverity(label.alerts);
  const kinds = [...new Set(label.alerts.map((alert) => alert.kind))];
  return (
    <article
      className="checkin-label relative flex h-52 flex-col justify-between overflow-hidden rounded-xl border-2 border-dashed border-border bg-card p-4 text-black shadow-soft dark:text-foreground print:h-[52mm] print:bg-white print:text-black"
      aria-label={t('checkin.childLabelAria', { name: fullName(label.child) })}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wide uppercase opacity-70">
          {church.name} · {t('checkin.labelChild')}
        </p>
        <Scissors className="size-3.5 opacity-40" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="truncate text-3xl leading-tight font-extrabold tracking-tight">
          {label.child.firstName}
        </p>
        <p className="truncate text-base font-medium">{label.child.lastName ?? ''}</p>
        <p className="mt-1 truncate text-sm">
          {label.className} · {formatDate(label.sessionDate, 'dayMonth')}{' '}
          {formatTime(label.checkedInAt)}
        </p>
      </div>
      <div className="flex items-end justify-between gap-3">
        {severity ? (
          <p className="flex min-w-0 items-center gap-1.5 rounded-md border-2 border-black px-2 py-1 text-xs font-bold uppercase dark:border-foreground print:border-black">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="truncate">
              {kinds.map((kind) => localize(CHILD_ALERT_KIND_LABELS[kind], locale)).join(' · ')}
            </span>
          </p>
        ) : (
          <span />
        )}
        <p className="font-mono text-3xl font-extrabold tracking-[0.2em]">{label.securityCode}</p>
      </div>
    </article>
  );
}

function GuardianTag({ label }: { label: CheckinLabel }) {
  const { church } = useChurch();
  const { t, formatDate } = useI18n();
  return (
    <article
      className="checkin-label flex h-52 flex-col justify-between overflow-hidden rounded-xl border-2 border-dashed border-border bg-card p-4 text-black shadow-soft dark:text-foreground print:h-[52mm] print:bg-white print:text-black"
      aria-label={t('checkin.guardianTagAria', { name: fullName(label.child) })}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wide uppercase opacity-70">
          {church.name} · {t('checkin.labelGuardian')}
        </p>
        <Scissors className="size-3.5 opacity-40" aria-hidden />
      </div>
      <div className="text-center">
        <p className="text-xs font-medium uppercase opacity-70">{t('checkin.pickupCode')}</p>
        <p className="font-mono text-5xl font-extrabold tracking-[0.25em]">{label.securityCode}</p>
      </div>
      <div className="flex items-end justify-between gap-2 text-sm">
        <p className="min-w-0 truncate">
          <span className="font-semibold">{fullName(label.child)}</span> · {label.className}
        </p>
        <p className="shrink-0 opacity-70">{formatDate(label.sessionDate, 'dayMonth')}</p>
      </div>
      <p className="sr-only">{t('checkin.guardianTagHint')}</p>
    </article>
  );
}
