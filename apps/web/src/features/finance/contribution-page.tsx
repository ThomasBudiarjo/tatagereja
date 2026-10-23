import {
  CONTRIBUTION_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  canCorrectContribution,
  has,
  hasAny,
  localize,
  type FinanceContribution,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Ban, Pencil, Receipt, SearchX } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { PrintButton, PrintSheet } from '@/components/ui/print';
import { SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { contributionQuery, useVoidContribution } from './api';
import { ReasonDialog } from './components';
import { donorName, terbilang } from './helpers';

export function ContributionPage() {
  const { t } = useI18n();
  const { churchId, base, access } = useChurch();
  const { contributionId = '' } = useParams();
  const query = useQuery(contributionQuery(churchId, contributionId));
  const crumbs = hasAny(access, ['finance.view', 'finance.record'])
    ? [
        { label: t('finance.nav'), to: `${base}/finance` },
        { label: t('finance.navGiving'), to: `${base}/finance/giving` },
      ]
    : [{ label: t('finance.myGiving'), to: `${base}/finance/my-giving` }];

  return (
    <Page>
      {query.isPending ? (
        <>
          <PageHeader
            title={t('finance.receipt')}
            breadcrumbs={[...crumbs, { label: t('finance.receipt') }]}
          />
          <SkeletonText lines={6} />
        </>
      ) : query.isError ? (
        <>
          <PageHeader
            title={t('finance.receipt')}
            breadcrumbs={[...crumbs, { label: t('finance.receipt') }]}
          />
          {isApiClientError(query.error) && query.error.status === 404 ? (
            // The same framed "not found" card as the other modules' detail pages.
            <EmptyState
              icon={SearchX}
              tone="slate"
              title={t('common.notFoundTitle')}
              description={t('finance.receiptMissing')}
              action={
                <Button asChild variant="outline">
                  <Link to={crumbs[crumbs.length - 1]!.to}>{crumbs[crumbs.length - 1]!.label}</Link>
                </Button>
              }
            />
          ) : (
            <ErrorState
              error={query.error}
              message={getErrorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          )}
        </>
      ) : (
        <ReceiptView contribution={query.data.contribution} crumbs={crumbs} />
      )}
    </Page>
  );
}

function ReceiptView({
  contribution,
  crumbs,
}: {
  contribution: FinanceContribution;
  crumbs: { label: string; to?: string }[];
}) {
  const { t, locale, formatDate, formatCurrency } = useI18n();
  const { church, churchId, base, access } = useChurch();
  const [voiding, setVoiding] = useState(false);
  const voidGift = useMutationToast(useVoidContribution(churchId, contribution.id), {
    success: t('finance.giftVoided'),
  });
  const giver = donorName(contribution.person, contribution.donorName, t('finance.anonymous'));
  const receipt = contribution.receiptNumber ?? t('finance.receipt');
  const rows: [string, string][] = [
    [t('finance.receivedFrom'), giver],
    [t('finance.kind'), localize(CONTRIBUTION_KIND_LABELS[contribution.kind], locale)],
    [t('finance.fund'), contribution.fundName],
    ...(contribution.campaignName
      ? ([[t('finance.campaign'), contribution.campaignName]] as [string, string][])
      : []),
    [t('finance.method'), localize(PAYMENT_METHOD_LABELS[contribution.method], locale)],
    ...(contribution.reference
      ? ([[t('finance.reference'), contribution.reference]] as [string, string][])
      : []),
    [t('finance.receivedAt'), formatDate(contribution.receivedAt, 'dateLong')],
  ];
  const canEdit = canCorrectContribution(access, contribution);
  const canVoid = has(access, 'finance.manage') && !contribution.voidedAt;

  return (
    <>
      <PageHeader
        icon={Receipt}
        tone="teal"
        eyebrow={receipt}
        title={giver}
        description={t('finance.receiptDescription')}
        breadcrumbs={[...crumbs, { label: receipt }]}
        actions={
          <>
            {canEdit ? (
              <Button asChild variant="outline" size="sm" data-print="hide">
                <Link to={`${base}/finance/giving/${contribution.id}/edit`}>
                  <Pencil />
                  <span className="max-sm:sr-only">{t('common.edit')}</span>
                </Link>
              </Button>
            ) : null}
            <PrintButton size="sm" />
          </>
        }
      />
      {contribution.voidedAt ? (
        <Alert variant="error" title={t('finance.voidedTitle')}>
          {contribution.voidReason}
        </Alert>
      ) : null}
      <PrintSheet className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            {church.logoUrl ? (
              <img src={church.logoUrl} alt="" className="size-12 object-contain" />
            ) : null}
            <div>
              <p className="text-lg font-bold">{church.name}</p>
              {church.address ? (
                <p className="text-sm text-muted-foreground">{church.address}</p>
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <p className="text-overline text-muted-foreground">{t('finance.receiptTitle')}</p>
            <p className="font-mono text-sm font-semibold">{receipt}</p>
          </div>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="-mt-2 font-medium sm:mt-0">{value}</dd>
            </div>
          ))}
        </dl>
        <div data-tone="teal" className="rounded-xl bg-tone-soft/60 p-4 print:border">
          <p className="text-overline text-tone-ink">{t('finance.amount')}</p>
          <p className="text-3xl font-bold tracking-tight tabular">
            {formatCurrency(contribution.amount)}
          </p>
          {church.currency === 'IDR' && locale === 'id' ? (
            <p className="mt-1 text-sm text-muted-foreground italic first-letter:uppercase">
              {terbilang(contribution.amount)} rupiah
            </p>
          ) : null}
        </div>
        {contribution.note ? (
          <p className="text-sm text-muted-foreground">{contribution.note}</p>
        ) : null}
        <div className="flex items-end justify-between gap-6 pt-6 text-sm">
          <p className="text-muted-foreground">{t('finance.receiptThanks')}</p>
          <div className="min-w-40 text-center">
            <p className="text-muted-foreground">
              {formatDate(contribution.receivedAt, 'dateShort')}
            </p>
            <div className="mt-12 border-t pt-1 font-medium">
              {contribution.recordedByName ?? t('finance.treasurer')}
            </div>
            <p className="text-xs text-muted-foreground">{t('finance.treasurer')}</p>
          </div>
        </div>
      </PrintSheet>
      {canVoid ? (
        <div data-print="hide" className="flex justify-end">
          <Button variant="ghost" className="text-destructive" onClick={() => setVoiding(true)}>
            <Ban />
            {t('finance.voidGift')}
          </Button>
        </div>
      ) : null}
      <ReasonDialog
        open={voiding}
        onOpenChange={setVoiding}
        title={t('finance.voidGiftTitle', { receipt })}
        description={t('finance.voidGiftDescription')}
        confirmLabel={t('finance.void')}
        loading={voidGift.isPending}
        onConfirm={async (reason) => {
          if (await voidGift.run(reason)) setVoiding(false);
        }}
      />
    </>
  );
}
