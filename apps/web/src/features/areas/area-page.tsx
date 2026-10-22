import {
  PEOPLE_AGE_BAND_LABELS,
  PERSON_STATUS_TEXT,
  fullName,
  localize,
  type PeopleAgeBand,
  type PersonMembershipStatus,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Cake,
  Heart,
  Home,
  Map as MapIcon,
  Pencil,
  Plus,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart, DonutChart } from '@/components/ui/charts';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { ListGroup, ListRow } from '@/components/ui/list';
import { RowActions } from '@/components/ui/row-actions';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  accountsQuery,
  areaQuery,
  householdsQuery,
  peopleListQuery,
  useAddAreaCoordinator,
  useAssignToArea,
  useDeleteArea,
  useRemoveAreaCoordinator,
} from '@/features/people/api';
import { PersonStatusBadge } from '@/features/people/people-ui';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { isGone, useMutationToast } from '@/lib/use-mutation-toast';
import { AreaFormDialog } from './area-form';

type DialogName = 'edit' | 'delete' | 'coordinator' | 'assign' | null;

export function AreaPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base } = useChurch();
  const { t, locale, formatNumber, formatDate } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(areaQuery(churchId, id));
  const people = useQuery({
    ...peopleListQuery(churchId, { areaId: id, limit: 12 }),
    placeholderData: keepPreviousData,
  });
  const households = useQuery(householdsQuery(churchId, { areaId: id, limit: 12 }));
  const [dialog, setDialog] = useState<DialogName>(null);
  const remove = useMutationToast(useDeleteArea(churchId));
  const removeCoordinator = useMutationToast(useRemoveAreaCoordinator(churchId, id), {
    success: t('people.coordinatorRemoved'),
  });
  const close = (next: boolean) => {
    if (!next) setDialog(null);
  };

  if (query.isPending) {
    return (
      <Page size="wide">
        <PageHeader backTo={`${base}/areas`} title={t('people.area')} documentTitle={false} />
        <SkeletonStats />
        <SkeletonList rows={4} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader backTo={`${base}/areas`} title={t('people.area')} />
        <ErrorState
          error={query.error}
          title={isGone(query.error) ? t('people.areaGone') : undefined}
          message={getErrorMessage(query.error)}
          onRetry={isGone(query.error) ? undefined : () => void query.refetch()}
        />
      </Page>
    );
  }
  const { area, stats, canManage, isCoordinator } = query.data;
  const members = stats.byStatus.find((row) => row.key === 'member')?.count ?? 0;

  return (
    <Page size="wide">
      <PageHeader
        icon={MapIcon}
        tone="emerald"
        breadcrumbs={[
          { label: t('people.title'), to: `${base}/people` },
          { label: t('people.areasTitle'), to: `${base}/areas` },
          { label: area.name },
        ]}
        eyebrow={area.code ?? undefined}
        title={area.name}
        description={area.description ?? undefined}
        actions={
          canManage ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setDialog('edit')}>
                <Pencil /> <span className="hidden sm:inline">{t('common.edit')}</span>
              </Button>
              <RowActions
                className="size-9 border border-input bg-card"
                actions={[
                  {
                    id: 'assign',
                    label: t('people.assignToArea'),
                    icon: Plus,
                    onSelect: () => setDialog('assign'),
                  },
                  {
                    id: 'coordinator',
                    label: t('people.addCoordinator'),
                    icon: UserCog,
                    onSelect: () => setDialog('coordinator'),
                  },
                  {
                    id: 'delete',
                    label: t('people.deleteArea'),
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setDialog('delete'),
                  },
                ]}
              />
            </>
          ) : null
        }
      />
      {isCoordinator ? (
        <div
          data-tone="emerald"
          className="flex items-center gap-2 rounded-xl border border-tone/25 bg-tone-soft/60 px-3.5 py-2.5 text-sm text-tone-ink"
        >
          <UserCog className="size-4 shrink-0" aria-hidden /> {t('people.youCoordinate')}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('people.statPeople')}
          value={formatNumber(stats.people)}
          icon={Users}
          tone="emerald"
          to={`${base}/people?area=${area.id}`}
        />
        <StatCard
          label={t('people.statMembers')}
          value={formatNumber(members)}
          icon={Users}
          tone="sky"
          to={`${base}/people?area=${area.id}&status=member`}
        />
        <StatCard
          label={t('people.statHouseholds')}
          value={formatNumber(stats.households)}
          icon={Home}
          tone="amber"
          to={`${base}/households?area=${area.id}`}
        />
        <StatCard
          label={t('people.statCelebrations')}
          value={formatNumber(stats.celebrations.length)}
          hint={t('people.statCelebrationsHint')}
          icon={Cake}
          tone="rose"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent>
            <DonutChart
              title={t('people.byStatus')}
              centerLabel={t('people.statPeople')}
              data={stats.byStatus
                .filter((row) => row.count > 0)
                .map((row) => ({
                  label: localize(PERSON_STATUS_TEXT[row.key as PersonMembershipStatus], locale),
                  value: row.count,
                }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <BarChart
              title={t('people.byAge')}
              height={200}
              data={stats.byAge.map((row) => ({
                label: localize(PEOPLE_AGE_BAND_LABELS[row.key as PeopleAgeBand], locale).replace(
                  / \(.*\)$/,
                  '',
                ),
                value: row.count,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section
            title={t('people.areaPeople')}
            action={
              <Button asChild variant="link" size="sm">
                <Link to={`${base}/people?area=${area.id}`}>
                  {t('common.seeAll')} <ArrowRight />
                </Link>
              </Button>
            }
          >
            {people.isPending ? (
              <SkeletonList rows={4} />
            ) : people.isError ? (
              <ErrorState
                compact
                message={getErrorMessage(people.error)}
                onRetry={() => void people.refetch()}
              />
            ) : people.data.items.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                tone="emerald"
                title={t('people.areaNoPeople')}
                description={t('people.areaNoPeopleHint')}
                action={
                  canManage ? (
                    <Button onClick={() => setDialog('assign')}>
                      <Plus /> {t('people.assignToArea')}
                    </Button>
                  ) : null
                }
              />
            ) : (
              <ListGroup>
                {people.data.items.map((person) => (
                  <ListRow
                    key={person.id}
                    to={`${base}/people/${person.id}`}
                    leading={
                      <EntityAvatar name={fullName(person)} src={person.photoUrl} size="sm" />
                    }
                    title={fullName(person)}
                    subtitle={person.householdName ?? undefined}
                    trailing={<PersonStatusBadge status={person.membershipStatus} size="sm" />}
                  />
                ))}
              </ListGroup>
            )}
          </Section>
          <Section title={t('people.householdsTitle')}>
            {households.isPending ? (
              <SkeletonList rows={3} avatar={false} />
            ) : households.isError ? (
              <ErrorState
                compact
                message={getErrorMessage(households.error)}
                onRetry={() => void households.refetch()}
              />
            ) : households.data.items.length === 0 ? (
              <EmptyState compact icon={Home} tone="amber" title={t('people.areaNoHouseholds')} />
            ) : (
              <ListGroup>
                {households.data.items.map((household) => (
                  <ListRow
                    key={household.id}
                    to={`${base}/households/${household.id}`}
                    leading={
                      <span
                        data-tone="amber"
                        className="flex size-9 items-center justify-center rounded-lg bg-tone-soft text-tone-ink"
                      >
                        <Home className="size-4" aria-hidden />
                      </span>
                    }
                    title={household.name}
                    subtitle={t('people.memberCount', { count: household.members.length })}
                  />
                ))}
              </ListGroup>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Section
            title={t('people.coordinators')}
            icon={UserCog}
            action={
              canManage ? (
                <Button size="sm" variant="ghost" onClick={() => setDialog('coordinator')}>
                  <UserPlus /> {t('common.add')}
                </Button>
              ) : null
            }
          >
            {area.coordinators.length === 0 ? (
              <EmptyState
                compact
                icon={UserCog}
                tone="emerald"
                title={t('people.noCoordinator')}
                description={t('people.coordinatorHint')}
              />
            ) : (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
                {area.coordinators.map((coordinator) => (
                  <li
                    key={coordinator.userId}
                    className="flex min-h-14 items-center gap-3 px-4 py-2.5"
                  >
                    <EntityAvatar name={coordinator.name} src={coordinator.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {coordinator.name}
                    </span>
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('people.removeCoordinator', { name: coordinator.name })}
                        disabled={removeCoordinator.isPending}
                        onClick={() => void removeCoordinator.run(coordinator.userId)}
                      >
                        <UserMinus />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={t('people.celebrationsTitle')} icon={Cake}>
            {stats.celebrations.length === 0 ? (
              <EmptyState compact icon={Cake} tone="rose" title={t('people.noCelebrations')} />
            ) : (
              <ListGroup>
                {stats.celebrations.map((item) => (
                  <ListRow
                    key={`${item.person.id}-${item.kind}`}
                    to={`${base}/people/${item.person.id}`}
                    leading={
                      <EntityAvatar
                        name={fullName(item.person)}
                        src={item.person.photoUrl}
                        size="sm"
                      />
                    }
                    title={fullName(item.person)}
                    subtitle={`${formatDate(item.date, 'dayMonth')} · ${
                      item.kind === 'birthday'
                        ? t('people.turnsAge', { count: item.years })
                        : t('people.yearsMarried', { count: item.years })
                    }`}
                    trailing={
                      <StatusBadge
                        size="sm"
                        tone={item.kind === 'birthday' ? 'rose' : 'violet'}
                        icon={item.kind === 'birthday' ? Cake : Heart}
                      >
                        {item.inDays === 0
                          ? t('people.today')
                          : t('people.inDays', { count: item.inDays })}
                      </StatusBadge>
                    }
                  />
                ))}
              </ListGroup>
            )}
          </Section>
        </div>
      </div>

      {canManage ? (
        <>
          <AreaFormDialog
            key={area.updatedAt}
            area={area}
            open={dialog === 'edit'}
            onOpenChange={close}
          />
          <CoordinatorDialog
            areaId={area.id}
            existing={area.coordinators.map((coordinator) => coordinator.userId)}
            open={dialog === 'coordinator'}
            onOpenChange={close}
          />
          <AssignDialog
            areaId={area.id}
            areaName={area.name}
            open={dialog === 'assign'}
            onOpenChange={close}
          />
          <ConfirmDialog
            open={dialog === 'delete'}
            onOpenChange={close}
            title={t('people.deleteAreaTitle', { name: area.name })}
            description={t('people.deleteAreaDescription', {
              people: stats.people,
              households: stats.households,
            })}
            confirmText={area.name}
            confirmLabel={t('people.deleteArea')}
            loading={remove.isPending}
            onConfirm={async () => {
              if (await remove.run(area.id)) {
                toast.success(t('people.areaDeleted', { name: area.name }));
                navigate(`${base}/areas`, { replace: true });
              }
            }}
          />
        </>
      ) : null}
    </Page>
  );
}

function CoordinatorDialog({
  areaId,
  existing,
  open,
  onOpenChange,
}: {
  areaId: string;
  existing: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const accounts = useQuery({ ...accountsQuery(churchId), enabled: open });
  const add = useMutationToast(useAddAreaCoordinator(churchId, areaId), {
    success: t('people.coordinatorAdded'),
  });
  const [userId, setUserId] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => !add.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('people.addCoordinator')}</DialogTitle>
          <DialogDescription>{t('people.coordinatorHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label={t('people.account')} htmlFor="coordinator-user">
            <Combobox
              id="coordinator-user"
              value={userId}
              onChange={setUserId}
              loading={accounts.isPending}
              options={(accounts.data?.items ?? [])
                .filter((account) => !existing.includes(account.userId))
                .map((account) => ({
                  value: account.userId,
                  label: account.name,
                  description: account.email,
                  leading: <EntityAvatar name={account.name} src={account.avatarUrl} size="xs" />,
                  keywords: [account.email],
                }))}
              placeholder={t('people.chooseAccount')}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={add.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!userId}
            loading={add.isPending}
            onClick={async () => {
              if (userId && (await add.run({ userId }))) {
                setUserId(null);
                onOpenChange(false);
              }
            }}
          >
            {t('people.addCoordinator')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Assigns households (and, optionally, individual people) to the area. */
function AssignDialog({
  areaId,
  areaName,
  open,
  onOpenChange,
}: {
  areaId: string;
  areaName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const [householdSearch, setHouseholdSearch] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [householdIds, setHouseholdIds] = useState<string[]>([]);
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const households = useQuery({
    ...householdsQuery(churchId, { q: householdSearch || undefined, limit: 30 }),
    enabled: open,
  });
  const people = useQuery({
    ...peopleListQuery(churchId, { q: personSearch || undefined, limit: 30 }),
    enabled: open,
  });
  const assign = useMutationToast(useAssignToArea(churchId, areaId), {
    success: t('people.assigned', { area: areaName }),
  });
  const withSelected = (
    options: { value: string; label: string; description?: string }[],
    selected: string[],
  ) => [
    ...selected
      .filter((value) => !options.some((option) => option.value === value))
      .map((value) => ({ value, label: labels[value] ?? value })),
    ...options,
  ];
  const remember = (options: { value: string; label: string }[], values: string[]) =>
    setLabels((current) => ({
      ...current,
      ...Object.fromEntries(
        options
          .filter((option) => values.includes(option.value))
          .map((option) => [option.value, option.label]),
      ),
    }));
  const householdOptions = (households.data?.items ?? []).map((household) => ({
    value: household.id,
    label: household.name,
    description: household.area ? household.area.name : undefined,
  }));
  const personOptions = (people.data?.items ?? []).map((person) => ({
    value: person.id,
    label: fullName(person),
    description: person.householdName ?? undefined,
  }));
  return (
    <Dialog open={open} onOpenChange={(next) => !assign.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('people.assignToArea')}</DialogTitle>
          <DialogDescription>{t('people.assignHint', { area: areaName })}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field
            label={t('people.householdsTitle')}
            htmlFor="assign-households"
            description={t('people.assignHouseholdsHint')}
          >
            <Combobox
              id="assign-households"
              multiple
              value={householdIds}
              onChange={(values) => {
                remember(householdOptions, values);
                setHouseholdIds(values);
              }}
              onSearchChange={setHouseholdSearch}
              loading={households.isFetching}
              options={withSelected(householdOptions, householdIds)}
              placeholder={t('people.chooseHouseholds')}
              clearable
            />
          </Field>
          <Field
            label={t('people.individuals')}
            htmlFor="assign-people"
            description={t('people.assignPeopleHint')}
          >
            <Combobox
              id="assign-people"
              multiple
              value={personIds}
              onChange={(values) => {
                remember(personOptions, values);
                setPersonIds(values);
              }}
              onSearchChange={setPersonSearch}
              loading={people.isFetching}
              options={withSelected(personOptions, personIds)}
              placeholder={t('people.choosePeople')}
              clearable
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={assign.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={householdIds.length + personIds.length === 0}
            loading={assign.isPending}
            onClick={async () => {
              if (await assign.run({ householdIds, personIds })) {
                setHouseholdIds([]);
                setPersonIds([]);
                onOpenChange(false);
              }
            }}
          >
            {t('people.assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
