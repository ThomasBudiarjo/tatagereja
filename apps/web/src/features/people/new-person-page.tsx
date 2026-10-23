import { can, fullName, has } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { fieldsQuery, tagsQuery, useCreatePerson } from './api';
import { PersonForm } from './person-form';
import { personFormFieldNames } from './person-form-fields';

export function NewPersonPage() {
  const { churchId, base, access } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const create = useCreatePerson(churchId);
  const fields = useQuery(fieldsQuery(churchId));
  const tags = useQuery(tagsQuery(churchId));
  // A new person has no account yet, so private fields need `people.private.edit`.
  const editable = (fields.data?.items ?? []).filter(
    (field) => field.isActive && (!field.isPrivate || has(access, 'people.private.edit')),
  );

  return (
    <Page>
      <PageHeader
        icon={UserPlus}
        tone="sky"
        breadcrumbs={[
          { label: t('people.title'), to: `${base}/people` },
          { label: t('people.addPerson') },
        ]}
        title={t('people.addPerson')}
        description={t('people.addPersonHint')}
      />
      {fields.isPending || tags.isPending ? (
        <SkeletonCards count={3} className="sm:grid-cols-1 lg:grid-cols-1" />
      ) : fields.isError || tags.isError ? (
        <ErrorState
          error={fields.error ?? tags.error}
          message={getErrorMessage(fields.error ?? tags.error)}
          onRetry={() => {
            void fields.refetch();
            void tags.refetch();
          }}
        />
      ) : (
        <PersonForm
          fields={editable}
          tags={tags.data.items}
          canEditAdminFields={can.editPersonAdminFields(access) || can.createPerson(access)}
          canEditTags={can.createPerson(access)}
          submitLabel={t('people.addPerson')}
          pending={create.isPending}
          onCancel={() => navigate(`${base}/people`)}
          onSubmit={async (values, form) => {
            if (create.isPending) return;
            try {
              const result = await create.mutateAsync(values);
              toast.success(t('people.added', { name: fullName(result.person) }), {
                action: {
                  label: t('people.addAnother'),
                  onClick: () => navigate(`${base}/people/new`),
                },
              });
              navigate(`${base}/people/${result.person.id}`, { replace: true });
            } catch (error) {
              if (applyServerErrors(error, form.setError, personFormFieldNames(editable))) {
                toast.error(t('common.fixErrors'));
              } else {
                toast.error(getErrorMessage(error));
              }
            }
          }}
        />
      )}
    </Page>
  );
}
