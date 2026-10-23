import { CalendarPlus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { useI18n } from '@/lib/i18n';
import { EventForm } from './event-form';
import { EVENT_TONE } from './event-lib';

export function NewEventPage() {
  const { base } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (
    <Page>
      <PageHeader
        title={t('events.newTitle')}
        icon={CalendarPlus}
        tone={EVENT_TONE}
        breadcrumbs={[
          { label: t('events.title'), to: `${base}/events` },
          { label: t('events.newTitle') },
        ]}
      />
      <EventForm
        defaultGroupId={params.get('groupId')}
        onCancel={() => void navigate(`${base}/events`)}
        onSaved={(id) => void navigate(`${base}/events/${id}`, { replace: true })}
      />
    </Page>
  );
}
