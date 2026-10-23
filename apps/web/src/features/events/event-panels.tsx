import {
  EVENT_REGISTRATION_STATUS_LABELS,
  fullName,
  localize,
  type EventFullDetail,
  type EventRegistration,
  type MyEventRegistration,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  CircleCheck,
  CircleX,
  Hourglass,
  Minus,
  Plus,
  Ticket,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert, Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PersonPickerDialog } from '@/features/people/person-picker';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import {
  registrationsQuery,
  useAddParticipants,
  useCancelRegistration,
  useCheckIn,
  useRegister,
  useRemoveParticipant,
  useRsvp,
} from './api';
import { CapacityMeter } from './event-ui';

const STATUS_TONES = {
  registered: 'success',
  waitlisted: 'warning',
  cancelled: 'neutral',
} as const;

/** Registration for the caller and their household, with the capacity and waitlist. */
export function RegistrationCard({ detail }: { detail: EventFullDetail }) {
  const { t, locale, formatDateTime } = useI18n();
  const { churchId } = useChurch();
  const { event, registrablePeople, householdRegistrations, registrationOpen, canManage } = detail;
  const [registerOpen, setRegisterOpen] = useState(false);
  const [cancelling, setCancelling] = useState<MyEventRegistration | null>(null);
  const cancel = useMutationToast(useCancelRegistration(churchId, event.id), {
    success: t('events.registrationCancelled'),
  });
  const registeredIds = householdRegistrations.map((registration) => registration.personId);
  const available = registrablePeople.filter((person) => !registeredIds.includes(person.id));
  const nameOf = (personId: string) => {
    const person = registrablePeople.find((item) => item.id === personId);
    return person ? fullName(person) : '';
  };
  const full = event.capacity !== null && (event.placesLeft ?? 0) === 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span
            data-tone="sky"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tone-soft text-tone-ink"
          >
            <Ticket className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t('events.registrationTitle')}</h2>
            <p className="text-sm text-muted-foreground">
              {!registrationOpen
                ? event.cancelledAt
                  ? t('events.registrationCancelledEvent')
                  : t('events.registrationClosed')
                : full && event.waitlistEnabled
                  ? t('events.fullJoinWaitlist')
                  : event.registrationClosesAt
                    ? t('events.registrationUntil', {
                        when: formatDateTime(event.registrationClosesAt),
                      })
                    : t('events.registrationOpenHint')}
            </p>
          </div>
        </div>
        <CapacityMeter event={event} />
        {householdRegistrations.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {householdRegistrations.map((registration) => (
              <li
                key={registration.id}
                className="flex min-h-14 items-center gap-3 rounded-lg border bg-sunken/40 px-3 py-2"
              >
                <EntityAvatar name={nameOf(registration.personId)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{nameOf(registration.personId)}</p>
                  <p className="text-xs text-muted-foreground">
                    {registration.status === 'waitlisted'
                      ? t('events.waitlistNumber', { position: registration.waitlistPosition ?? 0 })
                      : registration.checkedInAt
                        ? t('events.checkedIn')
                        : t('events.partyOf', { count: registration.partySize })}
                  </p>
                </div>
                <StatusBadge tone={STATUS_TONES[registration.status]} size="sm">
                  {localize(EVENT_REGISTRATION_STATUS_LABELS[registration.status], locale)}
                </StatusBadge>
                {!registration.checkedInAt && !event.cancelledAt ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                    aria-label={t('events.cancelRegistration')}
                    onClick={() => setCancelling(registration)}
                  >
                    <X />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {registrationOpen && available.length > 0 ? (
          <Button onClick={() => setRegisterOpen(true)} className="w-full sm:w-fit">
            {full && event.waitlistEnabled ? <Hourglass /> : <CalendarCheck />}
            {householdRegistrations.length > 0
              ? t('events.registerSomeoneElse')
              : full && event.waitlistEnabled
                ? t('events.joinWaitlist')
                : t('events.register')}
          </Button>
        ) : registrationOpen && registrablePeople.length === 0 && !canManage ? (
          <Alert variant="info">{t('events.notLinked')}</Alert>
        ) : null}
      </CardContent>
      <RegisterSheet
        detail={detail}
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        people={available}
      />
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => (!open ? setCancelling(null) : undefined)}
        title={t('events.cancelRegistrationTitle')}
        description={
          cancelling?.status === 'registered'
            ? t('events.cancelRegistrationBody')
            : t('events.leaveWaitlistBody')
        }
        confirmLabel={t('events.cancelRegistration')}
        cancelLabel={t('events.keepRegistration')}
        loading={cancel.isPending}
        onConfirm={async () => {
          if (!cancelling) return;
          if (await cancel.run(cancelling.id)) setCancelling(null);
        }}
      />
    </Card>
  );
}

function RegisterSheet({
  detail,
  open,
  onOpenChange,
  people,
}: {
  detail: EventFullDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: EventFullDetail['registrablePeople'];
}) {
  const { t, formatNumber } = useI18n();
  const { churchId } = useChurch();
  const { event } = detail;
  const [personId, setPersonId] = useState('');
  const [partySize, setPartySize] = useState(1);
  const [note, setNote] = useState('');
  const register = useMutationToast(useRegister(churchId, event.id), {
    success: (result) =>
      result.registration.status === 'registered'
        ? t('events.registeredToast')
        : t('events.waitlistedToast', { position: result.registration.waitlistPosition ?? 0 }),
  });
  const chosen = personId || people[0]?.id || '';
  const fits = event.placesLeft === null || partySize <= event.placesLeft;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => (!register.isPending ? onOpenChange(next) : undefined)}
    >
      <SheetContent>
        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={async (formEvent) => {
            formEvent.preventDefault();
            const result = await register.run({ personId: chosen, partySize, note: note || null });
            if (result) {
              onOpenChange(false);
              setPartySize(1);
              setNote('');
              setPersonId('');
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>{t('events.registerTitle')}</SheetTitle>
            <SheetDescription>{event.title}</SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4">
            {people.length > 1 ? (
              <Field label={t('events.registerWho')} htmlFor="register-person">
                <Select
                  id="register-person"
                  value={chosen}
                  onChange={(input) => setPersonId(input.target.value)}
                >
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {fullName(person)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : people[0] ? (
              <div className="flex items-center gap-3 rounded-lg border bg-sunken/40 p-3">
                <EntityAvatar name={fullName(people[0])} src={people[0].photoUrl} size="sm" />
                <span className="text-sm font-medium">{fullName(people[0])}</span>
              </div>
            ) : null}
            <Field label={t('events.partySize')} description={t('events.partySizeHint')}>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label={t('events.fewer')}
                  disabled={partySize <= 1}
                  onClick={() => setPartySize((value) => Math.max(1, value - 1))}
                >
                  <Minus />
                </Button>
                <span className="w-10 text-center text-xl font-bold tabular" aria-live="polite">
                  {formatNumber(partySize)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label={t('events.more')}
                  disabled={partySize >= 20}
                  onClick={() => setPartySize((value) => Math.min(20, value + 1))}
                >
                  <Plus />
                </Button>
              </div>
            </Field>
            <Field
              label={t('events.registerNote')}
              htmlFor="register-note"
              description={t('events.registerNoteHint')}
            >
              <Input
                id="register-note"
                value={note}
                maxLength={200}
                onChange={(input) => setNote(input.target.value)}
              />
            </Field>
            {!fits && event.waitlistEnabled ? (
              <Alert variant="warning">{t('events.willWaitlist')}</Alert>
            ) : !fits ? (
              <Alert variant="error">{t('events.notEnoughPlaces')}</Alert>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={register.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              loading={register.isPending}
              disabled={!chosen || (!fits && !event.waitlistEnabled)}
            >
              {!fits ? t('events.joinWaitlist') : t('events.register')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Going or not, for events without registration. Saved at once. */
export function RsvpCard({ detail }: { detail: EventFullDetail }) {
  const { t, formatNumber } = useI18n();
  const { churchId, access } = useChurch();
  const rsvp = useRsvp(churchId, detail.event.id);
  if (!access.personId || detail.event.cancelledAt) return null;
  const value =
    detail.event.myRsvp === 'going' || detail.event.myRsvp === 'not_going'
      ? detail.event.myRsvp
      : '';
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('events.rsvpTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {detail.event.goingCount > 0
              ? t('events.goingCount', {
                  count: detail.event.goingCount,
                  value: formatNumber(detail.event.goingCount),
                })
              : t('events.rsvpHint')}
          </p>
        </div>
        <Segmented
          aria-label={t('events.rsvpTitle')}
          className="sm:w-72"
          value={value as 'going' | 'not_going'}
          onChange={(status) =>
            rsvp.mutate(
              { personId: access.personId as string, status },
              {
                onSuccess: () =>
                  toast.success(
                    status === 'going' ? t('events.rsvpGoing') : t('events.rsvpNotGoing'),
                  ),
                onError: (error) => toast.error(getErrorMessage(error)),
              },
            )
          }
          options={[
            { value: 'going', label: t('events.going'), icon: CircleCheck },
            { value: 'not_going', label: t('events.notGoing'), icon: CircleX },
          ]}
        />
      </CardContent>
    </Card>
  );
}

/** "I am here": self check-in while it is open. */
export function SelfCheckInCard({ detail }: { detail: EventFullDetail }) {
  const { t } = useI18n();
  const { churchId, access } = useChurch();
  const checkIn = useCheckIn(churchId, detail.event.id);
  const mine = detail.householdRegistrations.find(
    (registration) => registration.personId === access.personId,
  );
  const [done, setDone] = useState(false);
  if (!detail.selfCheckInOpen || !access.personId) return null;
  if (detail.event.registrationRequired && mine?.status !== 'registered') return null;
  const checkedIn = done || !!mine?.checkedInAt || !!detail.event.myRegistration?.checkedInAt;
  return (
    <div
      data-tone={checkedIn ? 'success' : 'sky'}
      className="flex animate-rise-in flex-col items-center gap-3 rounded-2xl border border-tone/30 bg-tone-soft/60 p-5 text-center sm:flex-row sm:text-left"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-tone text-tone-foreground">
        <CalendarCheck className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-tone-ink">
          {checkedIn ? t('events.selfCheckedIn') : t('events.selfCheckInTitle')}
        </p>
        <p className="text-sm text-muted-foreground">
          {checkedIn ? t('events.selfCheckedInHint') : t('events.selfCheckInHint')}
        </p>
      </div>
      {!checkedIn ? (
        <Button
          size="lg"
          loading={checkIn.isPending}
          onClick={() =>
            checkIn.mutate(
              { personIds: [access.personId as string], self: true },
              {
                onSuccess: () => {
                  setDone(true);
                  toast.success(t('events.selfCheckedIn'));
                },
                onError: (error) => toast.error(getErrorMessage(error)),
              },
            )
          }
        >
          {t('events.imHere')}
        </Button>
      ) : null}
    </div>
  );
}

/** Organisers: registrations (with waitlist places) and invited participants. */
export function OrganiserPanel({ detail }: { detail: EventFullDetail }) {
  const { t, formatNumber } = useI18n();
  const { churchId } = useChurch();
  const { event, participants } = detail;
  const registrations = useQuery({
    ...registrationsQuery(churchId, event.id),
    enabled: event.registrationRequired,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [cancelling, setCancelling] = useState<EventRegistration | null>(null);
  const add = useMutationToast(useAddParticipants(churchId, event.id), {
    success: (_result, personIds) => t('events.invitedToast', { count: personIds.length }),
  });
  const remove = useMutationToast(useRemoveParticipant(churchId, event.id), {
    success: t('events.removedToast'),
  });
  const register = useMutationToast(useRegister(churchId, event.id), {
    success: (result) =>
      result.registration.status === 'registered'
        ? t('events.registeredOtherToast')
        : t('events.waitlistedOtherToast'),
  });
  const cancel = useMutationToast(useCancelRegistration(churchId, event.id), {
    success: t('events.registrationCancelled'),
  });
  const active = (registrations.data?.items ?? []).filter((item) => item.status !== 'cancelled');
  const registered = active.filter((item) => item.status === 'registered');
  const waitlisted = active.filter((item) => item.status === 'waitlisted');

  const registrationRows = (items: EventRegistration[]) =>
    items.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted-foreground">{t('events.nobodyYet')}</p>
    ) : (
      <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card">
        {items.map((item) => (
          <li key={item.id} className="flex min-h-14 items-center gap-3 px-3.5 py-2">
            {item.waitlistPosition ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular">
                {item.waitlistPosition}
              </span>
            ) : (
              <EntityAvatar name={fullName(item.person)} src={item.person.photoUrl} size="sm" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{fullName(item.person)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t('events.partyOf', { count: item.partySize })}
                {item.note ? ` · ${item.note}` : ''}
              </p>
            </div>
            {item.checkedInAt ? (
              <StatusBadge tone="success" icon={CalendarCheck} size="sm">
                {t('events.checkedIn')}
              </StatusBadge>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                aria-label={t('events.cancelFor', { name: fullName(item.person) })}
                onClick={() => setCancelling(item)}
              >
                <X />
              </Button>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <Section
      title={t('events.organiserTitle')}
      icon={Users}
      action={
        event.registrationRequired ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRegisterOpen(true)}
            disabled={!!event.cancelledAt}
          >
            <UserPlus />
            {t('events.registerPerson')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            <UserPlus />
            {t('events.invite')}
          </Button>
        )
      }
    >
      {event.registrationRequired ? (
        registrations.isPending ? (
          <SkeletonList rows={3} />
        ) : registrations.isError ? (
          <ErrorState
            compact
            error={registrations.error}
            message={getErrorMessage(registrations.error)}
            onRetry={() => void registrations.refetch()}
          />
        ) : (
          <Tabs defaultValue="registered">
            <TabsList>
              <TabsTrigger value="registered">
                {t('events.tabRegistered')} ({formatNumber(registered.length)})
              </TabsTrigger>
              <TabsTrigger value="waitlist">
                {t('events.tabWaitlist')} ({formatNumber(waitlisted.length)})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="registered">{registrationRows(registered)}</TabsContent>
            <TabsContent value="waitlist">{registrationRows(waitlisted)}</TabsContent>
          </Tabs>
        )
      ) : participants.length === 0 ? (
        <EmptyState
          compact
          icon={Users}
          tone="sky"
          title={t('events.noParticipants')}
          description={t('events.noParticipantsHint')}
        />
      ) : (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card">
          {participants.map((participant) => (
            <li key={participant.id} className="flex min-h-14 items-center gap-3 px-3.5 py-2">
              <EntityAvatar name={fullName(participant)} src={participant.photoUrl} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {fullName(participant)}
              </span>
              <StatusBadge
                tone={
                  participant.status === 'going'
                    ? 'success'
                    : participant.status === 'not_going'
                      ? 'danger'
                      : 'neutral'
                }
                size="sm"
              >
                {participant.status === 'going'
                  ? t('events.going')
                  : participant.status === 'not_going'
                    ? t('events.notGoing')
                    : t('events.invited')}
              </StatusBadge>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                aria-label={t('events.removeParticipant', { name: fullName(participant) })}
                onClick={() => void remove.run(participant.id)}
                disabled={remove.isPending}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <PersonPickerDialog
        churchId={churchId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={t('events.invite')}
        excludeIds={participants.map((participant) => participant.id)}
        loading={add.isPending}
        onConfirm={async (personIds) => {
          if (await add.run(personIds)) setPickerOpen(false);
        }}
      />
      <PersonPickerDialog
        churchId={churchId}
        single
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        title={t('events.registerPerson')}
        excludeIds={active.map((item) => item.person.id)}
        confirmLabel={t('events.register')}
        loading={register.isPending}
        onConfirm={async ([personId]) => {
          if (personId && (await register.run({ personId, partySize: 1 }))) setRegisterOpen(false);
        }}
      />
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => (!open ? setCancelling(null) : undefined)}
        title={t('events.cancelForTitle', { name: cancelling ? fullName(cancelling.person) : '' })}
        description={
          cancelling?.status === 'registered'
            ? t('events.cancelOtherBody')
            : t('events.leaveWaitlistBody')
        }
        confirmLabel={t('events.cancelRegistration')}
        cancelLabel={t('events.keepRegistration')}
        loading={cancel.isPending}
        onConfirm={async () => {
          if (cancelling && (await cancel.run(cancelling.id))) setCancelling(null);
        }}
      />
    </Section>
  );
}
