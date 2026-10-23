import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { SkeletonPage } from '@/components/ui/skeleton';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { announcementQuery } from './api';
import { AnnouncementForm } from './announcement-form';
import { ANNOUNCEMENT_TONE } from './announcement-lib';

export function EditAnnouncementPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { base, churchId } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(announcementQuery(churchId, id));
  const detailPath = `${base}/announcements/${id}`;

  if (query.isPending) return <SkeletonPage />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('announcements.editTitle')} backTo={`${base}/announcements`} />
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
  const { announcement } = query.data;
  return (
    <Page>
      <PageHeader
        title={t('announcements.editTitle')}
        description={announcement.title}
        icon={Pencil}
        tone={ANNOUNCEMENT_TONE}
        breadcrumbs={[
          { label: t('announcements.title'), to: `${base}/announcements` },
          { label: announcement.title, to: detailPath },
          { label: t('common.edit') },
        ]}
      />
      <AnnouncementForm
        announcement={announcement}
        onCancel={() => void navigate(detailPath)}
        onSaved={() => void navigate(detailPath, { replace: true })}
      />
    </Page>
  );
}
