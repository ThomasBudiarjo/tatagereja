import {
  CHECKIN_LIMITS,
  checkinClassInputSchema,
  fullName,
  type CheckinClass,
  type PersonSummary,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Crown, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { cn } from '@/lib/utils';
import { useSaveClass, useSetTeachers } from './api';
import { CHECKIN_TONE, CLASS_COLORS } from './checkin-lib';
import { PersonSelect } from './checkin-ui';

type ClassForm = z.input<typeof checkinClassInputSchema>;

/** Empty inputs are "no limit"; numbers otherwise. */
const optionalNumber = {
  setValueAs: (value: unknown) => (value === '' || value === null ? null : Number(value)),
};

export function ClassDialog({
  item,
  open,
  onOpenChange,
  nextSortOrder = 0,
}: {
  item?: CheckinClass;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextSortOrder?: number;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const form = useForm<ClassForm, unknown, z.output<typeof checkinClassInputSchema>>({
    resolver: zodResolver(checkinClassInputSchema),
    // `values` follows the saved class, so cancelling never brings back an older version.
    values: {
      name: item?.name ?? '',
      minAge: item?.minAge ?? null,
      maxAge: item?.maxAge ?? null,
      resourceId: item?.resourceId ?? null,
      location: item?.location ?? '',
      capacity: item?.capacity ?? null,
      maxChildrenPerTeacher: item?.maxChildrenPerTeacher ?? 8,
      color: item?.color ?? null,
      sortOrder: item?.sortOrder ?? nextSortOrder,
      isActive: item?.isActive ?? true,
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useSaveClass(churchId, item?.id), {
    success: (result) => t('checkin.classSaved', { name: result.class.name }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (result) onOpenChange(false);
  });
  const close = () => {
    form.reset();
    onOpenChange(false);
  };

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
            <DialogTitle>{item ? t('checkin.editClass') : t('checkin.newClass')}</DialogTitle>
            <DialogDescription>{t('checkin.classFormHint')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field
              label={t('checkin.className')}
              htmlFor="class-name"
              error={errors.name?.message}
              required
            >
              <Input
                id="class-name"
                autoFocus
                placeholder={t('checkin.classNamePlaceholder')}
                aria-invalid={!!errors.name}
                {...form.register('name')}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t('checkin.minAge')}
                htmlFor="class-min-age"
                error={errors.minAge?.message}
              >
                <Input
                  id="class-min-age"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={25}
                  aria-invalid={!!errors.minAge}
                  {...form.register('minAge', optionalNumber)}
                />
              </Field>
              <Field
                label={t('checkin.maxAge')}
                htmlFor="class-max-age"
                error={errors.maxAge?.message}
              >
                <Input
                  id="class-max-age"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={25}
                  aria-invalid={!!errors.maxAge}
                  {...form.register('maxAge', optionalNumber)}
                />
              </Field>
              <Field
                label={t('checkin.capacity')}
                htmlFor="class-capacity"
                error={errors.capacity?.message}
                description={t('checkin.capacityHint')}
              >
                <Input
                  id="class-capacity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  aria-invalid={!!errors.capacity}
                  {...form.register('capacity', optionalNumber)}
                />
              </Field>
              <Field
                label={t('checkin.ratio')}
                htmlFor="class-ratio"
                error={errors.maxChildrenPerTeacher?.message}
                description={t('checkin.ratioHint')}
              >
                <Input
                  id="class-ratio"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  aria-invalid={!!errors.maxChildrenPerTeacher}
                  {...form.register('maxChildrenPerTeacher', optionalNumber)}
                />
              </Field>
            </div>
            <Field
              label={t('checkin.location')}
              htmlFor="class-location"
              error={errors.location?.message}
            >
              <Input
                id="class-location"
                placeholder={t('checkin.locationPlaceholder')}
                {...form.register('location')}
              />
            </Field>
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <div className="flex flex-col gap-2">
                  <Label>{t('checkin.classColor')}</Label>
                  <div
                    role="radiogroup"
                    aria-label={t('checkin.classColor')}
                    className="flex flex-wrap gap-2"
                  >
                    {CLASS_COLORS.map((color) => {
                      const selected = field.value?.toLowerCase() === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={color}
                          onClick={() => field.onChange(selected ? null : color)}
                          className={cn(
                            'flex size-11 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-transform outline-none hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                            selected && 'ring-2 ring-foreground/60',
                          )}
                          style={{ backgroundColor: color }}
                        >
                          {selected ? <Check className="size-4 text-white" aria-hidden /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            />
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3.5">
                  <div>
                    <Label htmlFor="class-active">{t('checkin.classActive')}</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('checkin.classActiveHint')}
                    </p>
                  </div>
                  <Switch
                    id="class-active"
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {item ? t('common.saveChanges') : t('checkin.newClass')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Teacher = PersonSummary & { isLead: boolean };

/**
 * Guru Sekolah Minggu of a class: add, remove and mark the lead teacher. Mount it per opening
 * (with a `key`) so it starts from the saved teachers.
 */
export function TeachersDialog({
  item,
  open,
  onOpenChange,
}: {
  item: CheckinClass;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t, formatList } = useI18n();
  const [teachers, setTeachers] = useState<Teacher[]>(item.teachers);
  const [picking, setPicking] = useState<string | null>(null);
  const save = useMutationToast(useSetTeachers(churchId, item.id), {
    success: (result) =>
      result.added.length > 0
        ? t('checkin.teachersAdded', { names: formatList(result.added), name: item.name })
        : t('checkin.teachersSaved', { name: item.name }),
  });
  const submit = async () => {
    const result = await save.run({
      teachers: teachers.map((teacher) => ({ personId: teacher.id, isLead: teacher.isLead })),
    });
    if (result) onOpenChange(false);
  };
  const full = teachers.length >= CHECKIN_LIMITS.teachersPerClassMax;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('checkin.teachersTitle', { name: item.name })}</DialogTitle>
          <DialogDescription>{t('checkin.teachersHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {!full ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="teacher-add">{t('checkin.addTeacher')}</Label>
              <PersonSelect
                id="teacher-add"
                value={picking}
                excludeIds={teachers.map((teacher) => teacher.id)}
                placeholder={t('checkin.addTeacherPlaceholder')}
                onChange={(_id, person) => {
                  if (!person) return;
                  setTeachers((current) => [
                    ...current,
                    { ...person, isLead: current.length === 0 },
                  ]);
                  setPicking(null);
                }}
              />
            </div>
          ) : null}
          {teachers.length === 0 ? (
            <EmptyState
              compact
              icon={UserPlus}
              tone={CHECKIN_TONE}
              title={t('checkin.noTeachers')}
              description={t('checkin.noTeachersHint')}
            />
          ) : (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
              {teachers.map((teacher) => (
                <li key={teacher.id} className="flex items-center gap-3 px-3 py-2">
                  <EntityAvatar name={fullName(teacher)} src={teacher.photoUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {fullName(teacher)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={teacher.isLead ? 'soft' : 'ghost'}
                    aria-pressed={teacher.isLead}
                    onClick={() =>
                      setTeachers((current) =>
                        current.map((other) =>
                          other.id === teacher.id ? { ...other, isLead: !other.isLead } : other,
                        ),
                      )
                    }
                  >
                    <Crown />
                    {t('checkin.leadTeacher')}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t('checkin.removeTeacher', { name: fullName(teacher) })}
                    onClick={() =>
                      setTeachers((current) => current.filter((other) => other.id !== teacher.id))
                    }
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" loading={save.isPending} onClick={() => void submit()}>
            {t('common.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
