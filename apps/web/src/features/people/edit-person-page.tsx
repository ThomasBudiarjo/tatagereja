import { can, fullName } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { isGone } from '@/lib/use-mutation-toast';
import { personQuery, tagsQuery, useUpdatePerson } from './api';
import { PersonForm } from './person-form';
import { personFormFieldNames } from './person-form-fields';

export function EditPersonPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base, access } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(personQuery(churchId, id));
  const tags = useQuery({ ...tagsQuery(churchId), enabled: !!query.data?.canEditTags });
  const update = useUpdatePerson(churchId, id);
  const back = `${base}/people/${id}`;
  useDocumentTitle(query.data && !query.data.canEdit ? t('people.editPerson') : null);

  if (query.isPending || (query.data?.canEditTags && tags.isPending)) {
    return (
      <Page>
        <PageHeader backTo={back} title={t('people.editPerson')} documentTitle={false} />
        <SkeletonCards count={3} className="sm:grid-cols-1 lg:grid-cols-1" />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader backTo={`${base}/people`} title={t('people.editPerson')} />
        <ErrorState
          error={query.error}
          title={isGone(query.error) ? t('people.goneTitle') : undefined}
          message={getErrorMessage(query.error)}
          onRetry={isGone(query.error) ? undefined : () => void query.refetch()}
        />
      </Page>
    );
  }
  const profile = query.data;
  const name = fullName(profile.person);
  if (!profile.canEdit) {
    return (
      <NoAccessState
        description={t('people.cannotEdit')}
        action={
          <Button variant="outline" onClick={() => navigate(back)}>
            {t('common.goBack')}
          </Button>
        }
      />
    );
  }
  const fields = profile.customFields
    .filter((item) => !item.field.isPrivate || profile.canEditPrivate)
    .map((item) => item.field);
  const fieldValues = Object.fromEntries(
    profile.customFields.map((item) => [item.field.id, item.value]),
  );

  return (
    <Page>
      <PageHeader
        icon={Pencil}
        tone="sky"
        breadcrumbs={[
          { label: t('people.title'), to: `${base}/people` },
          { label: name, to: back },
          { label: t('common.edit') },
        ]}
        title={t('people.editTitle', { name })}
        documentTitle={t('people.editTitle', { name })}
      />
      <PersonForm
        // Remount when the profile changes elsewhere so the form starts from saved values.
        key={profile.person.updatedAt}
        person={profile.person}
        fieldValues={fieldValues}
        fields={fields}
        tags={tags.data?.items ?? []}
        canEditAdminFields={can.editPersonAdminFields(access)}
        canEditTags={profile.canEditTags}
        submitLabel={t('common.saveChanges')}
        pending={update.isPending}
        onCancel={() => navigate(back)}
        onSubmit={async (values, form) => {
          if (update.isPending) return;
          try {
            await update.mutateAsync(values);
            toast.success(t('people.saved', { name: fullName(values) }));
            navigate(back, { replace: true });
          } catch (error) {
            if (applyServerErrors(error, form.setError, personFormFieldNames(fields))) {
              toast.error(t('common.fixErrors'));
            } else {
              toast.error(getErrorMessage(error));
            }
          }
        }}
      />
    </Page>
  );
}
