import {
  FOLLOW_UP_STAGES,
  FOLLOW_UP_STAGE_LABELS,
  canAddVisitorPerson,
  has,
  localize,
  visitorFollowUpInputSchema,
  visitorFollowUpUpdateSchema,
  type FollowUpStage,
  type VisitorFollowUp,
  type VisitorFollowUpInput,
  type VisitorFollowUpUpdate,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRightLeft, MessageCircle, Phone } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useCreateFollowUp, useUpdateFollowUp } from './api';
import { MemberCombobox, PersonCombobox } from './components';
import { whatsappNumber } from './helpers';
import { useToday } from './helpers';

/** Call and WhatsApp buttons for a visitor with a phone number. */
export function ContactButtons({
  phone,
  size = 'sm',
}: {
  phone: string | null;
  size?: 'sm' | 'xs';
}) {
  const { t } = useI18n();
  if (!phone) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button asChild variant="outline" size={size}>
        <a
          href={`tel:${phone.replace(/[^\d+]/g, '')}`}
          aria-label={t('care.callPerson', { phone })}
        >
          <Phone />
          {size === 'sm' ? t('care.call') : null}
        </a>
      </Button>
      <Button asChild variant="outline" size={size}>
        <a
          href={`https://wa.me/${whatsappNumber(phone)}`}
          target="_blank"
          rel="noreferrer"
          aria-label={t('care.whatsappPerson', { phone })}
        >
          <MessageCircle />
          {size === 'sm' ? 'WhatsApp' : null}
        </a>
      </Button>
    </span>
  );
}

/** "Move to" menu: the keyboard and touch way to change a card's column. */
export function StageMenu({
  followUp,
  onMove,
  size = 'xs',
}: {
  followUp: VisitorFollowUp;
  onMove: (followUp: VisitorFollowUp, stage: FollowUpStage) => void;
  size?: 'xs' | 'sm';
}) {
  const { t, locale } = useI18n();
  if (!followUp.canManage) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className="text-muted-foreground"
          aria-label={t('care.moveTo')}
        >
          <ArrowRightLeft />
          {size === 'sm' ? t('care.moveTo') : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('care.moveTo')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={followUp.stage}
          onValueChange={(value) => onMove(followUp, value as FollowUpStage)}
        >
          {FOLLOW_UP_STAGES.map((stage) => (
            <DropdownMenuRadioItem key={stage} value={stage}>
              {localize(FOLLOW_UP_STAGE_LABELS[stage], locale)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type CreateValues = z.input<typeof visitorFollowUpInputSchema>;

/** Adds a visitor to the pipeline: someone in the directory, or a new guest. */
export function NewFollowUpSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (followUp: VisitorFollowUp) => void;
}) {
  const { t } = useI18n();
  const { access } = useChurch();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('care.newFollowUp')}</SheetTitle>
          <SheetDescription>
            {canAddVisitorPerson(access)
              ? t('care.newFollowUpDescription')
              : t('care.newFollowUpExistingDescription')}
          </SheetDescription>
        </SheetHeader>
        {open ? (
          <NewFollowUpForm
            onDone={(created) => {
              onOpenChange(false);
              if (created) onCreated?.(created);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function NewFollowUpForm({ onDone }: { onDone: (created?: VisitorFollowUp) => void }) {
  const { t } = useI18n();
  const { churchId, access } = useChurch();
  const today = useToday();
  // A new guest is a new person in the directory: only for those who may add people.
  const canAddPerson = canAddVisitorPerson(access);
  const [mode, setMode] = useState<'new' | 'existing'>(canAddPerson ? 'new' : 'existing');
  const form = useForm<CreateValues, unknown, VisitorFollowUpInput>({
    resolver: zodResolver(visitorFollowUpInputSchema),
    defaultValues: {
      personId: null,
      newVisitor: { firstName: '', lastName: '', phone: '', email: '' },
      stage: 'new',
      source: '',
      firstVisitDate: today,
      assignedUserId: null,
      notes: '',
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useCreateFollowUp(churchId), {
    success: (data) => t('care.followUpCreated', { name: data.followUp.person.firstName }),
    form,
    fields: ['personId', 'newVisitor', 'source', 'firstVisitDate', 'assignedUserId', 'notes'],
  });
  const onSubmit = form.handleSubmit(async (values) => {
    const body =
      mode === 'existing' ? { ...values, newVisitor: null } : { ...values, personId: null };
    const result = await save.run(body);
    if (result) onDone(result.followUp);
  });
  const personError = errors.personId?.message;

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <SheetBody className="flex flex-col gap-4">
        {canAddPerson ? (
          <Segmented
            aria-label={t('care.visitorKind')}
            value={mode}
            onChange={(value) => {
              setMode(value);
              form.clearErrors();
            }}
            options={[
              { value: 'new', label: t('care.newGuest') },
              { value: 'existing', label: t('care.inDirectory') },
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t('care.newGuestNeedsPermission')}</p>
        )}
        {mode === 'existing' ? (
          <Controller
            control={form.control}
            name="personId"
            render={({ field }) => (
              <Field
                label={t('care.person')}
                htmlFor="follow-up-person"
                error={personError}
                required
              >
                <PersonCombobox
                  id="follow-up-person"
                  value={field.value ?? null}
                  invalid={!!personError}
                  onChange={(value) => field.onChange(value)}
                />
              </Field>
            )}
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('care.firstName')}
                htmlFor="visitor-first"
                error={errors.newVisitor?.firstName?.message ?? personError}
                required
              >
                <Input
                  id="visitor-first"
                  autoFocus
                  autoComplete="off"
                  aria-invalid={!!errors.newVisitor?.firstName}
                  {...form.register('newVisitor.firstName')}
                />
              </Field>
              <Field label={t('care.lastName')} htmlFor="visitor-last">
                <Input
                  id="visitor-last"
                  autoComplete="off"
                  {...form.register('newVisitor.lastName')}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('care.phone')} htmlFor="visitor-phone">
                <Input
                  id="visitor-phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="0812…"
                  {...form.register('newVisitor.phone')}
                />
              </Field>
              <Field
                label={t('care.email')}
                htmlFor="visitor-email"
                error={errors.newVisitor?.email?.message}
              >
                <Input id="visitor-email" type="email" {...form.register('newVisitor.email')} />
              </Field>
            </div>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('care.firstVisit')}
            htmlFor="follow-up-first-visit"
            error={errors.firstVisitDate?.message}
          >
            <Input
              id="follow-up-first-visit"
              type="date"
              max={today}
              {...form.register('firstVisitDate')}
            />
          </Field>
          <Field label={t('care.source')} htmlFor="follow-up-source">
            <Input
              id="follow-up-source"
              placeholder={t('care.sourcePlaceholder')}
              {...form.register('source')}
            />
          </Field>
        </div>
        <Controller
          control={form.control}
          name="assignedUserId"
          render={({ field }) => (
            <Field
              label={t('care.followUpBy')}
              htmlFor="follow-up-assignee"
              error={errors.assignedUserId?.message}
            >
              <MemberCombobox
                id="follow-up-assignee"
                everyone
                value={field.value ?? null}
                onChange={field.onChange}
              />
            </Field>
          )}
        />
        <Field label={t('care.notes')} htmlFor="follow-up-notes">
          <Textarea
            id="follow-up-notes"
            rows={3}
            placeholder={t('care.followUpNotesPlaceholder')}
            {...form.register('notes')}
          />
        </Field>
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={() => onDone()} disabled={save.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {t('care.newFollowUp')}
        </Button>
      </SheetFooter>
    </form>
  );
}

type UpdateValues = z.input<typeof visitorFollowUpUpdateSchema>;

/** Edits the details of a follow-up; reassigning needs care.manage. */
export function EditFollowUpSheet({
  followUp,
  open,
  onOpenChange,
}: {
  followUp: VisitorFollowUp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { churchId, access } = useChurch();
  const form = useForm<UpdateValues, unknown, VisitorFollowUpUpdate>({
    resolver: zodResolver(visitorFollowUpUpdateSchema),
    values: {
      source: followUp.source ?? '',
      firstVisitDate: followUp.firstVisitDate ?? '',
      assignedUserId: followUp.assignee?.userId ?? null,
      notes: followUp.notes ?? '',
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useUpdateFollowUp(churchId), {
    success: t('care.followUpSaved'),
    form,
  });
  const onSubmit = form.handleSubmit(async (values) => {
    if (await save.run({ ...values, id: followUp.id })) onOpenChange(false);
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('care.editFollowUp')}</SheetTitle>
          <SheetDescription>{t('care.editFollowUpDescription')}</SheetDescription>
        </SheetHeader>
        <form
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <SheetBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('care.firstVisit')}
                htmlFor="edit-first-visit"
                error={errors.firstVisitDate?.message}
              >
                <Input
                  id="edit-first-visit"
                  type="date"
                  autoFocus
                  {...form.register('firstVisitDate')}
                />
              </Field>
              <Field label={t('care.source')} htmlFor="edit-source">
                <Input
                  id="edit-source"
                  placeholder={t('care.sourcePlaceholder')}
                  {...form.register('source')}
                />
              </Field>
            </div>
            {has(access, 'care.manage') ? (
              <Controller
                control={form.control}
                name="assignedUserId"
                render={({ field }) => (
                  <Field label={t('care.followUpBy')} htmlFor="edit-assignee">
                    <MemberCombobox
                      id="edit-assignee"
                      everyone
                      value={field.value ?? null}
                      onChange={field.onChange}
                    />
                  </Field>
                )}
              />
            ) : null}
            <Field label={t('care.notes')} htmlFor="edit-notes">
              <Textarea id="edit-notes" rows={5} {...form.register('notes')} />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('common.saveChanges')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
