import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { SkeletonPage } from '@/components/ui/skeleton';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { eventQuery } from './api';
import { EventForm } from './event-form';
import { EVENT_TONE } from './event-lib';

export function EditEventPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { base, churchId } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(eventQuery(churchId, id));
  const detailPath = `${base}/events/${id}`;

  if (query.isPending) return <SkeletonPage />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('events.editTitle')} backTo={`${base}/events`} />
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </Page>
    );
  }
  if (!query.data.canManage) return <NoAccessState />;
  const { event } = query.data;
  return (
    <Page>
      <PageHeader
        title={t('events.editTitle')}
        description={event.title}
        icon={Pencil}
        tone={EVENT_TONE}
        breadcrumbs={[
          { label: t('events.title'), to: `${base}/events` },
          { label: event.title, to: detailPath },
          { label: t('common.edit') },
        ]}
      />
      <EventForm
        event={event}
        onCancel={() => void navigate(detailPath)}
        onSaved={(savedId) => void navigate(`${base}/events/${savedId}`, { replace: true })}
      />
    </Page>
  );
}
