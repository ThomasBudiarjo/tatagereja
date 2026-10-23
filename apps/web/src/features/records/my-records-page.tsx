import { useQuery } from '@tanstack/react-query';
import { ScrollText, UserRoundX } from 'lucide-react';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { personRecordsQuery } from './api';
import { RECORDS_TONE } from './records-lib';
import { PersonRecordList, RecordsNav } from './records-ui';

/** A member's own baptism, sidi, marriage and other records, with their certificates. */
export function MyRecordsPage() {
  const { access } = useChurch();
  const { t } = useI18n();
  return (
    <Page>
      <PageHeader
        title={t('records.myTitle')}
        description={t('records.myDescription')}
        icon={ScrollText}
        tone={RECORDS_TONE}
      />
      <RecordsNav />
      {access.personId ? (
        <MyRecordsList personId={access.personId} />
      ) : (
        <EmptyState
          icon={UserRoundX}
          tone="slate"
          title={t('records.notLinkedTitle')}
          description={t('records.notLinkedBody')}
        />
      )}
    </Page>
  );
}

function MyRecordsList({ personId }: { personId: string }) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const query = useQuery(personRecordsQuery(churchId, personId));
  if (query.isPending) return <SkeletonList rows={3} />;
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        message={getErrorMessage(query.error)}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        tone={RECORDS_TONE}
        title={t('records.myEmpty')}
        description={t('records.myEmptyBody')}
      />
    );
  }
  return <PersonRecordList items={query.data.items} />;
}
