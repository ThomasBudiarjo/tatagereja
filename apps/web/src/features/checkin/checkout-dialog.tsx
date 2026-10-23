import {
  checkOutBodySchema,
  fullName,
  overrideCheckOutBodySchema,
  type CheckinDetail,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, LogOut, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { EntityAvatar } from '@/components/ui/avatar';
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
import { Alert, Segmented } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { checkinQuery, useCheckOut, useOverrideCheckOut } from './api';
import { AlertCallout, ChildAvatar } from './checkin-ui';

type Pickup = { key: string; personId: string | null; name: string; detail: string | null };

/** Everyone allowed to collect the child: the guardians first, then the pick-up list. */
function pickupOptions(detail: CheckinDetail, guardianLabel: string): Pickup[] {
  const options: Pickup[] = detail.guardians.map((person) => ({
    key: `person:${person.id}`,
    personId: person.id,
    name: fullName(person),
    detail: guardianLabel,
  }));
  const brought = detail.checkin.guardian;
  if (brought && !options.some((option) => option.personId === brought.id)) {
    options.unshift({
      key: `person:${brought.id}`,
      personId: brought.id,
      name: fullName(brought),
      detail: guardianLabel,
    });
  }
  for (const pickup of detail.pickups) {
    if (
      pickup.pickupPersonId &&
      options.some((option) => option.personId === pickup.pickupPersonId)
    )
      continue;
    options.push({
      key: pickup.pickupPersonId ? `person:${pickup.pickupPersonId}` : `name:${pickup.id}`,
      personId: pickup.pickupPersonId,
      name: pickup.name,
      detail: [pickup.relationship, pickup.phone].filter(Boolean).join(' · ') || null,
    });
  }
  return options;
}

/**
 * Check-out at the classroom door: the volunteer matches the code on the guardian tag and
 * picks who collects the child from the people allowed to. Coordinators can check out
 * without the code, with a reason that is audited.
 */
export function CheckoutDialog({
  checkinId,
  open,
  onOpenChange,
}: {
  checkinId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const query = useQuery({
    ...checkinQuery(churchId, checkinId ?? ''),
    enabled: open && !!checkinId,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {query.isPending ? (
          <div className="flex flex-col gap-4" aria-busy>
            <DialogHeader>
              <DialogTitle>{t('checkin.checkOutTitle')}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-3">
              <Skeleton className="size-14 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
            <Skeleton className="h-12 w-full" />
          </div>
        ) : query.isError ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t('checkin.checkOutTitle')}</DialogTitle>
            </DialogHeader>
            <ErrorState
              compact
              error={query.error}
              message={getErrorMessage(query.error)}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          </div>
        ) : (
          <CheckoutForm
            key={query.data.checkin.id}
            detail={query.data}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Mode = 'code' | 'override';

function CheckoutForm({ detail, onDone }: { detail: CheckinDetail; onDone: () => void }) {
  const { churchId } = useChurch();
  const { t, formatTime } = useI18n();
  const { checkin } = detail;
  const name = fullName(checkin.child);
  const options = pickupOptions(detail, t('checkin.guardian'));
  const [mode, setMode] = useState<Mode>('code');
  const [pickupKey, setPickupKey] = useState<string>(options[0]?.key ?? '');
  const [otherName, setOtherName] = useState('');
  const chosen = options.find((option) => option.key === pickupKey) ?? null;
  const pickup = () =>
    pickupKey === 'other'
      ? { pickupPersonId: null, pickupName: otherName.trim() || null }
      : chosen
        ? { pickupPersonId: chosen.personId, pickupName: chosen.personId ? null : chosen.name }
        : { pickupPersonId: null, pickupName: null };

  const codeForm = useForm<
    z.input<typeof checkOutBodySchema>,
    unknown,
    z.output<typeof checkOutBodySchema>
  >({
    resolver: zodResolver(checkOutBodySchema),
    defaultValues: { securityCode: '', pickupPersonId: null, pickupName: null },
  });
  const overrideForm = useForm<
    z.input<typeof overrideCheckOutBodySchema>,
    unknown,
    z.output<typeof overrideCheckOutBodySchema>
  >({
    resolver: zodResolver(overrideCheckOutBodySchema),
    defaultValues: { reason: '', pickupPersonId: null, pickupName: null },
  });
  const success = (result: { checkin: { pickupName: string | null } }) =>
    result.checkin.pickupName
      ? t('checkin.pickedUpBy', { name, pickup: result.checkin.pickupName })
      : t('checkin.pickedUp', { name });
  const checkOut = useMutationToast(useCheckOut(churchId, checkin.id), {
    success,
    form: codeForm,
    fields: ['securityCode'],
  });
  const override = useMutationToast(useOverrideCheckOut(churchId, checkin.id), {
    success,
    form: overrideForm,
    fields: ['reason'],
  });

  const submitCode = codeForm.handleSubmit(async (values) => {
    const result = await checkOut.run({ ...values, ...pickup() });
    if (result) onDone();
  });
  const submitOverride = overrideForm.handleSubmit(async (values) => {
    const result = await override.run({ ...values, ...pickup() });
    if (result) onDone();
  });

  const pickedUp = checkin.status === 'checked_out';
  const codeError = codeForm.formState.errors.securityCode?.message;
  const reasonError = overrideForm.formState.errors.reason?.message;

  return (
    <form
      onSubmit={(event) => void (mode === 'code' ? submitCode(event) : submitOverride(event))}
      className="flex min-h-0 flex-col gap-4"
      noValidate
    >
      <DialogHeader>
        <DialogTitle>{t('checkin.checkOutTitle')}</DialogTitle>
        <DialogDescription>{t('checkin.checkOutDescription')}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-sunken/60 p-3">
          <ChildAvatar child={checkin.child} alerts={checkin.alerts} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold tracking-tight">{name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {checkin.className} ·{' '}
              {t('checkin.inSince', { time: formatTime(checkin.checkedInAt) })}
            </p>
            {checkin.guardian ? (
              <p className="truncate text-xs text-muted-foreground">
                {t('checkin.broughtBy', { name: fullName(checkin.guardian) })}
              </p>
            ) : null}
          </div>
        </div>

        <AlertCallout alerts={checkin.alerts} />

        {pickedUp ? (
          <Alert variant="success" title={t('checkin.alreadyPickedUp', { name })}>
            {checkin.pickupName
              ? t('checkin.pickedUpAt', {
                  name: checkin.pickupName,
                  time: formatTime(checkin.checkedOutAt),
                })
              : null}
          </Alert>
        ) : (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t('checkin.whoPicksUp')}</legend>
              {options.length === 0 && mode === 'code' ? (
                <p className="text-sm text-muted-foreground">{t('checkin.noPickupList')}</p>
              ) : null}
              <div role="radiogroup" className="flex flex-col gap-1.5">
                {options.map((option) => (
                  <PickupOption
                    key={option.key}
                    selected={pickupKey === option.key}
                    onSelect={() => setPickupKey(option.key)}
                    name={option.name}
                    detail={option.detail}
                  />
                ))}
                {mode === 'override' || options.length === 0 ? (
                  <PickupOption
                    selected={pickupKey === 'other'}
                    onSelect={() => setPickupKey('other')}
                    name={t('checkin.someoneElse')}
                    detail={null}
                  />
                ) : null}
              </div>
              {pickupKey === 'other' ? (
                <Input
                  aria-label={t('checkin.pickupNameLabel')}
                  placeholder={t('checkin.pickupNamePlaceholder')}
                  value={otherName}
                  onChange={(event) => setOtherName(event.target.value)}
                  maxLength={120}
                />
              ) : null}
            </fieldset>

            {detail.canOverride ? (
              <Segmented<Mode>
                aria-label={t('checkin.checkOutMode')}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'code', label: t('checkin.withCode'), icon: KeyRound },
                  { value: 'override', label: t('checkin.override'), icon: ShieldCheck },
                ]}
              />
            ) : null}

            {mode === 'code' ? (
              <Field
                label={t('checkin.codeLabel')}
                htmlFor="checkout-code"
                error={codeError}
                description={t('checkin.codeHint')}
                required
              >
                <Input
                  id="checkout-code"
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  enterKeyHint="done"
                  maxLength={8}
                  aria-invalid={!!codeError}
                  className="h-14 text-center font-mono text-2xl font-bold tracking-[0.4em] uppercase md:text-2xl"
                  {...codeForm.register('securityCode')}
                />
              </Field>
            ) : (
              <>
                <Alert variant="warning" title={t('checkin.overrideTitle')}>
                  {t('checkin.overrideBody')}
                </Alert>
                <Field
                  label={t('checkin.overrideReason')}
                  htmlFor="checkout-reason"
                  error={reasonError}
                  required
                >
                  <Textarea
                    id="checkout-reason"
                    autoFocus
                    rows={2}
                    placeholder={t('checkin.overrideReasonPlaceholder')}
                    aria-invalid={!!reasonError}
                    {...overrideForm.register('reason')}
                  />
                </Field>
              </>
            )}
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {pickedUp ? t('common.close') : t('common.cancel')}
        </Button>
        {pickedUp ? null : mode === 'code' ? (
          <Button type="submit" loading={checkOut.isPending}>
            <LogOut />
            {t('checkin.checkOut')}
          </Button>
        ) : (
          <Button type="submit" variant="destructive" loading={override.isPending}>
            <ShieldCheck />
            {t('checkin.overrideConfirm')}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}

function PickupOption({
  selected,
  onSelect,
  name,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  name: string;
  detail: string | null;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
        selected
          ? 'border-primary/60 bg-primary/[0.06]'
          : 'border-border/70 bg-card hover:bg-muted/60',
      )}
    >
      <EntityAvatar name={name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {detail ? (
          <span className="block truncate text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      {selected ? <UserRoundCheck className="size-4 text-primary" aria-hidden /> : null}
    </button>
  );
}
