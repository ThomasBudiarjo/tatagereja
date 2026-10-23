import { SquarePen } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { useI18n } from '@/lib/i18n';
import { AnnouncementForm } from './announcement-form';
import { ANNOUNCEMENT_TONE } from './announcement-lib';

export function NewAnnouncementPage() {
  const { base } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (
    <Page>
      <PageHeader
        title={t('announcements.newTitle')}
        icon={SquarePen}
        tone={ANNOUNCEMENT_TONE}
        breadcrumbs={[
          { label: t('announcements.title'), to: `${base}/announcements` },
          { label: t('announcements.newTitle') },
        ]}
      />
      <AnnouncementForm
        defaultGroupId={params.get('groupId')}
        onCancel={() => void navigate(`${base}/announcements`)}
        onSaved={(id) => void navigate(`${base}/announcements/${id}`, { replace: true })}
      />
    </Page>
  );
}
