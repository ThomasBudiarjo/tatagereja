import { careVisitInputSchema, has, type CareVisit, type CareVisitInput } from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Footprints, HandHeart, Lock, MapPin, Pencil, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { SkeletonCards, SkeletonText } from '@/components/ui/skeleton';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { caseQuery, useDeleteVisit, useSaveVisit, visitQuery } from './api';
import { ConfidentialityPicker } from './case-form';
import {
  ConfidentialBadge,
  HouseholdCombobox,
  PeopleCombobox,
  PersonCombobox,
  ToggleRow,
} from './components';
import { personName, useToday } from './helpers';
import { DateChip } from './visits-page';

const visitTitle = (visit: CareVisit, fallback: string) =>
  personName(visit.person) ?? visit.household?.name ?? fallback;

export function VisitPage() {
  const { t, formatDate } = useI18n();
  const { churchId, base } = useChurch();
  const navigate = useNavigate();
  const { visitId = '' } = useParams();
  const query = useQuery(visitQuery(churchId, visitId));
  const [deleting, setDeleting] = useState(false);
  const remove = useMutationToast(useDeleteVisit(churchId), { success: t('care.visitDeleted') });
  const crumbs = [
    { label: t('care.nav'), to: `${base}/care` },
    { label: t('care.navVisits'), to: `${base}/care/visits` },
  ];

  if (query.isPending) {
    return (
      <Page>
        <PageHeader title={t('care.visitDetail')} breadcrumbs={crumbs} documentTitle={false} />
        <SkeletonText lines={6} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('care.visitDetail')} breadcrumbs={crumbs} />
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </Page>
    );
  }
  const visit = query.data.visit;
  const name = visitTitle(visit, t('care.visitUntitled'));
  return (
    <Page>
      <PageHeader
        icon={Footprints}
        tone="teal"
        eyebrow={formatDate(visit.visitDate, 'dateLong')}
        title={t('care.visitTo', { name })}
        documentTitle={visit.confidentiality === 'confidential' ? t('care.visitDetail') : undefined}
        breadcrumbs={[...crumbs, { label: name }]}
        actions={
          visit.canManage ? (
            <>
              <Button asChild variant="outline" className="max-sm:size-11 max-sm:px-0">
                <Link to={`${base}/care/visits/${visit.id}/edit`}>
                  <Pencil />
                  <span className="hidden sm:inline">{t('common.edit')}</span>
                  <span className="sr-only sm:hidden">{t('common.edit')}</span>
                </Link>
              </Button>
              <Button
                variant="outline"
                size="icon-lg"
                aria-label={t('care.deleteVisit')}
                onClick={() => setDeleting(true)}
              >
                <Trash2 />
              </Button>
            </>
          ) : null
        }
      />
      {visit.confidentiality === 'confidential' ? (
        <Alert variant="error" title={t('care.confidentialBannerTitle')}>
          {t('care.confidentialVisitBanner')}
        </Alert>
      ) : null}
      <Card className="animate-rise-in">
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <DateChip date={visit.visitDate} />
            <div className="min-w-0">
              <p className="font-semibold">{name}</p>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                {visit.location ? (
                  <>
                    <MapPin className="size-3.5" />
                    {visit.location}
                  </>
                ) : (
                  formatDate(visit.visitDate, 'dateLong')
                )}
              </p>
            </div>
            {visit.confidentiality === 'confidential' ? (
              <span className="ml-auto">
                <ConfidentialBadge size="sm" />
              </span>
            ) : null}
          </div>
          <div>
            <p className="text-overline flex items-center gap-1.5 text-muted-foreground">
              <Users className="size-3.5" />
              {t('care.visitors')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {visit.visitors.map((person) => (
                <span
                  key={person.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2.5 pl-0.5 text-xs font-medium"
                >
                  <EntityAvatar name={personName(person) ?? ''} src={person.photoUrl} size="xs" />
                  {personName(person)}
                </span>
              ))}
              {visit.otherVisitors ? (
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                  {visit.otherVisitors}
                </span>
              ) : null}
              {visit.visitors.length === 0 && !visit.otherVisitors ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-overline text-muted-foreground">{t('care.summary')}</p>
            <p className="mt-1.5 text-sm whitespace-pre-wrap text-pretty">
              {visit.summary ?? (
                <span className="text-muted-foreground">{t('care.noSummary')}</span>
              )}
            </p>
          </div>
          {visit.followUpNeeded ? (
            <Alert variant="warning" title={t('care.followUpNeeded')}>
              {visit.followUpNote ?? t('care.followUpNoNote')}
            </Alert>
          ) : null}
          {visit.caseId ? (
            <Button asChild variant="soft" className="w-fit">
              <Link to={`${base}/care/cases/${visit.caseId}`}>
                <HandHeart />
                {t('care.openLinkedCase')}
              </Link>
            </Button>
          ) : null}
          {visit.createdBy ? (
            <p className="text-xs text-muted-foreground">
              {t('care.recordedBy', {
                name: visit.createdBy.name,
                date: formatDate(visit.createdAt, 'dateLong'),
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('care.deleteVisitTitle')}
        description={t('care.deleteVisitDescription')}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(visit.id)) navigate(`${base}/care/visits`, { replace: true });
        }}
      />
    </Page>
  );
}

export function NewVisitPage() {
  const { t } = useI18n();
  const { base, access } = useChurch();
  const [search] = useSearchParams();
  // Without care.manage a visit can only be recorded for a case the caller accompanies.
  if (!has(access, 'care.manage') && !search.get('caseId')) {
    return (
      <NoAccessState
        action={
          <Button asChild>
            <Link to={`${base}/care`}>{t('care.backToCare')}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <Page size="narrow">
      <PageHeader
        icon={Footprints}
        tone="teal"
        title={t('care.logVisit')}
        description={t('care.logVisitDescription')}
        breadcrumbs={[
          { label: t('care.nav'), to: `${base}/care` },
          { label: t('care.navVisits'), to: `${base}/care/visits` },
          { label: t('care.logVisit') },
        ]}
      />
      <VisitForm />
    </Page>
  );
}

export function EditVisitPage() {
  const { t } = useI18n();
  const { churchId, base } = useChurch();
  const { visitId = '' } = useParams();
  const query = useQuery(visitQuery(churchId, visitId));
  return (
    <Page size="narrow">
      <PageHeader
        title={t('care.editVisit')}
        breadcrumbs={[
          { label: t('care.nav'), to: `${base}/care` },
          { label: t('care.navVisits'), to: `${base}/care/visits` },
          { label: t('care.visitDetail'), to: `${base}/care/visits/${visitId}` },
          { label: t('common.edit') },
        ]}
      />
      {query.isPending ? (
        <SkeletonCards count={2} className="sm:grid-cols-1 lg:grid-cols-1" />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data.visit.canManage ? (
        <NoAccessState
          action={
            <Button asChild variant="outline">
              <Link to={`${base}/care/visits/${visitId}`}>{t('common.back')}</Link>
            </Button>
          }
        />
      ) : (
        <VisitForm visit={query.data.visit} />
      )}
    </Page>
  );
}

type FormValues = z.input<typeof careVisitInputSchema>;

function VisitForm({ visit }: { visit?: CareVisit }) {
  const { t } = useI18n();
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const today = useToday();
  const [search] = useSearchParams();
  const caseId = visit ? visit.caseId : search.get('caseId');
  const linked = useQuery({ ...caseQuery(churchId, caseId ?? ''), enabled: !!caseId });
  const linkedCase = linked.data?.case;
  const [saved, setSaved] = useState(false);
  const form = useForm<FormValues, unknown, CareVisitInput>({
    resolver: zodResolver(careVisitInputSchema),
    defaultValues: {
      caseId: caseId ?? null,
      personId: visit ? (visit.person?.id ?? null) : search.get('personId'),
      householdId: visit?.household?.id ?? null,
      visitDate: visit?.visitDate ?? today,
      location: visit?.location ?? '',
      summary: visit?.summary ?? '',
      confidentiality: visit?.confidentiality ?? 'normal',
      followUpNeeded: visit?.followUpNeeded ?? false,
      followUpNote: visit?.followUpNote ?? '',
      visitorPersonIds: visit
        ? visit.visitors.map((person) => person.id)
        : access.personId
          ? [access.personId]
          : [],
      otherVisitors: visit?.otherVisitors ?? '',
    },
  });
  const errors = form.formState.errors;
  const followUpNeeded = useWatch({ control: form.control, name: 'followUpNeeded' });
  const { isDirty, isSubmitting } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !saved);
  const save = useMutationToast(useSaveVisit(churchId), {
    success: visit ? t('care.visitSaved') : t('care.visitLogged'),
    form,
  });
  const inherited = linkedCase?.confidentiality === 'confidential';
  const onSubmit = form.handleSubmit(async (values) => {
    const result = await save.run({ ...values, id: visit?.id });
    if (result) {
      setSaved(true);
      navigate(
        caseId && !visit
          ? `${base}/care/cases/${caseId}?tab=visits`
          : `${base}/care/visits/${result.visit.id}`,
        { replace: true },
      );
    }
  });

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
      {guard}
      {linkedCase ? (
        <Alert variant="info" title={t('care.visitForCase', { title: linkedCase.title })}>
          {inherited ? t('care.visitInheritsConfidential') : t('care.visitForCaseHint')}
        </Alert>
      ) : null}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,11rem)_1fr]">
            <Field
              label={t('care.visitDate')}
              htmlFor="visit-date"
              error={errors.visitDate?.message}
              required
            >
              <Input
                id="visit-date"
                type="date"
                autoFocus
                max={today}
                aria-invalid={!!errors.visitDate}
                {...form.register('visitDate')}
              />
            </Field>
            <Field
              label={t('care.location')}
              htmlFor="visit-location"
              error={errors.location?.message}
            >
              <Input
                id="visit-location"
                placeholder={t('care.locationPlaceholder')}
                {...form.register('location')}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="personId"
              render={({ field }) => (
                <Field
                  label={t('care.visitedPerson')}
                  htmlFor="visit-person"
                  error={errors.personId?.message}
                  description={linkedCase ? t('care.visitedPersonFromCase') : undefined}
                >
                  <PersonCombobox
                    id="visit-person"
                    value={field.value ?? null}
                    selected={visit?.person ?? linkedCase?.person}
                    invalid={!!errors.personId}
                    onChange={(value) => field.onChange(value)}
                  />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="householdId"
              render={({ field }) => (
                <Field label={t('care.household')} htmlFor="visit-household">
                  <HouseholdCombobox
                    id="visit-household"
                    value={field.value ?? null}
                    selected={visit?.household}
                    onChange={field.onChange}
                  />
                </Field>
              )}
            />
          </div>
          <Controller
            control={form.control}
            name="visitorPersonIds"
            render={({ field }) => (
              <Field
                label={t('care.visitors')}
                htmlFor="visit-visitors"
                description={t('care.visitorsHint')}
              >
                <PeopleCombobox
                  id="visit-visitors"
                  value={field.value ?? []}
                  selected={visit?.visitors}
                  onChange={field.onChange}
                />
              </Field>
            )}
          />
          <Field label={t('care.otherVisitors')} htmlFor="visit-other">
            <Input
              id="visit-other"
              placeholder={t('care.otherVisitorsPlaceholder')}
              {...form.register('otherVisitors')}
            />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field
            label={t('care.summary')}
            htmlFor="visit-summary"
            error={errors.summary?.message}
            description={t('care.summaryHint')}
          >
            <Textarea
              id="visit-summary"
              rows={5}
              placeholder={t('care.summaryPlaceholder')}
              {...form.register('summary')}
            />
          </Field>
          {inherited ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" />
              {t('care.visitInheritsConfidential')}
            </p>
          ) : (
            <Field label={t('care.whoCanRead')}>
              <Controller
                control={form.control}
                name="confidentiality"
                render={({ field }) => (
                  <ConfidentialityPicker
                    name="visit-confidentiality"
                    value={field.value ?? 'normal'}
                    onChange={field.onChange}
                    lockLower={!!visit && visit.confidentiality === 'confidential'}
                  />
                )}
              />
            </Field>
          )}
          <Controller
            control={form.control}
            name="followUpNeeded"
            render={({ field }) => (
              <ToggleRow
                id="visit-follow-up"
                label={t('care.followUpNeeded')}
                description={t('care.followUpNeededHint')}
                checked={!!field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          {followUpNeeded ? (
            <Field label={t('care.followUpNote')} htmlFor="visit-follow-up-note">
              <Input
                id="visit-follow-up-note"
                placeholder={t('care.followUpNotePlaceholder')}
                {...form.register('followUpNote')}
              />
            </Field>
          ) : null}
        </CardContent>
      </Card>
      <FormActions>
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {visit ? t('common.saveChanges') : t('care.saveVisit')}
        </Button>
      </FormActions>
    </form>
  );
}
