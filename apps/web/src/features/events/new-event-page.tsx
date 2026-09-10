import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Card, CardContent } from '@/components/ui/card';
import { useCreateEvent } from './api';
import { EventForm } from './event-form';

export function NewEventPage() {
  const { churchId, base } = useChurch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const create = useCreateEvent(churchId);
  return (
    <Page>
      <PageHeader backTo={`${base}/events`} title="New event" />
      <Card>
        <CardContent>
          <EventForm
            defaultGroupId={params.get('groupId')}
            submitLabel="Create event"
            onCancel={() => navigate(`${base}/events`)}
            onSubmit={async (values) => {
              const result = await create.mutateAsync(values);
              toast.success('Event created');
              navigate(`${base}/events/${result.event.id}`, { replace: true });
            }}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
