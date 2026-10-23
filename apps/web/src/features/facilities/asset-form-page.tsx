import {
  ASSET_CONDITIONS,
  ASSET_CONDITION_LABELS,
  ASSET_STATUS_LABELS,
  inventoryAssetInputSchema,
  localize,
  type InventoryAsset,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Field, FormActions } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useUnsavedChangesGuard } from '@/components/ui/unsaved-changes';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { assetQuery, categoriesQuery, resourcesQuery, useSaveAsset } from './api';
import { INVENTORY_TONE, todayIn } from './facilities-lib';
import { PersonPicker } from './facilities-ui';

type FormInput = z.input<typeof inventoryAssetInputSchema>;
type FormOutput = z.output<typeof inventoryAssetInputSchema>;

const SUGGESTED_CATEGORIES = [
  'Sound system',
  'Multimedia',
  'Alat musik',
  'Mebel',
  'Elektronik',
  'Perlengkapan ibadah',
  'Kendaraan',
  'Dapur',
];

const EDITABLE_STATUSES = ['available', 'maintenance', 'retired', 'lost'] as const;

export function NewAssetPage() {
  return <AssetFormPage />;
}

export function EditAssetPage() {
  const { assetId = '' } = useParams();
  const { churchId } = useChurch();
  const query = useQuery(assetQuery(churchId, assetId));
  if (query.isPending) {
    return (
      <Page size="narrow">
        <SkeletonText lines={12} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page size="narrow">
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      </Page>
    );
  }
  return <AssetFormPage asset={query.data.asset} />;
}

function AssetFormPage({ asset }: { asset?: InventoryAsset }) {
  const { churchId, base, church } = useChurch();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const resources = useQuery(resourcesQuery(churchId, { includeInactive: true }));
  const categories = useQuery(categoriesQuery(churchId));
  const onLoan = asset?.status === 'on_loan';
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(inventoryAssetInputSchema),
    defaultValues: {
      name: asset?.name ?? '',
      category: asset?.category ?? '',
      description: asset?.description ?? '',
      resourceId: asset?.resourceId ?? null,
      location: asset?.location ?? '',
      condition: asset?.condition ?? 'good',
      status: asset && asset.status !== 'on_loan' ? asset.status : 'available',
      acquisitionDate: asset?.acquisitionDate ?? '',
      acquisitionValue: asset?.acquisitionValue ?? null,
      custodianPersonId: asset?.custodian?.id ?? null,
      serialNumber: asset?.serialNumber ?? '',
      photoUrl: asset?.photoUrl ?? '',
      notes: asset?.notes ?? '',
    },
  });
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting && !isSubmitSuccessful);
  const save = useMutationToast(useSaveAsset(churchId, asset?.id), {
    success: (result) =>
      asset
        ? t('facilities.assetSaved', { name: result.asset.name })
        : t('facilities.assetCreated', { code: result.asset.code }),
    form,
  });
  const submit = form.handleSubmit(async (values) => {
    const result = await save.run(values);
    if (result) {
      void navigate(`${base}/facilities/inventory/${result.asset.id}`, { replace: !asset });
    }
  });
  const title = asset ? t('facilities.assetFormEdit') : t('facilities.assetFormNew');
  const categoryOptions = [
    ...new Set([
      ...(categories.data?.items.map((item) => item.category) ?? []),
      ...SUGGESTED_CATEGORIES,
    ]),
  ];

  return (
    <Page size="narrow">
      <PageHeader
        title={title}
        eyebrow={asset?.code}
        icon={Package}
        tone={INVENTORY_TONE}
        breadcrumbs={[
          { label: t('facilities.nav'), to: `${base}/facilities` },
          { label: t('facilities.inventoryTitle'), to: `${base}/facilities/inventory` },
          ...(asset ? [{ label: asset.code, to: `${base}/facilities/inventory/${asset.id}` }] : []),
          { label: title },
        ]}
      />
      {!asset ? <Alert variant="info">{t('facilities.codeAutomatic')}</Alert> : null}
      <Card>
        <CardContent>
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
            <Field
              label={t('facilities.fieldAssetName')}
              htmlFor="asset-name"
              error={errors.name?.message}
              required
            >
              <Input
                id="asset-name"
                autoFocus
                placeholder={t('facilities.assetNamePlaceholder')}
                aria-invalid={!!errors.name}
                {...form.register('name')}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('facilities.fieldCategory')}
                htmlFor="asset-category"
                error={errors.category?.message}
              >
                <Input id="asset-category" list="asset-categories" {...form.register('category')} />
                <datalist id="asset-categories">
                  {categoryOptions.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </Field>
              <Field
                label={t('facilities.fieldSerialNumber')}
                htmlFor="asset-serial"
                error={errors.serialNumber?.message}
              >
                <Input id="asset-serial" className="font-mono" {...form.register('serialNumber')} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="resourceId"
                render={({ field }) => (
                  <Field label={t('facilities.fieldStoredIn')} htmlFor="asset-resource">
                    <Select
                      id="asset-resource"
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value || null)}
                    >
                      <option value="">{t('facilities.noRoom')}</option>
                      {(resources.data?.items ?? []).map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              />
              <Field
                label={t('facilities.fieldLocationDetail')}
                htmlFor="asset-location"
                error={errors.location?.message}
              >
                <Input
                  id="asset-location"
                  placeholder={t('facilities.locationDetailPlaceholder')}
                  {...form.register('location')}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('facilities.fieldCondition')} htmlFor="asset-condition">
                <Select id="asset-condition" {...form.register('condition')}>
                  {ASSET_CONDITIONS.map((condition) => (
                    <option key={condition} value={condition}>
                      {localize(ASSET_CONDITION_LABELS[condition], locale)}
                    </option>
                  ))}
                </Select>
              </Field>
              {onLoan ? (
                <Field
                  label={t('facilities.fieldStatus')}
                  description={t('facilities.statusOnLoanHint')}
                >
                  <Input value={localize(ASSET_STATUS_LABELS.on_loan, locale)} disabled readOnly />
                </Field>
              ) : (
                <Field label={t('facilities.fieldStatus')} htmlFor="asset-status">
                  <Select id="asset-status" {...form.register('status')}>
                    {EDITABLE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {localize(ASSET_STATUS_LABELS[status], locale)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('facilities.fieldAcquisitionDate')}
                htmlFor="asset-acquired"
                error={errors.acquisitionDate?.message}
              >
                <Input
                  id="asset-acquired"
                  type="date"
                  max={todayIn(church.timezone)}
                  {...form.register('acquisitionDate')}
                />
              </Field>
              <Controller
                control={form.control}
                name="acquisitionValue"
                render={({ field }) => (
                  <Field
                    label={t('facilities.fieldAcquisitionValue')}
                    htmlFor="asset-value"
                    error={errors.acquisitionValue?.message}
                  >
                    <CurrencyInput
                      id="asset-value"
                      value={field.value ?? null}
                      onChange={field.onChange}
                    />
                  </Field>
                )}
              />
            </div>
            <Controller
              control={form.control}
              name="custodianPersonId"
              render={({ field }) => (
                <Field
                  label={t('facilities.fieldCustodian')}
                  htmlFor="asset-custodian"
                  description={t('facilities.custodianHint')}
                >
                  <PersonPicker
                    id="asset-custodian"
                    value={field.value ?? null}
                    onChange={field.onChange}
                  />
                </Field>
              )}
            />
            <Field
              label={t('facilities.fieldDescription')}
              htmlFor="asset-description"
              error={errors.description?.message}
            >
              <Textarea id="asset-description" rows={2} {...form.register('description')} />
            </Field>
            <Field
              label={t('facilities.fieldPhotoUrl')}
              htmlFor="asset-photo"
              error={errors.photoUrl?.message}
              description={t('facilities.photoUrlHint')}
            >
              <Input
                id="asset-photo"
                type="url"
                inputMode="url"
                placeholder="https://"
                aria-invalid={!!errors.photoUrl}
                {...form.register('photoUrl')}
              />
            </Field>
            <Field
              label={t('facilities.fieldNotes')}
              htmlFor="asset-notes"
              error={errors.notes?.message}
            >
              <Textarea id="asset-notes" rows={2} {...form.register('notes')} />
            </Field>
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => void navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={save.isPending}>
                {asset ? t('common.saveChanges') : t('facilities.newAsset')}
              </Button>
            </FormActions>
            {guard}
          </form>
        </CardContent>
      </Card>
    </Page>
  );
}
