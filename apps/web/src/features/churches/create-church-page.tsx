import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import { useCreateChurch } from './api';
import { ChurchForm } from './church-form';

export function CreateChurchPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const create = useCreateChurch();
  const setLastChurchId = useUiStore((state) => state.setLastChurchId);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: t('churches.title'), to: '/churches' },
          { label: t('churches.createTitle') },
        ]}
        title={t('churches.createTitle')}
        description={t('churches.createDescription')}
      />
      <Card>
        <CardContent>
          <ChurchForm
            submitLabel={t('churches.createSubmit')}
            onCancel={() => navigate('/churches')}
            onSubmit={async (values) => {
              const result = await create.mutateAsync(values);
              setLastChurchId(result.church.id);
              toast.success(t('churches.created'));
              navigate(`/c/${result.church.id}`, { replace: true });
            }}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
