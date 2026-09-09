import { fullName } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, ErrorState, PageLoader } from '@/components/ui/misc';
import { getErrorMessage } from '@/lib/api';
import { personQuery, useUpdatePerson } from './api';
import { PersonForm } from './person-form';

export function EditPersonPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base, isAdmin } = useChurch();
  const navigate = useNavigate();
  const query = useQuery(personQuery(churchId, id));
  const update = useUpdatePerson(churchId, id);

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <Page>
        <PageHeader backTo={`${base}/people`} title="Edit person" />
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Page>
    );
  }
  if (!query.data.canEdit) {
    return (
      <Page>
        <PageHeader backTo={`${base}/people/${id}`} title="Edit person" />
        <Alert variant="warning" title="You cannot edit this person">
          Only administrators, the person themselves, and leaders of their groups can edit this
          profile.
        </Alert>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader backTo={`${base}/people/${id}`} title={`Edit ${fullName(query.data.person)}`} />
      <Card>
        <CardContent>
          <PersonForm
            person={query.data.person}
            canEditAdminFields={isAdmin}
            submitLabel="Save changes"
            onCancel={() => navigate(`${base}/people/${id}`)}
            onSubmit={async (values) => {
              await update.mutateAsync(values);
              toast.success('Person updated');
              navigate(`${base}/people/${id}`, { replace: true });
            }}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
