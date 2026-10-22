import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  localize,
  serviceTypeInputSchema,
  type ServiceType,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DataList } from '@/components/ui/data-list';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import {
  serviceTypesQuery,
  useDeleteServiceType,
  useSaveServiceType,
  useSetupWorship,
} from './api';
import { ColorSwatches } from './team-dialogs';
import { WORSHIP_TONE } from './worship-lib';

/** Ibadah Umum, Pemuda, Remaja, Sekolah Minggu, Doa, Hari Raya: planners keep the list. */
export function ServiceTypesPage() {
  const { churchId, base } = useChurch();
  const { t, locale } = useI18n();
  const query = useQuery(serviceTypesQuery(churchId));
  const [editing, setEditing] = useState<ServiceType | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ServiceType | null>(null);
  const remove = useMutationToast(useDeleteServiceType(churchId), {
    success: t('worship.typeDeleted'),
  });
  const setup = useMutationToast(useSetupWorship(churchId), {
    success: (result) =>
      t('worship.setupDone', { types: result.serviceTypes, teams: result.teams }),
  });

  return (
    <Page>
      <PageHeader
        title={t('worship.typesTitle')}
        description={t('worship.typesDescription')}
        icon={CalendarRange}
        tone={WORSHIP_TONE}
        breadcrumbs={[
          { label: t('worship.nav'), to: `${base}/worship` },
          { label: t('worship.servicesTitle'), to: `${base}/worship/services` },
          { label: t('worship.typesTitle') },
        ]}
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus />
            {t('worship.newType')}
          </Button>
        }
      />
      {query.isPending ? (
        <SkeletonList rows={5} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          tone={WORSHIP_TONE}
          title={t('worship.noTypes')}
          description={t('worship.setupBody')}
          action={
            <Button loading={setup.isPending} onClick={() => void setup.run(undefined)}>
              {!setup.isPending ? <Sparkles /> : null}
              {t('worship.setupAction')}
            </Button>
          }
        />
      ) : (
        <DataList
          items={query.data.items}
          getKey={(item) => item.id}
          onRowClick={(item) => setEditing(item)}
          leading={(item) => <EntityAvatar name={item.name} color={item.color} square />}
          title={(item) => (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{item.name}</span>
              {!item.isActive ? (
                <StatusBadge tone="neutral" size="sm">
                  {t('worship.inactiveType')}
                </StatusBadge>
              ) : null}
            </span>
          )}
          subtitle={(item) =>
            [
              localize(SERVICE_CATEGORY_LABELS[item.category], locale),
              item.defaultTime ? t('worship.defaultAt', { time: item.defaultTime }) : null,
              item.defaultDurationMinutes
                ? t('worship.minutes', { count: item.defaultDurationMinutes })
                : null,
              item.defaultLocation,
            ]
              .filter(Boolean)
              .join(' · ')
          }
          actionsLabel={(item) => item.name}
          actions={(item) => [
            { id: 'edit', label: t('common.edit'), icon: Pencil, onSelect: () => setEditing(item) },
            {
              id: 'delete',
              label: t('common.delete'),
              icon: Trash2,
              destructive: true,
              onSelect: () => setDeleting(item),
            },
          ]}
        />
      )}
      <TypeDialog
        type={editing && editing !== 'new' ? editing : undefined}
        open={editing !== null}
        onOpenChange={(open) => (!open ? setEditing(null) : undefined)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => (!open ? setDeleting(null) : undefined)}
        title={t('worship.deleteTypeTitle', { name: deleting?.name ?? '' })}
        description={t('worship.deleteTypeBody')}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onConfirm={async () => {
          if (deleting && (await remove.run(deleting.id))) setDeleting(null);
        }}
      />
    </Page>
  );
}

type TypeForm = z.input<typeof serviceTypeInputSchema>;

function TypeDialog({
  type,
  open,
  onOpenChange,
}: {
  type?: ServiceType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { churchId } = useChurch();
  const { t, locale } = useI18n();
  const form = useForm<TypeForm, unknown, z.output<typeof serviceTypeInputSchema>>({
    resolver: zodResolver(serviceTypeInputSchema),
    values: {
      name: type?.name ?? '',
      category: type?.category ?? 'general',
      defaultTime: type?.defaultTime ?? null,
      defaultDurationMinutes: type?.defaultDurationMinutes ?? 120,
      defaultLocation: type?.defaultLocation ?? '',
      color: type?.color ?? null,
      sortOrder: type?.sortOrder ?? 0,
      isActive: type?.isActive ?? true,
    },
  });
  const errors = form.formState.errors;
  const save = useMutationToast(useSaveServiceType(churchId), {
    success: (result) => t('worship.typeSaved', { name: result.serviceType.name }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    if (await save.run({ ...values, id: type?.id })) onOpenChange(false);
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
            <DialogTitle>{type ? t('worship.editType') : t('worship.newType')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field
              label={t('worship.typeName')}
              htmlFor="type-name"
              error={errors.name?.message}
              required
            >
              <Input
                id="type-name"
                autoFocus
                placeholder={t('worship.typeNamePlaceholder')}
                aria-invalid={!!errors.name}
                {...form.register('name')}
              />
            </Field>
            <Field label={t('worship.typeCategory')} htmlFor="type-category">
              <Select id="type-category" {...form.register('category')}>
                {SERVICE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {localize(SERVICE_CATEGORY_LABELS[category], locale)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t('worship.typeTime')}
                htmlFor="type-time"
                error={errors.defaultTime?.message}
              >
                <Input
                  id="type-time"
                  type="time"
                  aria-invalid={!!errors.defaultTime}
                  {...form.register('defaultTime', {
                    setValueAs: (value: string | null) => (value ? value : null),
                  })}
                />
              </Field>
              <Field
                label={t('worship.typeDuration')}
                htmlFor="type-duration"
                error={errors.defaultDurationMinutes?.message}
              >
                <Input
                  id="type-duration"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={600}
                  {...form.register('defaultDurationMinutes', {
                    setValueAs: (value: string | number | null) =>
                      value === '' || value === null ? null : Number(value),
                  })}
                />
              </Field>
            </div>
            <Field label={t('worship.typeLocation')} htmlFor="type-location">
              <Input id="type-location" {...form.register('defaultLocation')} />
            </Field>
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <div className="flex flex-col gap-2">
                  <Label>{t('worship.typeColor')}</Label>
                  <ColorSwatches
                    label={t('worship.typeColor')}
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
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 p-3.5">
                  <Label htmlFor="type-active">{t('worship.typeActive')}</Label>
                  <Switch
                    id="type-active"
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
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
