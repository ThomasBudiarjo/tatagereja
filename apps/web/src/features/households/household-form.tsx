import {
  fullName,
  householdCreateSchema,
  type Household,
  type HouseholdCreateInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
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
import { Select } from '@/components/ui/select';
import {
  areasQuery,
  peopleListQuery,
  useCreateHousehold,
  useUpdateHousehold,
} from '@/features/people/api';
import { getErrorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useI18n } from '@/lib/i18n';

type FormInput = z.input<typeof householdCreateSchema>;
const FIELDS = ['name', 'areaId', 'address', 'city', 'postalCode', 'phone', 'notes', 'members'];

/**
 * Create or edit a household. A new household can start with its head (kepala keluarga): an
 * existing person who moves in from their current household if they have one.
 */
export function HouseholdFormDialog({
  household,
  open,
  onOpenChange,
  onSaved,
}: {
  household?: Household;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (household: Household) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const create = useCreateHousehold(churchId);
  const update = useUpdateHousehold(churchId, household?.id ?? '');
  const pending = create.isPending || update.isPending;
  const areas = useQuery({ ...areasQuery(churchId), enabled: open });
  const [search, setSearch] = useState('');
  // Keeps the chosen head visible while the search shows other people.
  const [headOption, setHeadOption] = useState<{ value: string; label: string } | null>(null);
  const people = useQuery({
    ...peopleListQuery(churchId, { q: search || undefined, limit: 20 }),
    enabled: open && !household,
  });
  const form = useForm<FormInput, unknown, HouseholdCreateInput>({
    resolver: zodResolver(householdCreateSchema),
    defaultValues: {
      name: household?.name ?? '',
      areaId: household?.areaId ?? null,
      address: household?.address ?? '',
      city: household?.city ?? '',
      postalCode: household?.postalCode ?? '',
      phone: household?.phone ?? '',
      notes: household?.notes ?? '',
      members: [],
    },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    if (pending) return;
    try {
      const { members, ...input } = values;
      const result = household
        ? await update.mutateAsync(input)
        : await create.mutateAsync({ ...input, members });
      toast.success(
        household
          ? t('people.householdSaved')
          : t('people.householdCreated', { name: result.household.name }),
      );
      onOpenChange(false);
      form.reset();
      onSaved?.(result.household);
    } catch (error) {
      if (applyServerErrors(error, form.setError, FIELDS)) toast.error(t('common.fixErrors'));
      else toast.error(getErrorMessage(error));
    }
  });
  const members = useWatch({ control: form.control, name: 'members' });
  const head = members?.[0]?.personId ?? null;
  const listed = (people.data?.items ?? []).map((person) => ({
    value: person.id,
    label: fullName(person),
    description: person.householdName
      ? t('people.movesFrom', { household: person.householdName })
      : undefined,
  }));
  const peopleOptions =
    headOption && !listed.some((option) => option.value === headOption.value)
      ? [headOption, ...listed]
      : listed;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {household ? t('people.editHousehold') : t('people.newHousehold')}
          </DialogTitle>
          <DialogDescription>{t('people.householdFormHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="household-form"
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <Field
              label={t('people.householdName')}
              htmlFor="household-name"
              error={errors.name?.message}
              required
            >
              <Input
                id="household-name"
                autoFocus
                placeholder={t('people.householdNamePlaceholder')}
                {...form.register('name')}
                aria-invalid={!!errors.name}
              />
            </Field>
            {!household ? (
              <Field
                label={t('people.headOfHousehold')}
                htmlFor="household-head"
                description={t('people.headOfHouseholdHint')}
              >
                <Combobox
                  id="household-head"
                  value={head}
                  onChange={(personId) => {
                    form.setValue(
                      'members',
                      personId ? [{ personId, relationship: 'head', isPrimaryContact: true }] : [],
                      { shouldDirty: true },
                    );
                    const person = people.data?.items.find((item) => item.id === personId);
                    setHeadOption(person ? { value: person.id, label: fullName(person) } : null);
                    if (person && !form.getValues('name')) {
                      form.setValue('name', `Keluarga ${person.lastName ?? person.firstName}`, {
                        shouldDirty: true,
                      });
                    }
                  }}
                  onSearchChange={setSearch}
                  loading={people.isFetching}
                  options={peopleOptions}
                  placeholder={t('people.choosePerson')}
                  clearable
                />
              </Field>
            ) : null}
            <Field label={t('people.area')} htmlFor="household-area" error={errors.areaId?.message}>
              <Controller
                control={form.control}
                name="areaId"
                render={({ field }) => (
                  <Select
                    id="household-area"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value || null)}
                  >
                    <option value="">{t('people.noArea')}</option>
                    {(areas.data?.items ?? []).map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.code ? `${area.code} · ${area.name}` : area.name}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </Field>
            <Field
              label={t('people.address')}
              htmlFor="household-address"
              error={errors.address?.message}
            >
              <Textarea id="household-address" rows={2} {...form.register('address')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('people.city')} htmlFor="household-city" className="sm:col-span-2">
                <Input id="household-city" {...form.register('city')} />
              </Field>
              <Field
                label={t('people.postalCode')}
                htmlFor="household-postal"
                error={errors.postalCode?.message}
              >
                <Input id="household-postal" inputMode="numeric" {...form.register('postalCode')} />
              </Field>
            </div>
            <Field
              label={t('people.householdPhone')}
              htmlFor="household-phone"
              error={errors.phone?.message}
            >
              <Input id="household-phone" type="tel" inputMode="tel" {...form.register('phone')} />
            </Field>
            <Field
              label={t('people.notes')}
              htmlFor="household-notes"
              description={t('people.householdNotesHint')}
            >
              <Textarea id="household-notes" rows={2} {...form.register('notes')} />
            </Field>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="household-form" loading={pending}>
            {household ? t('common.saveChanges') : t('people.newHousehold')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
