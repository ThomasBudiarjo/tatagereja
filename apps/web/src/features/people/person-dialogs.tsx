import {
  GENDERS,
  GENDER_TEXT,
  HOUSEHOLD_RELATIONSHIPS,
  HOUSEHOLD_RELATIONSHIP_LABELS,
  MARITAL_STATUSES,
  MARITAL_STATUS_TEXT,
  addFamilyMemberBodySchema,
  fullName,
  localize,
  personPrivateDetailsInputSchema,
  type AddFamilyMemberBody,
  type HouseholdRelationship,
  type PersonPrivateDetails,
  type PersonPrivateDetailsInput,
  type PersonProfile,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert, Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import {
  accountsQuery,
  areasQuery,
  householdsQuery,
  useAddFamilyMember,
  useAddHouseholdMember,
  useAssignPersonArea,
  useLinkPersonUser,
  useSavePrivateDetails,
} from './api';

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

const PRIVATE_FIELDS = [
  'nationalId',
  'maritalStatus',
  'baptismDate',
  'emergencyContactName',
  'emergencyContactPhone',
  'medicalNotes',
  'privateNotes',
] as const;

export function PrivateDetailsDialog({
  churchId,
  personId,
  details,
  open,
  onOpenChange,
}: DialogProps & { churchId: string; personId: string; details: PersonPrivateDetails | null }) {
  const { t, locale } = useI18n();
  const save = useSavePrivateDetails(churchId, personId);
  const form = useForm<
    z.input<typeof personPrivateDetailsInputSchema>,
    unknown,
    PersonPrivateDetailsInput
  >({
    resolver: zodResolver(personPrivateDetailsInputSchema),
    defaultValues: {
      nationalId: details?.nationalId ?? '',
      maritalStatus: details?.maritalStatus ?? 'unspecified',
      baptismDate: details?.baptismDate ?? '',
      emergencyContactName: details?.emergencyContactName ?? '',
      emergencyContactPhone: details?.emergencyContactPhone ?? '',
      medicalNotes: details?.medicalNotes ?? '',
      privateNotes: details?.privateNotes ?? '',
    },
  });
  const errors = form.formState.errors;
  const run = useMutationToast(save, {
    success: t('people.privateSaved'),
    form,
    fields: PRIVATE_FIELDS,
  });
  const submit = form.handleSubmit(async (values) => {
    if (await run.run(values)) onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !run.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('people.privateDetails')}</DialogTitle>
          <DialogDescription>{t('people.privateDetailsHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="private-details-form"
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('people.maritalStatus')}
                htmlFor="maritalStatus"
                error={errors.maritalStatus?.message}
              >
                <Select id="maritalStatus" autoFocus {...form.register('maritalStatus')}>
                  {MARITAL_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {localize(MARITAL_STATUS_TEXT[status], locale)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t('people.baptismDate')}
                htmlFor="baptismDate"
                error={errors.baptismDate?.message}
              >
                <Input
                  id="baptismDate"
                  type="date"
                  {...form.register('baptismDate')}
                  aria-invalid={!!errors.baptismDate}
                />
              </Field>
            </div>
            <Field
              label={t('people.nationalId')}
              htmlFor="nationalId"
              error={errors.nationalId?.message}
            >
              <Input id="nationalId" inputMode="numeric" {...form.register('nationalId')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('people.emergencyName')}
                htmlFor="emergencyContactName"
                error={errors.emergencyContactName?.message}
              >
                <Input id="emergencyContactName" {...form.register('emergencyContactName')} />
              </Field>
              <Field
                label={t('people.emergencyPhone')}
                htmlFor="emergencyContactPhone"
                error={errors.emergencyContactPhone?.message}
              >
                <Input
                  id="emergencyContactPhone"
                  type="tel"
                  inputMode="tel"
                  {...form.register('emergencyContactPhone')}
                />
              </Field>
            </div>
            <Field
              label={t('people.medicalNotes')}
              htmlFor="medicalNotes"
              error={errors.medicalNotes?.message}
            >
              <Textarea id="medicalNotes" rows={2} {...form.register('medicalNotes')} />
            </Field>
            <Field
              label={t('people.privateNotes')}
              htmlFor="privateNotes"
              error={errors.privateNotes?.message}
            >
              <Textarea id="privateNotes" rows={3} {...form.register('privateNotes')} />
            </Field>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={run.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="private-details-form" loading={run.isPending}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LinkAccountDialog({
  churchId,
  personId,
  currentUserId,
  open,
  onOpenChange,
}: DialogProps & { churchId: string; personId: string; currentUserId: string | null }) {
  const { t } = useI18n();
  const accounts = useQuery({ ...accountsQuery(churchId), enabled: open });
  const link = useLinkPersonUser(churchId, personId);
  const run = useMutationToast(link, {
    success: (_data, variables) =>
      variables.userId ? t('people.accountLinked') : t('people.accountUnlinked'),
  });
  const [selected, setSelected] = useState<string | null>(currentUserId);
  const options = (accounts.data?.items ?? []).map((account) => ({
    value: account.userId,
    label: account.name,
    description: account.email,
    leading: <EntityAvatar name={account.name} src={account.avatarUrl} size="xs" />,
    // An account linked to someone else cannot be chosen.
    disabled: !!account.personId && account.personId !== personId,
    keywords: [account.email],
  }));
  return (
    <Dialog open={open} onOpenChange={(next) => !run.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('people.linkAccount')}</DialogTitle>
          <DialogDescription>{t('people.linkAccountHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-24">
          {accounts.isPending ? (
            <Skeleton className="h-11" />
          ) : accounts.isError ? (
            <Alert variant="error">{getErrorMessage(accounts.error)}</Alert>
          ) : (
            <Field
              label={t('people.account')}
              htmlFor="link-user"
              description={t('people.accountTakenHint')}
            >
              <Combobox
                id="link-user"
                value={selected}
                onChange={setSelected}
                options={options}
                placeholder={t('people.notLinked')}
                clearable
              />
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={run.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={run.isPending}
            disabled={selected === currentUserId}
            onClick={async () => {
              if (await run.run({ userId: selected })) onOpenChange(false);
            }}
          >
            {selected ? t('people.linkAccount') : t('people.unlinkAccount')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const relationshipOptions = (locale: 'id' | 'en') =>
  HOUSEHOLD_RELATIONSHIPS.map((value) => (
    <option key={value} value={value}>
      {localize(HOUSEHOLD_RELATIONSHIP_LABELS[value], locale)}
    </option>
  ));

/** Quick "add family member": creates the person in this person's household (or a new one). */
export function AddFamilyDialog({
  churchId,
  profile,
  open,
  onOpenChange,
  onAdded,
}: DialogProps & {
  churchId: string;
  profile: PersonProfile;
  onAdded?: (personId: string) => void;
}) {
  const { t, locale } = useI18n();
  const add = useAddFamilyMember(churchId, profile.person.id);
  const hasHousehold = !!profile.household;
  const form = useForm<z.input<typeof addFamilyMemberBodySchema>, unknown, AddFamilyMemberBody>({
    resolver: zodResolver(addFamilyMemberBodySchema),
    defaultValues: {
      person: {
        firstName: '',
        lastName: profile.person.lastName ?? '',
        gender: 'unspecified',
        birthDate: '',
      },
      relationship: 'child',
      copyContact: true,
      anchorRelationship: 'head',
    },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    if (add.isPending) return;
    try {
      const result = await add.mutateAsync(values);
      toast.success(
        t('people.familyAdded', {
          name: fullName(result.person),
          household: result.household.name,
        }),
      );
      form.reset();
      onOpenChange(false);
      onAdded?.(result.person.id);
    } catch (error) {
      if (
        applyServerErrors(error, form.setError, [
          'person.firstName',
          'person.lastName',
          'person.birthDate',
          'relationship',
        ])
      ) {
        toast.error(t('common.fixErrors'));
      } else {
        toast.error(getErrorMessage(error));
      }
    }
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !add.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('people.addFamily')}</DialogTitle>
          <DialogDescription>
            {hasHousehold
              ? t('people.addFamilyHint', { household: profile.household?.name ?? '' })
              : t('people.addFamilyNewHousehold', { name: fullName(profile.person) })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="add-family-form"
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('people.firstName')}
                htmlFor="family-first"
                error={errors.person?.firstName?.message}
                required
              >
                <Input
                  id="family-first"
                  autoFocus
                  {...form.register('person.firstName')}
                  aria-invalid={!!errors.person?.firstName}
                />
              </Field>
              <Field
                label={t('people.lastName')}
                htmlFor="family-last"
                error={errors.person?.lastName?.message}
              >
                <Input id="family-last" {...form.register('person.lastName')} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('people.relationship')} htmlFor="family-relationship">
                <Select id="family-relationship" {...form.register('relationship')}>
                  {relationshipOptions(locale)}
                </Select>
              </Field>
              <Field
                label={t('people.birthDate')}
                htmlFor="family-birth"
                error={errors.person?.birthDate?.message}
              >
                <Input id="family-birth" type="date" {...form.register('person.birthDate')} />
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
            {!hasHousehold ? (
              <Field
                label={t('people.anchorRelationship', { name: profile.person.firstName })}
                htmlFor="family-anchor"
              >
                <Select id="family-anchor" {...form.register('anchorRelationship')}>
                  {relationshipOptions(locale)}
                </Select>
              </Field>
            ) : null}
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
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={add.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="add-family-form" loading={add.isPending}>
            {t('people.addFamily')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Puts the person into an existing household, moving them out of their current one. */
export function JoinHouseholdDialog({
  churchId,
  profile,
  open,
  onOpenChange,
}: DialogProps & { churchId: string; profile: PersonProfile }) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<HouseholdRelationship>('other');
  const households = useQuery({
    ...householdsQuery(churchId, { q: search || undefined, limit: 20 }),
    enabled: open,
  });
  const add = useAddHouseholdMember(churchId, householdId ?? '');
  const run = useMutationToast(add, {
    success: (data) =>
      data.movedFrom
        ? t('people.movedHousehold', { from: data.movedFrom.name, to: data.household.name })
        : t('people.joinedHousehold', { household: data.household.name }),
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !run.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {profile.household ? t('people.moveHousehold') : t('people.joinHousehold')}
          </DialogTitle>
          <DialogDescription>
            {profile.household
              ? t('people.moveHouseholdHint', { household: profile.household.name })
              : t('people.joinHouseholdHint')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field label={t('people.household')} htmlFor="join-household">
            <Combobox
              id="join-household"
              value={householdId}
              onChange={setHouseholdId}
              onSearchChange={setSearch}
              loading={households.isFetching}
              options={(households.data?.items ?? [])
                .filter((household) => household.id !== profile.household?.id)
                .map((household) => ({
                  value: household.id,
                  label: household.name,
                  description:
                    household.members.map((member) => member.firstName).join(', ') || undefined,
                }))}
              placeholder={t('people.chooseHousehold')}
            />
          </Field>
          <Field label={t('people.relationship')} htmlFor="join-relationship">
            <Select
              id="join-relationship"
              value={relationship}
              onChange={(event) => setRelationship(event.target.value as HouseholdRelationship)}
            >
              {relationshipOptions(locale)}
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={run.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!householdId}
            loading={run.isPending}
            onClick={async () => {
              if (
                await run.run({
                  personId: profile.person.id,
                  relationship,
                  isPrimaryContact: false,
                })
              ) {
                setHouseholdId(null);
                onOpenChange(false);
              }
            }}
          >
            {profile.household ? t('people.moveHousehold') : t('people.joinHousehold')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignAreaDialog({
  churchId,
  profile,
  open,
  onOpenChange,
}: DialogProps & { churchId: string; profile: PersonProfile }) {
  const { t } = useI18n();
  const areas = useQuery({ ...areasQuery(churchId), enabled: open });
  const assign = useAssignPersonArea(churchId, profile.person.id);
  const run = useMutationToast(assign, { success: t('people.areaSaved') });
  const [value, setValue] = useState(
    profile.areaSource === 'person' ? (profile.area?.id ?? '') : '',
  );
  const householdArea = profile.household?.area;
  return (
    <Dialog open={open} onOpenChange={(next) => !run.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('people.assignArea')}</DialogTitle>
          <DialogDescription>{t('people.assignAreaHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label={t('people.area')} htmlFor="person-area">
            <Select
              id="person-area"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            >
              <option value="">
                {householdArea
                  ? t('people.followHouseholdArea', { area: householdArea.name })
                  : t('people.noArea')}
              </option>
              {(areas.data?.items ?? []).map((area) => (
                <option key={area.id} value={area.id}>
                  {area.code ? `${area.code} · ${area.name}` : area.name}
                </option>
              ))}
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={run.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={run.isPending}
            onClick={async () => {
              if (await run.run({ areaId: value || null })) onOpenChange(false);
            }}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
