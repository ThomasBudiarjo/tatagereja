import {
  TEAM_MEMBER_ROLES,
  canManageServices,
  servingPositionInputSchema,
  servingTeamInputSchema,
  servingTeamMemberInputSchema,
  type ServingPosition,
  type ServingTeam,
  type ServingTeamMember,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { useAddTeamMember, useSavePosition, useSaveTeam, useUpdateTeamMember } from './api';
import { TEAM_COLORS } from './worship-lib';
import { PersonSelect } from './worship-ui';

export function ColorSwatches({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {TEAM_COLORS.map((color) => {
        const selected = value?.toLowerCase() === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={color}
            onClick={() => onChange(selected ? null : color)}
            className={cn(
              'flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-transform outline-none hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50',
              selected && 'ring-2 ring-foreground/60',
            )}
            style={{ backgroundColor: color }}
          >
            {selected ? <Check className="size-4 text-white" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}

type TeamForm = z.input<typeof servingTeamInputSchema>;

export function TeamDialog({
  team,
  open,
  onOpenChange,
}: {
  team?: ServingTeam;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId, base } = useChurch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const form = useForm<TeamForm, unknown, z.output<typeof servingTeamInputSchema>>({
    resolver: zodResolver(servingTeamInputSchema),
    defaultValues: {
      name: team?.name ?? '',
      description: team?.description ?? '',
      color: team?.color ?? null,
      groupId: team?.groupId ?? null,
      isActive: team?.isActive ?? true,
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useSaveTeam(churchId, team?.id), {
    success: (result) => t('worship.teamSaved', { name: result.team.name }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (!result) return;
    onOpenChange(false);
    if (!team) void navigate(`${base}/worship/teams/${result.team.id}`);
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
            <DialogTitle>{team ? t('worship.editTeam') : t('worship.newTeam')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field
              label={t('worship.teamName')}
              htmlFor="team-name"
              error={errors.name?.message}
              required
            >
              <Input
                id="team-name"
                autoFocus
                placeholder={t('worship.teamNamePlaceholder')}
                aria-invalid={!!errors.name}
                {...form.register('name')}
              />
            </Field>
            <Field
              label={t('worship.teamDescription')}
              htmlFor="team-description"
              error={errors.description?.message}
            >
              <Textarea id="team-description" rows={2} {...form.register('description')} />
            </Field>
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <div className="flex flex-col gap-2">
                  <Label>{t('worship.teamColor')}</Label>
                  <ColorSwatches
                    label={t('worship.teamColor')}
                    value={field.value ?? null}
                    onChange={field.onChange}
                  />
                </div>
              )}
            />
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3.5">
                  <div>
                    <Label htmlFor="team-active">{t('worship.teamActive')}</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('worship.teamActiveHint')}
                    </p>
                  </div>
                  <Switch
                    id="team-active"
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
              {team ? t('common.saveChanges') : t('worship.newTeam')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type PositionForm = z.input<typeof servingPositionInputSchema>;

export function PositionDialog({
  teamId,
  position,
  open,
  onOpenChange,
}: {
  teamId: string;
  position?: ServingPosition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const form = useForm<PositionForm, unknown, z.output<typeof servingPositionInputSchema>>({
    resolver: zodResolver(servingPositionInputSchema),
    values: {
      name: position?.name ?? '',
      description: position?.description ?? '',
      needed: position?.needed ?? 1,
      sortOrder: position?.sortOrder ?? 0,
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useSavePosition(churchId, teamId), {
    success: t('worship.positionSaved'),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    if (await save.run({ ...values, id: position?.id })) {
      form.reset();
      onOpenChange(false);
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {position ? t('worship.editPosition') : t('worship.addPosition')}
            </DialogTitle>
          </DialogHeader>
          <Field
            label={t('worship.positionName')}
            htmlFor="position-name"
            error={errors.name?.message}
            required
          >
            <Input
              id="position-name"
              autoFocus
              placeholder={t('worship.positionNamePlaceholder')}
              aria-invalid={!!errors.name}
              {...form.register('name')}
            />
          </Field>
          <Field
            label={t('worship.positionNeeded')}
            htmlFor="position-needed"
            error={errors.needed?.message}
          >
            <Input
              id="position-needed"
              type="number"
              inputMode="numeric"
              min={0}
              max={50}
              {...form.register('needed', { valueAsNumber: true })}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type MemberForm = z.input<typeof servingTeamMemberInputSchema>;

/** Adds a member (person, positions, leader) or edits an existing member's positions and role. */
export function MemberDialog({
  team,
  member,
  existingIds,
  open,
  onOpenChange,
}: {
  team: ServingTeam;
  member?: ServingTeamMember;
  existingIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId, access } = useChurch();
  const { t } = useI18n();
  const [personName, setPersonName] = useState<string | null>(null);
  const canAppoint = canManageServices(access);
  const form = useForm<MemberForm, unknown, z.output<typeof servingTeamMemberInputSchema>>({
    resolver: zodResolver(servingTeamMemberInputSchema),
    values: {
      personId: member?.id ?? '',
      role: member?.role ?? 'member',
      positionIds: member?.positionIds ?? [],
    },
  });
  const errors = form.formState.errors;
  const add = useMutationToast(useAddTeamMember(churchId, team.id), {
    success: () => t('worship.memberAdded', { name: personName ?? '', team: team.name }),
    form,
  });
  const update = useMutationToast(useUpdateTeamMember(churchId, team.id), {
    success: t('worship.memberSaved'),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const done = member
      ? await update.run({
          id: member.teamMemberId,
          role: values.role,
          positionIds: values.positionIds,
        })
      : await add.run(values);
    if (done) {
      form.reset();
      onOpenChange(false);
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 flex-col gap-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{member ? t('worship.editMember') : t('worship.addMember')}</DialogTitle>
            <DialogDescription>{team.name}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            {member ? null : (
              <Controller
                control={form.control}
                name="personId"
                render={({ field }) => (
                  <Field
                    label={t('worship.memberPerson')}
                    htmlFor="member-person"
                    error={errors.personId?.message}
                    required
                  >
                    <PersonSelect
                      id="member-person"
                      value={field.value || null}
                      excludeIds={existingIds}
                      invalid={!!errors.personId}
                      onChange={(personId, person) => {
                        setPersonName(
                          person ? `${person.firstName} ${person.lastName ?? ''}`.trim() : null,
                        );
                        field.onChange(personId ?? '');
                      }}
                    />
                  </Field>
                )}
              />
            )}
            {team.positions.length > 0 ? (
              <Controller
                control={form.control}
                name="positionIds"
                render={({ field }) => {
                  const selected = field.value ?? [];
                  return (
                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-sm font-medium">
                        {t('worship.memberPositions')}
                      </legend>
                      <p className="-mt-1 text-xs text-muted-foreground">
                        {t('worship.memberPositionsHint')}
                      </p>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {team.positions.map((position) => (
                          <label
                            key={position.id}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted/60"
                          >
                            <Checkbox
                              checked={selected.includes(position.id)}
                              onCheckedChange={(checked) =>
                                field.onChange(
                                  checked
                                    ? [...selected, position.id]
                                    : selected.filter((id) => id !== position.id),
                                )
                              }
                            />
                            <span className="text-sm">{position.name}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                }}
              />
            ) : null}
            {canAppoint ? (
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3.5">
                    <div>
                      <Label htmlFor="member-leader">{t('worship.memberLeader')}</Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('worship.memberLeaderHint')}
                      </p>
                    </div>
                    <Switch
                      id="member-leader"
                      checked={field.value === TEAM_MEMBER_ROLES[1]}
                      onCheckedChange={(checked) => field.onChange(checked ? 'leader' : 'member')}
                    />
                  </div>
                )}
              />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={add.isPending || update.isPending}>
              {member ? t('common.saveChanges') : t('worship.addMember')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
