import {
  canEditOfferingBatch,
  canReturnOfferingBatch,
  canVoidOfferingBatch,
  has,
  type OfferingBatch,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle2,
  ClipboardCheck,
  HandCoins,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/misc';
import { PrintButton, PrintHeader } from '@/components/ui/print';
import { SkeletonCards, SkeletonText } from '@/components/ui/skeleton';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { offeringQuery, useOfferingAction } from './api';
import { MethodLabel, Money, OfferingStatusBadge, ReasonDialog } from './components';

export function OfferingPage() {
  const { t } = useI18n();
  const { churchId, base } = useChurch();
  const { offeringId = '' } = useParams();
  const query = useQuery(offeringQuery(churchId, offeringId));
  const crumbs = [
    { label: t('finance.nav'), to: `${base}/finance` },
    { label: t('finance.navOfferings'), to: `${base}/finance/offerings` },
  ];

  if (query.isPending) {
    return (
      <Page>
        <PageHeader title={t('finance.offeringDetail')} breadcrumbs={crumbs} />
        <SkeletonText lines={2} />
        <SkeletonCards count={2} className="sm:grid-cols-1 lg:grid-cols-2" />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('finance.offeringDetail')} breadcrumbs={crumbs} />
        {isApiClientError(query.error) && query.error.status === 404 ? (
          <NoAccessState
            title={t('common.notFoundTitle')}
            description={t('finance.offeringMissing')}
          />
        ) : (
          <ErrorState
            error={query.error}
            message={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        )}
      </Page>
    );
  }
  return <OfferingDetail batch={query.data.batch} crumbs={crumbs} />;
}

function OfferingDetail({
  batch,
  crumbs,
}: {
  batch: OfferingBatch;
  crumbs: { label: string; to?: string }[];
}) {
  const { t, formatDate, formatDateTime, formatCurrency } = useI18n();
  const { churchId, base, access, church } = useChurch();
  const [dialog, setDialog] = useState<'verify' | 'return' | 'void' | null>(null);
  const action = useOfferingAction(churchId, batch.id);
  const run = useMutationToast(action, {
    success: (_data, variables) =>
      ({
        submit: t('finance.offeringSubmitted'),
        verify: t('finance.offeringVerified'),
        return: t('finance.offeringReturned'),
        void: t('finance.offeringVoided'),
      })[variables.action],
  });
  const title = batch.serviceLabel ?? t('finance.serviceFallback');
  const canEdit = canEditOfferingBatch(access, batch);
  const canSubmit = canEdit;
  const canReturn = canReturnOfferingBatch(access, batch);
  const canVoid = canVoidOfferingBatch(access, batch);
  const cashLines = batch.lines.filter((line) => Object.keys(line.denominations).length > 0);
  const close = () => setDialog(null);

  return (
    <Page>
      <PrintHeader
        churchName={church.name}
        logoUrl={church.logoUrl}
        title={t('finance.offeringReport')}
        subtitle={`${title} · ${formatDate(batch.serviceDate, 'dateLong')}`}
      />
      <PageHeader
        icon={HandCoins}
        tone="emerald"
        eyebrow={formatDate(batch.serviceDate, 'dateLong')}
        title={title}
        breadcrumbs={[...crumbs, { label: title }]}
        actions={<PrintButton size="sm" />}
      />

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <OfferingStatusBadge status={batch.status} />
            <p className="text-3xl font-bold tracking-tight tabular">
              {formatCurrency(batch.totalAmount)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('finance.intoAccount', { account: batch.accountName })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2" data-print="hide">
            {canEdit ? (
              <Button asChild variant="outline">
                <Link to={`${base}/finance/offerings/${batch.id}/edit`}>
                  <Pencil />
                  {t('common.edit')}
                </Link>
              </Button>
            ) : null}
            {canSubmit ? (
              <Button loading={run.isPending} onClick={() => void run.run({ action: 'submit' })}>
                <Send />
                {t('finance.submitForVerification')}
              </Button>
            ) : null}
            {batch.canVerify ? (
              <Button onClick={() => setDialog('verify')}>
                <ShieldCheck />
                {t('finance.verify')}
              </Button>
            ) : null}
            {canReturn ? (
              <Button variant="outline" onClick={() => setDialog('return')}>
                <RotateCcw />
                {t('finance.returnForCorrection')}
              </Button>
            ) : null}
            {canVoid ? (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setDialog('void')}
              >
                <Ban />
                {t('finance.void')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {batch.status === 'submitted' && !batch.canVerify && has(access, 'finance.approve') ? (
        <Alert variant="info" title={t('finance.cannotVerifyTitle')}>
          {t('finance.cannotVerifyHint')}
        </Alert>
      ) : null}
      {batch.status === 'voided' ? (
        <Alert variant="error" title={t('finance.voidedTitle')}>
          {batch.voidReason}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <Section title={t('finance.lines')} className="lg:col-span-3">
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
            {batch.lines.map((line) => (
              <li key={line.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{line.fundName}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <MethodLabel method={line.method} />
                    {line.accountName ? <span>· {line.accountName}</span> : null}
                    {line.categoryName ? <span>· {line.categoryName}</span> : null}
                    {line.note ? <span>· {line.note}</span> : null}
                  </p>
                </div>
                <Money value={line.amount} />
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-3 font-semibold">
              <span>{t('finance.total')}</span>
              <Money value={batch.totalAmount} />
            </li>
          </ul>
          {cashLines.length > 0 ? (
            <Card>
              <CardContent>
                <p className="mb-2 text-sm font-semibold">{t('finance.denominations')}</p>
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 text-left font-medium">{t('finance.denomination')}</th>
                      <th className="py-1 text-right font-medium">{t('finance.count')}</th>
                      <th className="py-1 text-right font-medium">{t('finance.subtotal')}</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {mergeDenominations(cashLines.map((line) => line.denominations)).map(
                      ([value, count]) => (
                        <tr key={value} className="border-t border-border/50">
                          <td className="py-1.5">{formatCurrency(value)}</td>
                          <td className="py-1.5 text-right">{count}</td>
                          <td className="py-1.5 text-right">{formatCurrency(value * count)}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </Section>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Section title={t('finance.counters')} icon={Users}>
            <Card>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p>
                  <span className="text-muted-foreground">{t('finance.counter1')}: </span>
                  <span className="font-medium">{batch.counter1Name ?? '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">{t('finance.counter2')}: </span>
                  <span className="font-medium">{batch.counter2Name ?? '—'}</span>
                </p>
                {batch.notes ? (
                  <p className="border-t border-border/60 pt-2 whitespace-pre-line">
                    {batch.notes}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </Section>
          <Section title={t('finance.history')}>
            <Timeline>
              <TimelineItem
                icon={HandCoins}
                tone="emerald"
                title={t('finance.historyCounted', { name: batch.createdByName ?? '—' })}
                time={formatDateTime(batch.createdAt)}
              />
              {batch.submittedAt ? (
                <TimelineItem
                  icon={ClipboardCheck}
                  tone="warning"
                  title={t('finance.historySubmitted')}
                  time={formatDateTime(batch.submittedAt)}
                />
              ) : null}
              {batch.verifiedAt ? (
                <TimelineItem
                  icon={CheckCircle2}
                  tone="success"
                  title={t('finance.historyVerified', { name: batch.verifiedByName ?? '—' })}
                  time={formatDateTime(batch.verifiedAt)}
                />
              ) : null}
              {batch.voidedAt ? (
                <TimelineItem
                  icon={Ban}
                  tone="danger"
                  title={t('finance.historyVoided')}
                  time={formatDateTime(batch.voidedAt)}
                  last
                />
              ) : null}
            </Timeline>
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'verify'}
        onOpenChange={(open) => !open && close()}
        variant="default"
        title={t('finance.verifyTitle')}
        description={t('finance.verifyDescription', {
          amount: formatCurrency(batch.totalAmount),
          account: batch.accountName,
        })}
        confirmLabel={t('finance.verify')}
        loading={run.isPending}
        onConfirm={async () => {
          if (await run.run({ action: 'verify' })) close();
        }}
      />
      <ReasonDialog
        open={dialog === 'return'}
        onOpenChange={(open) => !open && close()}
        destructive={false}
        optional
        title={t('finance.returnTitle')}
        description={t('finance.returnDescription')}
        confirmLabel={t('finance.returnForCorrection')}
        loading={run.isPending}
        onConfirm={async (reason) => {
          if (await run.run({ action: 'return', reason })) close();
        }}
      />
      <ReasonDialog
        open={dialog === 'void'}
        onOpenChange={(open) => !open && close()}
        title={t('finance.voidOfferingTitle')}
        description={
          batch.status === 'verified'
            ? t('finance.voidOfferingPosted')
            : t('finance.voidOfferingDraft')
        }
        confirmLabel={t('finance.void')}
        loading={run.isPending}
        onConfirm={async (reason) => {
          if (await run.run({ action: 'void', reason })) close();
        }}
      />
    </Page>
  );
}

const mergeDenominations = (items: Record<string, number>[]): [number, number][] => {
  const totals = new Map<number, number>();
  for (const item of items) {
    for (const [value, count] of Object.entries(item)) {
      totals.set(Number(value), (totals.get(Number(value)) ?? 0) + count);
    }
  }
  return [...totals].filter(([, count]) => count > 0).sort((a, b) => b[0] - a[0]);
};
