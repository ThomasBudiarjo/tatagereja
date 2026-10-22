import { canEditOfferingBatch } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { HandCoins } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { offeringQuery } from './api';
import { useFinanceSetup } from './helpers';
import { OfferingForm } from './offering-form';

function SetupGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { base } = useChurch();
  const setup = useFinanceSetup();
  if (setup.query.isPending)
    return <SkeletonCards count={2} className="sm:grid-cols-1 lg:grid-cols-1" />;
  if (setup.query.isError) {
    return (
      <ErrorState
        error={setup.query.error}
        message={getErrorMessage(setup.query.error)}
        onRetry={() => void setup.query.refetch()}
      />
    );
  }
  if (setup.isEmpty) {
    return (
      <EmptyState
        icon={HandCoins}
        tone="emerald"
        title={t('finance.setupTitle')}
        description={t('finance.setupAskTreasurer')}
        action={
          <Button asChild variant="outline">
            <Link to={`${base}/finance`}>{t('finance.navOverview')}</Link>
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}

export function NewOfferingPage() {
  const { t } = useI18n();
  const { base } = useChurch();
  const navigate = useNavigate();
  return (
    <Page size="narrow">
      <PageHeader
        icon={HandCoins}
        tone="emerald"
        title={t('finance.recordOffering')}
        description={t('finance.recordOfferingDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navOfferings'), to: `${base}/finance/offerings` },
          { label: t('finance.recordOffering') },
        ]}
      />
      <SetupGate>
        <OfferingForm
          onSaved={(batch) => navigate(`${base}/finance/offerings/${batch.id}`, { replace: true })}
        />
      </SetupGate>
    </Page>
  );
}

export function EditOfferingPage() {
  const { t } = useI18n();
  const { base, churchId, access } = useChurch();
  const { offeringId = '' } = useParams();
  const navigate = useNavigate();
  const query = useQuery(offeringQuery(churchId, offeringId));
  const detail = `${base}/finance/offerings/${offeringId}`;
  return (
    <Page size="narrow">
      <PageHeader
        title={t('finance.editOffering')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navOfferings'), to: `${base}/finance/offerings` },
          { label: t('finance.offeringDetail'), to: detail },
          { label: t('common.edit') },
        ]}
      />
      {query.isPending ? (
        <SkeletonCards count={2} className="sm:grid-cols-1 lg:grid-cols-1" />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : !canEditOfferingBatch(access, query.data.batch) ? (
        <Alert
          variant="warning"
          title={t('finance.offeringLocked')}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to={detail}>{t('common.back')}</Link>
            </Button>
          }
        >
          {t('finance.offeringLockedHint')}
        </Alert>
      ) : (
        <SetupGate>
          <OfferingForm
            batch={query.data.batch}
            onSaved={() => navigate(detail, { replace: true })}
          />
        </SetupGate>
      )}
    </Page>
  );
}
