import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Card, CardContent } from '@/components/ui/card';
import { useCreateAnnouncement } from './api';
import { AnnouncementForm } from './announcement-form';

export function NewAnnouncementPage() {
  const { churchId, base } = useChurch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const create = useCreateAnnouncement(churchId);
  return (
    <Page>
      <PageHeader backTo={`${base}/announcements`} title="New announcement" />
      <Card>
        <CardContent>
          <AnnouncementForm
            defaultGroupId={params.get('groupId')}
            onCancel={() => navigate(`${base}/announcements`)}
            onSubmit={async (values) => {
              const result = await create.mutateAsync(values);
              toast.success(
                values.status === 'published' ? 'Announcement published' : 'Draft saved',
              );
              navigate(`${base}/announcements/${result.announcement.id}`, { replace: true });
            }}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
