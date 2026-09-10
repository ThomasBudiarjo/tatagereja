import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Card, CardContent } from '@/components/ui/card';
import { useCreatePerson } from './api';
import { PersonForm } from './person-form';

export function NewPersonPage() {
  const { churchId, base } = useChurch();
  const navigate = useNavigate();
  const create = useCreatePerson(churchId);
  return (
    <Page>
      <PageHeader
        backTo={`${base}/people`}
        title="Add a person"
        description="People in the directory do not need a login account."
      />
      <Card>
        <CardContent>
          <PersonForm
            canEditAdminFields
            submitLabel="Add person"
            onCancel={() => navigate(`${base}/people`)}
            onSubmit={async (values) => {
              const result = await create.mutateAsync(values);
              toast.success('Person added');
              navigate(`${base}/people/${result.person.id}`, { replace: true });
            }}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
