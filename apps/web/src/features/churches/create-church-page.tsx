import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page';
import { Card, CardContent } from '@/components/ui/card';
import { useUiStore } from '@/stores/ui';
import { useCreateChurch } from './api';
import { ChurchForm } from './church-form';

export function CreateChurchPage() {
  const navigate = useNavigate();
  const create = useCreateChurch();
  const setLastChurchId = useUiStore((state) => state.setLastChurchId);
  return (
    <Page>
      <PageHeader
        backTo="/churches"
        title="Create a church"
        description="You will become the owner and can invite administrators and members afterwards."
      />
      <Card>
        <CardContent>
          <ChurchForm
            submitLabel="Create church"
            onCancel={() => navigate('/churches')}
            onSubmit={async (values) => {
              const result = await create.mutateAsync(values);
              setLastChurchId(result.church.id);
              toast.success('Church created');
              navigate(`/c/${result.church.id}`, { replace: true });
            }}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
