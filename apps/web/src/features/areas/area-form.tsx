import { areaInputSchema, type Area, type AreaInput } from '@tatagereja/shared';
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
import { Switch } from '@/components/ui/switch';
import { useSaveArea } from '@/features/people/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { SWATCHES } from '@/features/people/labels';
import { ColorSwatches } from '@/features/people/people-ui';

type FormInput = z.input<typeof areaInputSchema>;

export function AreaFormDialog({
  area,
  open,
  onOpenChange,
  onSaved,
}: {
  area?: Area;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (area: Area) => void;
}) {
  const { churchId } = useChurch();
  const { t } = useI18n();
  const form = useForm<FormInput, unknown, AreaInput>({
    resolver: zodResolver(areaInputSchema),
    defaultValues: {
      name: area?.name ?? '',
      code: area?.code ?? '',
      description: area?.description ?? '',
      color: area?.color ?? SWATCHES[1],
      sortOrder: area?.sortOrder ?? 0,
      isActive: area?.isActive ?? true,
    },
  });
  const save = useMutationToast(useSaveArea(churchId, area?.id), {
    success: (data) =>
      area ? t('people.areaUpdated') : t('people.areaCreated', { name: data.area.name }),
    form,
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (!result) return;
    form.reset(values);
    onOpenChange(false);
    onSaved?.(result.area);
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{area ? t('people.editArea') : t('people.newArea')}</DialogTitle>
          <DialogDescription>{t('people.areaFormHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="area-form"
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <Field
                label={t('people.areaName')}
                htmlFor="area-name"
                error={errors.name?.message}
                required
              >
                <Input
                  id="area-name"
                  autoFocus
                  placeholder={t('people.areaNamePlaceholder')}
                  {...form.register('name')}
                  aria-invalid={!!errors.name}
                />
              </Field>
              <Field label={t('people.areaCode')} htmlFor="area-code" error={errors.code?.message}>
                <Input id="area-code" placeholder="W-01" {...form.register('code')} />
              </Field>
            </div>
            <Field
              label={t('people.description')}
              htmlFor="area-description"
              error={errors.description?.message}
            >
              <Textarea id="area-description" rows={2} {...form.register('description')} />
            </Field>
            <Field label={t('people.color')}>
              <Controller
                control={form.control}
                name="color"
                render={({ field }) => (
                  <ColorSwatches
                    value={field.value}
                    onChange={field.onChange}
                    label={t('people.color')}
                  />
                )}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t('people.sortOrder')}
                htmlFor="area-order"
                error={errors.sortOrder?.message}
              >
                <Input
                  id="area-order"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  {...form.register('sortOrder', { valueAsNumber: true })}
                />
              </Field>
              <Controller
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <Field label={t('people.active')} htmlFor="area-active">
                    <label className="flex h-11 items-center gap-3 text-sm">
                      <Switch
                        id="area-active"
                        checked={field.value ?? true}
                        onCheckedChange={field.onChange}
                      />
                      {field.value === false ? t('people.inactiveArea') : t('people.activeArea')}
                    </label>
                  </Field>
                )}
              />
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="area-form" loading={save.isPending}>
            {area ? t('common.saveChanges') : t('people.createArea')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
