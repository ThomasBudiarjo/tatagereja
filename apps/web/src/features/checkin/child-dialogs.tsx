import {
  ALERT_SEVERITIES,
  ALERT_SEVERITY_LABELS,
  CHILD_ALERT_KINDS,
  CHILD_ALERT_KIND_LABELS,
  authorizedPickupInputSchema,
  childAlertInputSchema,
  localize,
  newCheckinChildInputSchema,
  type AuthorizedPickup,
  type CheckinChildListItem,
  type CheckinClass,
  type ChildAlert,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
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
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { useRegisterChild, useSaveAlert, useSavePickup } from './api';
import { ALERT_KIND_ICONS, SEVERITY_TONES } from './checkin-lib';
import { PersonSelect } from './checkin-ui';

type AlertForm = z.input<typeof childAlertInputSchema>;

/** An allergy, medical or custody alert for one child. */
export function ChildAlertDialog({
  personId,
  childName,
  alert,
  open,
  onOpenChange,
}: {
  personId: string;
  childName: string;
  alert?: ChildAlert;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t, locale } = useI18n();
  const form = useForm<AlertForm, unknown, z.output<typeof childAlertInputSchema>>({
    resolver: zodResolver(childAlertInputSchema),
    values: {
      kind: alert?.kind ?? 'allergy',
      severity: alert?.severity ?? 'warning',
      description: alert?.description ?? '',
      isActive: alert?.isActive ?? true,
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useSaveAlert(churchId, personId, alert?.id), {
    success: t('checkin.alertSaved', { name: childName }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (result) onOpenChange(false);
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 flex-col gap-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{alert ? t('checkin.editAlert') : t('checkin.addAlert')}</DialogTitle>
            <DialogDescription>{t('checkin.alertHint', { name: childName })}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium">{t('checkin.alertKind')}</legend>
                  <div role="radiogroup" className="grid grid-cols-2 gap-2">
                    {CHILD_ALERT_KINDS.map((kind) => {
                      const Icon = ALERT_KIND_ICONS[kind];
                      const selected = field.value === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => field.onChange(kind)}
                          className={cn(
                            'flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                            selected
                              ? 'border-primary/60 bg-primary/[0.06] text-foreground'
                              : 'border-border/70 text-muted-foreground hover:bg-muted/60',
                          )}
                        >
                          <Icon className="size-4" aria-hidden />
                          {localize(CHILD_ALERT_KIND_LABELS[kind], locale)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            />
            <Controller
              control={form.control}
              name="severity"
              render={({ field }) => (
                <div className="flex flex-col gap-2">
                  <Label>{t('checkin.alertSeverity')}</Label>
                  <Segmented
                    aria-label={t('checkin.alertSeverity')}
                    value={field.value ?? 'warning'}
                    onChange={field.onChange}
                    options={ALERT_SEVERITIES.map((severity) => ({
                      value: severity,
                      label: localize(ALERT_SEVERITY_LABELS[severity], locale),
                    }))}
                  />
                  <p
                    data-tone={SEVERITY_TONES[field.value ?? 'warning']}
                    className="text-xs text-tone-ink"
                  >
                    {t(
                      field.value === 'critical'
                        ? 'checkin.severityCriticalHint'
                        : field.value === 'info'
                          ? 'checkin.severityInfoHint'
                          : 'checkin.severityWarningHint',
                    )}
                  </p>
                </div>
              )}
            />
            <Field
              label={t('checkin.alertDescription')}
              htmlFor="alert-description"
              error={errors.description?.message}
              required
            >
              <Textarea
                id="alert-description"
                autoFocus
                rows={3}
                placeholder={t('checkin.alertDescriptionPlaceholder')}
                aria-invalid={!!errors.description}
                {...form.register('description')}
              />
            </Field>
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3.5">
                  <div>
                    <Label htmlFor="alert-active">{t('checkin.alertActive')}</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('checkin.alertActiveHint')}
                    </p>
                  </div>
                  <Switch
                    id="alert-active"
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {alert ? t('common.saveChanges') : t('checkin.addAlert')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type PickupForm = z.input<typeof authorizedPickupInputSchema>;

/** Someone allowed to collect the child: a person in the directory, or a name and phone. */
export function PickupDialog({
  personId,
  childName,
  pickup,
  open,
  onOpenChange,
}: {
  personId: string;
  childName: string;
  pickup?: AuthorizedPickup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const form = useForm<PickupForm, unknown, z.output<typeof authorizedPickupInputSchema>>({
    resolver: zodResolver(authorizedPickupInputSchema),
    values: {
      pickupPersonId: pickup?.pickupPersonId ?? null,
      name: pickup?.name ?? '',
      relationship: pickup?.relationship ?? '',
      phone: pickup?.phone ?? '',
      notes: pickup?.notes ?? '',
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useSavePickup(churchId, personId, pickup?.id), {
    success: (result) => t('checkin.pickupSaved', { name: result.pickup.name, child: childName }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (result) onOpenChange(false);
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 flex-col gap-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{pickup ? t('checkin.editPickup') : t('checkin.addPickup')}</DialogTitle>
            <DialogDescription>{t('checkin.pickupHint', { name: childName })}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Controller
              control={form.control}
              name="pickupPersonId"
              render={({ field }) => (
                <Field
                  label={t('checkin.pickupPerson')}
                  htmlFor="pickup-person"
                  description={t('checkin.pickupPersonHint')}
                >
                  <PersonSelect
                    id="pickup-person"
                    value={field.value ?? null}
                    excludeIds={[personId]}
                    initial={
                      pickup?.pickupPersonId
                        ? {
                            id: pickup.pickupPersonId,
                            firstName: pickup.name,
                            lastName: null,
                            photoUrl: null,
                            membershipStatus: 'member',
                          }
                        : null
                    }
                    onChange={(id, person) => {
                      field.onChange(id);
                      if (person && !form.getValues('name')) {
                        form.setValue(
                          'name',
                          [person.firstName, person.lastName].filter(Boolean).join(' '),
                        );
                      }
                    }}
                  />
                </Field>
              )}
            />
            <Field
              label={t('checkin.pickupName')}
              htmlFor="pickup-name"
              error={errors.name?.message}
            >
              <Input
                id="pickup-name"
                placeholder={t('checkin.pickupNamePlaceholder')}
                aria-invalid={!!errors.name}
                {...form.register('name')}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('checkin.relationship')}
                htmlFor="pickup-relationship"
                error={errors.relationship?.message}
              >
                <Input
                  id="pickup-relationship"
                  placeholder={t('checkin.relationshipPlaceholder')}
                  list="pickup-relationships"
                  {...form.register('relationship')}
                />
                <datalist id="pickup-relationships">
                  {(
                    [
                      'relOpung',
                      'relGrandparent',
                      'relUncle',
                      'relAunt',
                      'relSibling',
                      'relDriver',
                      'relHelper',
                    ] as const
                  ).map((key) => (
                    <option key={key} value={t(`checkin.${key}`)} />
                  ))}
                </datalist>
              </Field>
              <Field
                label={t('checkin.phone')}
                htmlFor="pickup-phone"
                error={errors.phone?.message}
              >
                <Input
                  id="pickup-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  {...form.register('phone')}
                />
              </Field>
            </div>
            <Field label={t('checkin.notes')} htmlFor="pickup-notes" error={errors.notes?.message}>
              <Textarea
                id="pickup-notes"
                rows={2}
                placeholder={t('checkin.pickupNotesPlaceholder')}
                {...form.register('notes')}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {pickup ? t('common.saveChanges') : t('checkin.addPickup')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ChildForm = z.input<typeof newCheckinChildInputSchema>;

/** A first-time visitor child registered at the door, with who brought them. */
export function NewChildDialog({
  classes,
  open,
  onOpenChange,
  onCreated,
}: {
  classes: readonly CheckinClass[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (child: CheckinChildListItem) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const form = useForm<ChildForm, unknown, z.output<typeof newCheckinChildInputSchema>>({
    resolver: zodResolver(newCheckinChildInputSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      gender: 'unspecified',
      birthDate: '',
      defaultClassId: null,
      guardianName: '',
      guardianPhone: '',
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useRegisterChild(churchId), {
    success: (result) => t('checkin.childRegistered', { name: result.child.firstName }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (!result) return;
    form.reset();
    onOpenChange(false);
    onCreated?.(result.child);
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 flex-col gap-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{t('checkin.newChild')}</DialogTitle>
            <DialogDescription>{t('checkin.newChildHint')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('checkin.firstName')}
                htmlFor="child-first"
                error={errors.firstName?.message}
                required
              >
                <Input
                  id="child-first"
                  autoFocus
                  autoComplete="off"
                  aria-invalid={!!errors.firstName}
                  {...form.register('firstName')}
                />
              </Field>
              <Field
                label={t('checkin.lastName')}
                htmlFor="child-last"
                error={errors.lastName?.message}
              >
                <Input id="child-last" autoComplete="off" {...form.register('lastName')} />
              </Field>
              <Field
                label={t('checkin.birthDate')}
                htmlFor="child-birth"
                error={errors.birthDate?.message}
                description={t('checkin.birthDateHint')}
              >
                <Input
                  id="child-birth"
                  type="date"
                  aria-invalid={!!errors.birthDate}
                  {...form.register('birthDate')}
                />
              </Field>
              <Field label={t('checkin.gender')} htmlFor="child-gender">
                <Select id="child-gender" {...form.register('gender')}>
                  <option value="unspecified">{t('checkin.genderUnspecified')}</option>
                  <option value="male">{t('checkin.genderMale')}</option>
                  <option value="female">{t('checkin.genderFemale')}</option>
                </Select>
              </Field>
            </div>
            <Field
              label={t('checkin.usualClass')}
              htmlFor="child-class"
              description={t('checkin.usualClassHint')}
            >
              <Select
                id="child-class"
                {...form.register('defaultClassId', {
                  setValueAs: (value: unknown) => (value ? String(value) : null),
                })}
              >
                <option value="">{t('checkin.classByAge')}</option>
                {classes
                  .filter((item) => item.isActive)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="grid gap-3 rounded-xl border border-border/70 bg-sunken/50 p-3.5 sm:grid-cols-2">
              <p className="text-sm font-medium sm:col-span-2">{t('checkin.broughtByTitle')}</p>
              <Field
                label={t('checkin.guardianName')}
                htmlFor="child-guardian"
                error={errors.guardianName?.message}
              >
                <Input id="child-guardian" autoComplete="off" {...form.register('guardianName')} />
              </Field>
              <Field
                label={t('checkin.phone')}
                htmlFor="child-guardian-phone"
                error={errors.guardianPhone?.message}
              >
                <Input
                  id="child-guardian-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  {...form.register('guardianPhone')}
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('checkin.registerChild')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
