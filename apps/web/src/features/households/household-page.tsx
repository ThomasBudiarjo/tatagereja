import {
  GENDERS,
  GENDER_TEXT,
  HOUSEHOLD_RELATIONSHIPS,
  HOUSEHOLD_RELATIONSHIP_LABELS,
  ageOn,
  createFamilyMemberBodySchema,
  fullName,
  localize,
  type CreateFamilyMemberBody,
  type HouseholdMember,
  type HouseholdRelationship,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  Baby,
  Home,
  MapPin,
  Pencil,
  Phone,
  Star,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Alert, Segmented } from '@/components/ui/misc';
import { RowActions } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import {
  householdQuery,
  peopleListQuery,
  useAddHouseholdMember,
  useCreateFamilyMember,
  useDeleteHousehold,
  useRemoveHouseholdMember,
  useUpdateHouseholdMember,
} from '@/features/people/api';
import { todayInZone } from '@/features/people/labels';
import { AreaChip, ContactButtons, PersonStatusBadge } from '@/features/people/people-ui';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { isGone, useMutationToast } from '@/lib/use-mutation-toast';
import { HouseholdFormDialog } from './household-form';

type DialogName = 'edit' | 'pick' | 'new' | 'delete' | null;

export function HouseholdPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { churchId, base, church } = useChurch();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(householdQuery(churchId, id));
  const [dialog, setDialog] = useState<DialogName>(null);
  const [removing, setRemoving] = useState<HouseholdMember | null>(null);
  const addMember = useMutationToast(useAddHouseholdMember(churchId, id), {
    success: (data) =>
      data.movedFrom
        ? t('people.movedHousehold', { from: data.movedFrom.name, to: data.household.name })
        : t('people.memberAddedToHousehold'),
  });
  const updateMember = useMutationToast(useUpdateHouseholdMember(churchId, id), {
    success: t('people.memberUpdated'),
  });
  const removeMember = useMutationToast(useRemoveHouseholdMember(churchId, id));
  const remove = useMutationToast(useDeleteHousehold(churchId));
  const today = todayInZone(church.timezone);
  const close = (next: boolean) => {
    if (!next) setDialog(null);
  };

  if (query.isPending) {
    return (
      <Page size="wide">
        <PageHeader
          backTo={`${base}/households`}
          title={t('people.household')}
          documentTitle={false}
        />
        <SkeletonStats count={3} className="lg:grid-cols-3" />
        <SkeletonList rows={4} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader backTo={`${base}/households`} title={t('people.household')} />
        <ErrorState
          error={query.error}
          title={isGone(query.error) ? t('people.householdGone') : undefined}
          message={getErrorMessage(query.error)}
          onRetry={isGone(query.error) ? undefined : () => void query.refetch()}
        />
      </Page>
    );
  }

  const { household, canManage, canAddPeople } = query.data;
  const children = household.members.filter((member) => member.relationship === 'child').length;
  const membersOf = household.members.map((member) => member.id);

  return (
    <Page size="wide">
      <PageHeader
        icon={Home}
        tone="amber"
        breadcrumbs={[
          { label: t('people.title'), to: `${base}/people` },
          { label: t('people.householdsTitle'), to: `${base}/households` },
          { label: household.name },
        ]}
        title={household.name}
        description={[household.address, household.city].filter(Boolean).join(', ') || undefined}
        actions={
          canManage ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setDialog('edit')}>
                <Pencil /> <span className="hidden sm:inline">{t('common.edit')}</span>
              </Button>
              <RowActions
                label={t('common.moreActions')}
                className="size-9 border border-input bg-card"
                actions={[
                  {
                    id: 'delete',
                    label: t('people.deleteHousehold'),
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('people.statMembersCount')}
          value={household.members.length}
          icon={Users}
          tone="amber"
        />
        <StatCard label={t('people.statChildren')} value={children} icon={Baby} tone="rose" />
        <Card className="col-span-2 flex items-center justify-between gap-3 p-3.5 sm:p-4">
          <div className="min-w-0">
            <p className="text-overline text-muted-foreground">{t('people.contact')}</p>
            <div className="mt-1.5 flex flex-col gap-1 text-sm">
              {household.area ? (
                <Link to={`${base}/areas/${household.area.id}`} className="w-fit">
                  <AreaChip area={household.area} />
                </Link>
              ) : null}
              {household.phone ? (
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 text-muted-foreground" aria-hidden /> {household.phone}
                </span>
              ) : null}
              {household.address ? (
                <span className="flex items-center gap-1.5 truncate">
                  <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{household.address}</span>
                </span>
              ) : null}
              {!household.area && !household.phone && !household.address ? (
                <span className="text-muted-foreground">{t('people.noContact')}</span>
              ) : null}
            </div>
          </div>
          <ContactButtons phone={household.phone} email={null} />
        </Card>
      </div>

      <Section
        title={t('people.familyMembers')}
        icon={UsersRound}
        action={
          canManage ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setDialog('pick')}>
                <UserPlus /> <span className="hidden sm:inline">{t('people.addExisting')}</span>
              </Button>
              {canAddPeople ? (
                <Button size="sm" onClick={() => setDialog('new')}>
                  <UserPlus /> <span className="hidden sm:inline">{t('people.addFamily')}</span>
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {household.members.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            tone="amber"
            title={t('people.noMembersYet')}
            description={t('people.noMembersHint')}
            action={
              canManage ? (
                <Button onClick={() => setDialog('pick')}>
                  <UserPlus /> {t('people.addExisting')}
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
            {household.members.map((member) => {
              const name = fullName(member);
              const years = member.birthDate ? ageOn(member.birthDate, today) : null;
              return (
                <li key={member.id} className="flex items-center gap-2 pr-2">
                  <Link
                    to={`${base}/people/${member.id}`}
                    className="group flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60"
                  >
                    <EntityAvatar name={name} src={member.photoUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{name}</span>
                        {member.isPrimaryContact ? (
                          <StatusBadge tone="amber" size="sm" icon={Star}>
                            {t('people.primaryContact')}
                          </StatusBadge>
                        ) : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {[
                          localize(HOUSEHOLD_RELATIONSHIP_LABELS[member.relationship], locale),
                          years !== null ? t('common.years', { count: years }) : null,
                          member.gender !== 'unspecified'
                            ? localize(GENDER_TEXT[member.gender], locale)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <PersonStatusBadge status={member.membershipStatus} size="sm" />
                  </Link>
                  {canManage ? (
                    <RowActions
                      label={t('people.actionsFor', { name })}
                      actions={[
                        ...HOUSEHOLD_RELATIONSHIPS.filter(
                          (value) => value !== member.relationship,
                        ).map((value) => ({
                          id: `rel-${value}`,
                          label: t('people.makeRelationship', {
                            relationship: localize(HOUSEHOLD_RELATIONSHIP_LABELS[value], locale),
                          }),
                          onSelect: () =>
                            void updateMember.run({
                              personId: member.id,
                              relationship: value,
                              isPrimaryContact: member.isPrimaryContact,
                            }),
                        })),
                        {
                          id: 'primary',
                          label: t('people.makePrimaryContact'),
                          icon: Star,
                          hidden: member.isPrimaryContact,
                          onSelect: () =>
                            void updateMember.run({
                              personId: member.id,
                              relationship: member.relationship,
                              isPrimaryContact: true,
                            }),
                        },
                        {
                          id: 'remove',
                          label: t('people.removeFromHousehold'),
                          icon: UserMinus,
                          destructive: true,
                          onSelect: () => setRemoving(member),
                        },
                      ]}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {household.notes ? (
        <Section title={t('people.notes')}>
          <Card>
            <CardContent className="text-sm whitespace-pre-line">{household.notes}</CardContent>
          </Card>
        </Section>
      ) : null}

      {canManage ? (
        <>
          <HouseholdFormDialog
            key={household.updatedAt}
            household={household}
            open={dialog === 'edit'}
            onOpenChange={close}
          />
          <AddExistingMemberDialog
            householdName={household.name}
            excludeIds={membersOf}
            open={dialog === 'pick'}
            onOpenChange={close}
            pending={addMember.isPending}
            onAdd={async (body) => {
              if (await addMember.run(body)) setDialog(null);
            }}
          />
          {canAddPeople ? (
            <NewFamilyMemberDialog
              householdId={household.id}
              householdName={household.name}
              defaultLastName={household.members[0]?.lastName ?? ''}
              open={dialog === 'new'}
              onOpenChange={close}
            />
          ) : null}
          <ConfirmDialog
            open={!!removing}
            onOpenChange={(next) => !next && setRemoving(null)}
            title={t('people.removeMemberTitle', { name: removing ? fullName(removing) : '' })}
            description={t('people.removeMemberDescription')}
            confirmLabel={t('people.removeFromHousehold')}
            loading={removeMember.isPending}
            onConfirm={async () => {
              if (!removing) return;
              if (await removeMember.run(removing.id)) {
                toast.success(t('people.memberRemoved', { name: fullName(removing) }));
                setRemoving(null);
              }
            }}
          />
          <ConfirmDialog
            open={dialog === 'delete'}
            onOpenChange={close}
            title={t('people.deleteHouseholdTitle', { name: household.name })}
            description={t('people.deleteHouseholdDescription', {
              count: household.members.length,
            })}
            confirmText={household.name}
            confirmLabel={t('people.deleteHousehold')}
            loading={remove.isPending}
            onConfirm={async () => {
              if (await remove.run(household.id)) {
                toast.success(t('people.householdDeleted', { name: household.name }));
                navigate(`${base}/households`, { replace: true });
              }
            }}
          />
        </>
      ) : null}
    </Page>
  );
}

/** Adds someone already in the directory; they move out of their current household. */
function AddExistingMemberDialog({
  householdName,
  excludeIds,
  open,
  onOpenChange,
  pending,
  onAdd,
}: {
  householdName: string;
  excludeIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onAdd: (body: {
    personId: string;
    relationship: HouseholdRelationship;
    isPrimaryContact: boolean;
  }) => Promise<void>;
}) {
  const { churchId } = useChurch();
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [person, setPerson] = useState<{
    value: string;
    label: string;
    description?: string;
  } | null>(null);
  const [relationship, setRelationship] = useState<HouseholdRelationship>('child');
  const [primary, setPrimary] = useState(false);
  const people = useQuery({
    ...peopleListQuery(churchId, { q: search || undefined, limit: 20 }),
    enabled: open,
  });
  const listed = (people.data?.items ?? [])
    .filter((item) => !excludeIds.includes(item.id))
    .map((item) => ({
      value: item.id,
      label: fullName(item),
      description: item.householdName
        ? t('people.movesFrom', { household: item.householdName })
        : undefined,
      leading: <EntityAvatar name={fullName(item)} src={item.photoUrl} size="xs" />,
    }));
  const options =
    person && !listed.some((item) => item.value === person.value) ? [person, ...listed] : listed;
  const reset = () => {
    setPerson(null);
    setSearch('');
    setRelationship('child');
    setPrimary(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('people.addExisting')}</DialogTitle>
          <DialogDescription>
            {t('people.addExistingHint', { household: householdName })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field label={t('people.person')} htmlFor="existing-person">
            <Combobox
              id="existing-person"
              value={person?.value ?? null}
              onChange={(value) =>
                setPerson(options.find((option) => option.value === value) ?? null)
              }
              onSearchChange={setSearch}
              loading={people.isFetching}
              options={options}
              placeholder={t('people.choosePerson')}
            />
          </Field>
          {person?.description ? <Alert variant="info">{person.description}</Alert> : null}
          <Field label={t('people.relationship')} htmlFor="existing-relationship">
            <Select
              id="existing-relationship"
              value={relationship}
              onChange={(event) => setRelationship(event.target.value as HouseholdRelationship)}
            >
              {HOUSEHOLD_RELATIONSHIPS.map((option) => (
                <option key={option} value={option}>
                  {localize(HOUSEHOLD_RELATIONSHIP_LABELS[option], locale)}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3.5 py-3 text-sm">
            <span className="font-medium">{t('people.makePrimaryContact')}</span>
            <Switch checked={primary} onCheckedChange={setPrimary} />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!person}
            loading={pending}
            onClick={async () => {
              if (!person) return;
              await onAdd({ personId: person.value, relationship, isPrimaryContact: primary });
              reset();
            }}
          >
            {t('people.addToHousehold')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewFamilyMemberDialog({
  householdId,
  householdName,
  defaultLastName,
  open,
  onOpenChange,
}: {
  householdId: string;
  householdName: string;
  defaultLastName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t, locale } = useI18n();
  const create = useCreateFamilyMember(churchId, householdId);
  const form = useForm<
    z.input<typeof createFamilyMemberBodySchema>,
    unknown,
    CreateFamilyMemberBody
  >({
    resolver: zodResolver(createFamilyMemberBodySchema),
    defaultValues: {
      person: { firstName: '', lastName: defaultLastName, gender: 'unspecified', birthDate: '' },
      relationship: 'child',
      copyContact: true,
    },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    if (create.isPending) return;
    try {
      const result = await create.mutateAsync(values);
      toast.success(
        t('people.familyAdded', { name: fullName(result.person), household: householdName }),
      );
      form.reset();
      onOpenChange(false);
    } catch (error) {
      if (
        applyServerErrors(error, form.setError, [
          'person.firstName',
          'person.lastName',
          'person.birthDate',
        ])
      ) {
        toast.error(t('common.fixErrors'));
      } else toast.error(getErrorMessage(error));
    }
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('people.addFamily')}</DialogTitle>
          <DialogDescription>
            {t('people.addFamilyHint', { household: householdName })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="new-family-form"
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('people.firstName')}
                htmlFor="new-first"
                error={errors.person?.firstName?.message}
                required
              >
                <Input
                  id="new-first"
                  autoFocus
                  {...form.register('person.firstName')}
                  aria-invalid={!!errors.person?.firstName}
                />
              </Field>
              <Field label={t('people.lastName')} htmlFor="new-last">
                <Input id="new-last" {...form.register('person.lastName')} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('people.relationship')} htmlFor="new-relationship">
                <Select id="new-relationship" {...form.register('relationship')}>
                  {HOUSEHOLD_RELATIONSHIPS.map((value) => (
                    <option key={value} value={value}>
                      {localize(HOUSEHOLD_RELATIONSHIP_LABELS[value], locale)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t('people.birthDate')}
                htmlFor="new-birth"
                error={errors.person?.birthDate?.message}
              >
                <Input id="new-birth" type="date" {...form.register('person.birthDate')} />
              </Field>
            </div>
            <Field label={t('people.gender')}>
              <Controller
                control={form.control}
                name="person.gender"
                render={({ field }) => (
                  <Segmented
                    aria-label={t('people.gender')}
                    value={field.value ?? 'unspecified'}
                    onChange={field.onChange}
                    options={GENDERS.map((gender) => ({
                      value: gender,
                      label: localize(GENDER_TEXT[gender], locale),
                    }))}
                  />
                )}
              />
            </Field>
            <Controller
              control={form.control}
              name="copyContact"
              render={({ field }) => (
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3.5 py-3 text-sm">
                  <span>
                    <span className="block font-medium">{t('people.copyContact')}</span>
                    <span className="block text-muted-foreground">
                      {t('people.copyContactHint')}
                    </span>
                  </span>
                  <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                </label>
              )}
            />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="new-family-form" loading={create.isPending}>
            {t('people.addFamily')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
