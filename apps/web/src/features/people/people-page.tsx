import {
  GENDERS,
  GENDER_TEXT,
  PERSON_MEMBERSHIP_STATUSES,
  PERSON_STATUS_TEXT,
  ageOn,
  can,
  fullName,
  localize,
  type DirectoryPerson,
  type DirectorySort,
  type Gender,
  type PersonMembershipStatus,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Cake,
  Copy,
  Download,
  Home,
  Map as MapIcon,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
  Tags,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { groupsQuery } from '@/features/groups/api';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import {
  areasQuery,
  downloadPeopleCsv,
  fieldsQuery,
  peopleListQuery,
  peopleSummaryQuery,
  tagsQuery,
  type PeopleListParams,
} from './api';
import { sectionLetter, todayInZone } from './labels';
import { AreaChip, CelebrationBadges, PersonStatusBadge, TagChip } from './people-ui';

const PAGE_SIZE = 50;

/** Age bands offered as one filter; each maps to the API's minAge/maxAge. */
const AGE_FILTERS = {
  children: [0, 12],
  teens: [13, 17],
  youth: [18, 30],
  adults: [31, 50],
  elders: [51, 65],
  seniors: [66, 150],
} as const;
type AgeFilter = keyof typeof AGE_FILTERS;
const AGE_LABELS: Record<AgeFilter, MessageKey> = {
  children: 'people.ageChildren',
  teens: 'people.ageTeens',
  youth: 'people.ageYouth',
  adults: 'people.ageAdults',
  elders: 'people.ageElders',
  seniors: 'people.ageSeniors',
};

const SORTS = ['name', '-name', '-created', 'birthday', 'anniversary', 'joined'] as const;
const SORT_LABELS: Record<(typeof SORTS)[number], MessageKey> = {
  name: 'people.sortName',
  '-name': 'people.sortNameDesc',
  '-created': 'people.sortNewest',
  birthday: 'people.sortBirthday',
  anniversary: 'people.sortAnniversary',
  joined: 'people.sortJoined',
};

const DEFAULTS = {
  q: '',
  status: '',
  gender: '',
  area: '',
  tag: '',
  group: '',
  account: '',
  age: '',
  celebration: '',
  field: '',
  household: '',
  sort: 'name',
  page: 1,
};

export function PeoplePage() {
  const { churchId, base, access, church } = useChurch();
  const { t, locale, formatNumber } = useI18n();
  const [state, setState, reset] = useUrlState(DEFAULTS);
  const [exporting, setExporting] = useState(false);
  const listTop = useRef<HTMLDivElement>(null);
  const today = todayInZone(church.timezone);

  const age = AGE_FILTERS[state.age as AgeFilter] as readonly [number, number] | undefined;
  const sort = (SORTS as readonly string[]).includes(state.sort) ? state.sort : 'name';
  const [fieldId, ...fieldRest] = state.field ? state.field.split(':') : [];
  const params: PeopleListParams = {
    q: state.q || undefined,
    status: (state.status || undefined) as PersonMembershipStatus | undefined,
    gender: (state.gender || undefined) as Gender | undefined,
    areaId: state.area || undefined,
    tagId: state.tag || undefined,
    groupId: state.group || undefined,
    householdId: state.household || undefined,
    hasAccount: state.account === 'yes' ? true : state.account === 'no' ? false : undefined,
    minAge: age?.[0],
    maxAge: age?.[1],
    celebration: state.celebration === 'week' ? 'any' : undefined,
    fieldId: fieldId || undefined,
    fieldValue: fieldId ? fieldRest.join(':') : undefined,
    sort: sort.replace('-', '') as DirectorySort,
    order: sort.startsWith('-') ? 'desc' : 'asc',
    page: state.page,
    limit: PAGE_SIZE,
  };
  const query = useQuery({
    ...peopleListQuery(churchId, params),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery(peopleSummaryQuery(churchId));
  const areas = useQuery(areasQuery(churchId));
  const tags = useQuery(tagsQuery(churchId));
  const groups = useQuery(groupsQuery(churchId));
  const fields = useQuery(fieldsQuery(churchId));

  const canAdd = can.createPerson(access);
  const canExport = can.exportPeople(access);
  const canMerge = can.mergePeople(access);
  const canFields = can.manageCustomFields(access);

  const areaNames = useMemo(
    () => new Map((areas.data?.items ?? []).map((area) => [area.id, area])),
    [areas.data],
  );
  const tagById = useMemo(
    () => new Map((tags.data?.items ?? []).map((tag) => [tag.id, tag])),
    [tags.data],
  );

  const fieldOptions = (fields.data?.items ?? []).flatMap((field) =>
    field.type === 'select'
      ? field.options.map((option) => ({
          value: `${field.id}:${option}`,
          label: `${field.label}: ${option}`,
        }))
      : field.type === 'checkbox'
        ? [{ value: `${field.id}:true`, label: `${field.label}: ${t('common.yes')}` }]
        : [],
  );

  const filters: FilterDefinition[] = [
    {
      id: 'status',
      label: t('people.filterStatus'),
      value: state.status,
      onChange: (value) => setState({ status: value }),
      options: PERSON_MEMBERSHIP_STATUSES.map((status) => ({
        value: status,
        label: localize(PERSON_STATUS_TEXT[status], locale),
        count: summary.data?.byStatus.find((row) => row.key === status)?.count,
      })),
    },
    {
      id: 'celebration',
      label: t('people.filterCelebration'),
      value: state.celebration,
      onChange: (value) => setState({ celebration: value }),
      options: [{ value: 'week', label: t('people.celebrationWeek') }],
    },
    {
      id: 'gender',
      label: t('people.filterGender'),
      value: state.gender,
      onChange: (value) => setState({ gender: value }),
      options: GENDERS.filter((gender) => gender !== 'unspecified').map((gender) => ({
        value: gender,
        label: localize(GENDER_TEXT[gender], locale),
      })),
    },
    {
      id: 'age',
      label: t('people.filterAge'),
      value: state.age,
      onChange: (value) => setState({ age: value }),
      options: (Object.keys(AGE_FILTERS) as AgeFilter[]).map((key) => ({
        value: key,
        label: t(AGE_LABELS[key]),
      })),
    },
    ...(areas.data && areas.data.items.length > 0
      ? [
          {
            id: 'area',
            label: t('people.filterArea'),
            value: state.area,
            onChange: (value: string) => setState({ area: value }),
            options: areas.data.items.map((area) => ({
              value: area.id,
              label: area.code ? `${area.code} · ${area.name}` : area.name,
              count: area.personCount,
            })),
          },
        ]
      : []),
    ...(tags.data && tags.data.items.length > 0
      ? [
          {
            id: 'tag',
            label: t('people.filterTag'),
            value: state.tag,
            onChange: (value: string) => setState({ tag: value }),
            options: tags.data.items.map((tag) => ({
              value: tag.id,
              label: tag.name,
              count: tag.personCount,
            })),
          },
        ]
      : []),
    ...(groups.data && groups.data.items.length > 0
      ? [
          {
            id: 'group',
            label: t('people.filterGroup'),
            value: state.group,
            onChange: (value: string) => setState({ group: value }),
            options: groups.data.items.map((group) => ({
              value: group.id,
              label: group.name,
              count: group.memberCount,
            })),
          },
        ]
      : []),
    {
      id: 'account',
      label: t('people.filterAccount'),
      value: state.account,
      onChange: (value) => setState({ account: value }),
      options: [
        { value: 'yes', label: t('people.accountYes') },
        { value: 'no', label: t('people.accountNo') },
      ],
    },
    ...(fieldOptions.length > 0
      ? [
          {
            id: 'field',
            label: t('people.filterField'),
            value: state.field,
            onChange: (value: string) => setState({ field: value }),
            options: fieldOptions,
          },
        ]
      : []),
  ];

  const filtered =
    !!state.q || filters.some((filter) => !filter.multiple && !!filter.value) || !!state.household;
  const items = query.data?.items ?? [];
  const showLetters = sort === 'name' || sort === '-name';
  const householdName = state.household
    ? (items.find((person) => person.householdId === state.household)?.householdName ?? null)
    : null;

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { page: _page, limit: _limit, ...exportParams } = params;
      await downloadPeopleCsv(churchId, exportParams);
      toast.success(t('people.exported'));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const changePage = (page: number) => {
    setState({ page }, { push: true });
    listTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const moreItems = [
    canAdd ? { to: 'people/import', icon: Upload, label: t('people.importTitle') } : null,
    canMerge ? { to: 'people/duplicates', icon: Copy, label: t('people.duplicatesTitle') } : null,
    canFields ? { to: 'people/fields', icon: Tags, label: t('people.fieldsTitle') } : null,
  ].filter((item): item is NonNullable<typeof item> => !!item);

  return (
    <Page size="wide">
      <PageHeader
        icon={Users}
        tone="sky"
        title={t('people.title')}
        description={
          query.data
            ? t('people.directoryCount', { count: query.data.total })
            : t('people.navDescription')
        }
        actions={
          <>
            {canAdd ? (
              <Button asChild size="sm">
                <Link to={`${base}/people/new`}>
                  <Plus /> <span>{t('common.add')}</span>
                </Link>
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="size-9"
                  aria-label={t('common.moreActions')}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuItem asChild>
                  <Link to={`${base}/households`}>
                    <Home /> {t('people.householdsTitle')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={`${base}/areas`}>
                    <MapIcon /> {t('people.areasTitle')}
                  </Link>
                </DropdownMenuItem>
                {moreItems.length > 0 || canExport ? <DropdownMenuSeparator /> : null}
                {moreItems.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={`${base}/${item.to}`}>
                      <item.icon /> {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                {canExport ? (
                  <DropdownMenuItem disabled={exporting} onSelect={() => void exportCsv()}>
                    <Download /> {filtered ? t('people.exportFiltered') : t('people.exportAll')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {summary.isPending ? (
        <SkeletonStats />
      ) : summary.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={t('people.statPeople')}
            value={formatNumber(summary.data.people)}
            hint={
              summary.data.newThisMonth > 0
                ? t('people.statNewThisMonth', { count: summary.data.newThisMonth })
                : undefined
            }
            icon={Users}
            tone="sky"
          />
          <StatCard
            label={t('people.statMembers')}
            value={formatNumber(
              summary.data.byStatus.find((row) => row.key === 'member')?.count ?? 0,
            )}
            icon={UserCheck}
            tone="emerald"
            to={`${base}/people?status=member`}
          />
          <StatCard
            label={t('people.statHouseholds')}
            value={formatNumber(summary.data.households)}
            icon={Home}
            tone="amber"
            to={`${base}/households`}
          />
          <StatCard
            label={t('people.statCelebrations')}
            value={formatNumber(summary.data.celebrations.length)}
            hint={t('people.statCelebrationsHint')}
            icon={Cake}
            tone="rose"
            to={`${base}/people?celebration=week&sort=birthday`}
          />
        </div>
      ) : null}

      <div ref={listTop} className="scroll-mt-20" />
      <FilterBar
        search={{
          value: state.q,
          onChange: (value) => setState({ q: value }),
          placeholder: t('people.searchPlaceholder'),
        }}
        filters={filters}
        sort={{
          value: sort,
          onChange: (value) => setState({ sort: value }),
          options: SORTS.map((value) => ({ value, label: t(SORT_LABELS[value]) })),
        }}
        onReset={() => reset(['sort'])}
      />

      {state.household ? (
        <div className="flex">
          <button
            type="button"
            onClick={() => setState({ household: '' })}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-primary/30 bg-accent px-3.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/70"
          >
            <Home className="size-4" aria-hidden />
            {householdName ?? t('people.filterHousehold')}
            <X className="size-3.5 opacity-70" aria-label={t('common.clear')} />
          </button>
        </div>
      ) : null}

      {query.isPending ? (
        <SkeletonList rows={8} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SlidersHorizontal}
            tone="sky"
            title={t('people.noMatches')}
            description={t('common.noResultsHint')}
            action={
              <Button variant="outline" onClick={() => reset(['sort'])}>
                {t('common.clearAll')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            tone="sky"
            title={t('people.emptyTitle')}
            description={t('people.emptyDescription')}
            action={
              canAdd ? (
                <Button asChild>
                  <Link to={`${base}/people/new`}>
                    <UserPlus /> {t('people.addFirst')}
                  </Link>
                </Button>
              ) : null
            }
            secondaryAction={
              canAdd ? (
                <Button asChild variant="outline">
                  <Link to={`${base}/people/import`}>
                    <Upload /> {t('people.importTitle')}
                  </Link>
                </Button>
              ) : null
            }
          />
        )
      ) : (
        <div
          className={cn(
            'flex flex-col gap-4 transition-opacity duration-200',
            query.isPlaceholderData && 'opacity-60',
          )}
          aria-busy={query.isPlaceholderData || undefined}
        >
          <DirectoryList
            people={items}
            showLetters={showLetters}
            today={today}
            areaNames={areaNames}
            tagById={tagById}
          />
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={changePage}
          />
        </div>
      )}
    </Page>
  );
}

function DirectoryList({
  people,
  showLetters,
  today,
  areaNames,
  tagById,
}: {
  people: DirectoryPerson[];
  showLetters: boolean;
  today: string;
  areaNames: Map<string, { id: string; name: string; code: string | null; color: string | null }>;
  tagById: Map<string, { name: string; color: string | null }>;
}) {
  const { base } = useChurch();
  const { t } = useI18n();
  const sections: { letter: string | null; people: DirectoryPerson[] }[] = [];
  for (const person of people) {
    const letter = showLetters ? sectionLetter(person.firstName) : null;
    const last = sections[sections.length - 1];
    if (last && last.letter === letter) last.people.push(person);
    else sections.push({ letter, people: [person] });
  }
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, index) => (
        <section
          key={`${section.letter ?? 'all'}-${index}`}
          aria-label={section.letter ?? undefined}
        >
          {section.letter ? (
            <h2 className="sticky top-[calc(var(--header-height)+0.25rem)] z-10 mb-2 flex w-fit items-center justify-center rounded-lg bg-background/90 px-2.5 py-0.5 text-sm font-bold tracking-tight text-muted-foreground backdrop-blur">
              {section.letter}
            </h2>
          ) : null}
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
            {section.people.map((person) => {
              const name = fullName(person);
              const years = person.birthDate ? ageOn(person.birthDate, today) : null;
              const area = person.areaId ? areaNames.get(person.areaId) : undefined;
              const details = [
                person.householdName,
                years !== null ? t('common.years', { count: years }) : null,
                person.phone,
              ].filter(Boolean);
              return (
                <li key={person.id}>
                  <Link
                    to={`${base}/people/${person.id}`}
                    className="group flex min-h-16 items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset active:bg-muted"
                  >
                    <EntityAvatar name={name} src={person.photoUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{name}</span>
                        <CelebrationBadges
                          birthDate={person.birthDate}
                          weddingDate={person.weddingDate}
                          today={today}
                          compact
                        />
                      </div>
                      {details.length > 0 ? (
                        <p className="truncate text-sm text-muted-foreground">
                          {details.join(' · ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="hidden min-w-0 shrink items-center gap-1.5 lg:flex">
                      {area ? <AreaChip area={area} /> : null}
                      {person.tagIds.slice(0, 2).map((tagId) => {
                        const tag = tagById.get(tagId);
                        return tag ? <TagChip key={tagId} tag={tag} /> : null;
                      })}
                    </div>
                    <PersonStatusBadge status={person.membershipStatus} size="sm" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
