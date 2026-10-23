import {
  CARE_CATEGORIES,
  CARE_CATEGORY_LABELS,
  CARE_PRIORITIES,
  CARE_PRIORITY_LABELS,
  CARE_STATUSES,
  CARE_STATUS_LABELS,
  fullName,
  has,
  isCareTeam,
  localize,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { HandHeart, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { AvatarGroup } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, PersonFilterNotice } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { SkeletonTable } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { casesQuery, type CaseListParams } from './api';
import {
  CareNav,
  CaseStatusBadge,
  ConfidentialBadge,
  DueLabel,
  PriorityBadge,
  SubjectLine,
} from './components';
import { CATEGORY_ICONS, CATEGORY_TONES, useToday } from './helpers';
import { ToneIcon } from '@/components/ui/status-badge';

const PAGE_SIZE = 25;

export function CasesPage() {
  const { t, locale } = useI18n();
  const { churchId, base, access } = useChurch();
  const today = useToday();
  const team = isCareTeam(access);
  const canCreate = has(access, 'care.manage');
  const [state, setState, reset] = useUrlState({
    q: '',
    status: 'active',
    category: '',
    priority: '',
    confidentiality: '',
    mine: false as boolean,
    personId: '',
    sort: 'updated',
    page: 1,
  });
  const params: CaseListParams = {
    q: state.q || undefined,
    status: state.status || undefined,
    category: state.category || undefined,
    priority: state.priority || undefined,
    confidentiality: state.confidentiality || undefined,
    mine: state.mine || !team ? 'true' : undefined,
    personId: state.personId || undefined,
    sort: state.sort,
    page: state.page,
    limit: PAGE_SIZE,
  };
  const query = useQuery({ ...casesQuery(churchId, params), placeholderData: keepPreviousData });
  const narrowed = !!(
    state.q ||
    state.category ||
    state.priority ||
    state.confidentiality ||
    state.mine ||
    state.status !== 'active'
  );
  const filtered = narrowed || !!state.personId;
  // A profile links here with `?personId=`; the name comes from the cases that are about them.
  const subject = state.personId
    ? query.data?.items.find((item) => item.person?.id === state.personId)?.person
    : undefined;
  const newCase = canCreate ? (
    <Button asChild size="sm">
      <Link to={`${base}/care/cases/new${state.personId ? `?personId=${state.personId}` : ''}`}>
        <Plus />
        <span className="hidden sm:inline">{t('care.newCase')}</span>
        <span className="sm:hidden">{t('common.add')}</span>
      </Link>
    </Button>
  ) : null;

  return (
    <Page size="wide">
      <PageHeader
        icon={HandHeart}
        tone="rose"
        title={team ? t('care.navCases') : t('care.myCases')}
        description={t('care.casesDescription')}
        breadcrumbs={[{ label: t('care.nav'), to: `${base}/care` }, { label: t('care.navCases') }]}
        actions={newCase}
      />
      <CareNav />
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('care.searchCases'),
        }}
        filters={[
          {
            id: 'status',
            label: t('care.status'),
            value: state.status,
            onChange: (status) => setState({ status }),
            options: [
              { value: 'active', label: t('care.statusActive') },
              ...CARE_STATUSES.map((value) => ({
                value,
                label: localize(CARE_STATUS_LABELS[value], locale),
              })),
            ],
          },
          {
            id: 'category',
            label: t('care.category'),
            value: state.category,
            onChange: (category) => setState({ category }),
            options: CARE_CATEGORIES.map((value) => ({
              value,
              label: localize(CARE_CATEGORY_LABELS[value], locale),
            })),
          },
          {
            id: 'priority',
            label: t('care.priority'),
            value: state.priority,
            onChange: (priority) => setState({ priority }),
            options: CARE_PRIORITIES.map((value) => ({
              value,
              label: localize(CARE_PRIORITY_LABELS[value], locale),
            })),
          },
          ...(team
            ? [
                {
                  id: 'confidentiality',
                  label: t('care.access'),
                  value: state.confidentiality,
                  onChange: (confidentiality: string) => setState({ confidentiality }),
                  options: [
                    { value: 'normal', label: t('care.careTeam') },
                    { value: 'confidential', label: t('care.confidential') },
                  ],
                },
                {
                  id: 'mine',
                  label: t('care.assignment'),
                  value: state.mine ? 'mine' : '',
                  onChange: (value: string) => setState({ mine: value === 'mine' }),
                  options: [{ value: 'mine', label: t('care.assignedToMe') }],
                },
              ]
            : []),
        ]}
        sort={{
          value: state.sort,
          onChange: (sort) => setState({ sort }),
          options: [
            { value: 'updated', label: t('care.sortUpdated') },
            { value: 'next_action', label: t('care.sortNextAction') },
            { value: 'priority', label: t('care.sortPriority') },
          ],
        }}
        onReset={() => reset(['sort'])}
      />
      {state.personId ? (
        <PersonFilterNotice
          name={subject ? fullName(subject) : null}
          photoUrl={subject?.photoUrl}
          onClear={() => setState({ personId: '' })}
        />
      ) : null}

      {query.isPending ? (
        <SkeletonTable rows={6} columns={5} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={HandHeart}
          tone="rose"
          title={
            narrowed
              ? t('common.noResults')
              : filtered
                ? t('care.noPersonCasesTitle')
                : t('care.noCasesTitle')
          }
          description={
            narrowed
              ? t('common.noResultsHint')
              : filtered
                ? t('care.noPersonCasesDescription')
                : team
                  ? t('care.noCasesDescription')
                  : t('care.noAssignedCasesDescription')
          }
          action={!narrowed ? newCase : null}
        />
      ) : (
        <>
          <ResponsiveTable
            items={query.data.items}
            getKey={(item) => item.id}
            caption={t('care.navCases')}
            href={(item) => `${base}/care/cases/${item.id}`}
            columns={[
              {
                id: 'title',
                header: t('care.caseTitle'),
                primary: true,
                cell: (item) => (
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ToneIcon
                      icon={CATEGORY_ICONS[item.category]}
                      tone={CATEGORY_TONES[item.category]}
                      size="sm"
                      className="max-md:hidden"
                    />
                    <span className="min-w-0 truncate">{item.title}</span>
                    {item.confidentiality === 'confidential' ? (
                      <ConfidentialBadge size="sm" />
                    ) : null}
                  </span>
                ),
              },
              {
                id: 'person',
                header: t('care.person'),
                secondary: true,
                cell: (item) => (
                  <SubjectLine
                    person={item.person}
                    household={item.household}
                    fallback={localize(CARE_CATEGORY_LABELS[item.category], locale)}
                  />
                ),
              },
              {
                id: 'status',
                header: t('care.status'),
                cell: (item) => (
                  <span className="inline-flex flex-wrap items-center gap-1.5 lg:flex-nowrap">
                    <CaseStatusBadge status={item.status} size="sm" />
                    <PriorityBadge priority={item.priority} size="sm" quiet />
                  </span>
                ),
              },
              {
                id: 'next',
                header: t('care.nextStep'),
                cell: (item) =>
                  item.status !== 'closed' && item.nextActionDate ? (
                    <DueLabel date={item.nextActionDate} today={today} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              {
                id: 'caregivers',
                header: t('care.caregivers'),
                hideBelowLg: true,
                hideOnMobile: true,
                cell: (item) =>
                  item.caregivers.length > 0 ? (
                    <AvatarGroup
                      size="xs"
                      people={item.caregivers.map((caregiver) => ({
                        id: caregiver.userId,
                        name: caregiver.name,
                        src: caregiver.avatarUrl,
                      }))}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('care.noCaregiver')}</span>
                  ),
              },
            ]}
          />
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => setState({ page })}
          />
        </>
      )}
    </Page>
  );
}
