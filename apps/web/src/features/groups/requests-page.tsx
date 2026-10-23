import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { joinRequestsQuery } from './api';
import { RequestsList } from './group-page';

/** Every pending join request in the groups the caller leads or manages. */
export function JoinRequestsPage() {
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const query = useQuery(joinRequestsQuery(churchId));
  return (
    <Page>
      <PageHeader
        icon={Inbox}
        tone="violet"
        breadcrumbs={[
          { label: t('groups.title'), to: `${base}/groups` },
          { label: t('groups.requestsTitle') },
        ]}
        title={t('groups.requestsTitle')}
        description={t('groups.requestsDescription')}
      />
      {query.isPending ? (
        <SkeletonList rows={4} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <RequestsList requests={query.data.items} showGroup />
      )}
    </Page>
  );
}
