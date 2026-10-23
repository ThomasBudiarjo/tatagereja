import {
  ASSET_CONDITION_LABELS,
  MAINTENANCE_KIND_LABELS,
  canManageInventory,
  fullName,
  localize,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  ClipboardList,
  Hash,
  HandHelping,
  MapPin,
  Package,
  Pencil,
  QrCode,
  Tag,
  Trash2,
  Undo2,
  UserRound,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { QrDisplay } from '@/components/ui/qr-code';
import { SkeletonText } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { assetQuery, useDeleteAsset, useDeleteMaintenance } from './api';
import { CheckOutSheet, MaintenanceSheet, ReturnSheet } from './asset-dialogs';
import { INVENTORY_TONE, MAINTENANCE_KIND_ICONS, todayIn } from './facilities-lib';
import { AssetStatusBadge, ConditionBadge, FacilitiesNav } from './facilities-ui';

/** The asset page: also where a scanned QR label lands. */
export function AssetPage() {
  const { assetId = '' } = useParams();
  const { churchId, base, access, church } = useChurch();
  const { t, locale, formatCurrency, formatDate, formatDateTime } = useI18n();
  const navigate = useNavigate();
  const query = useQuery(assetQuery(churchId, assetId));
  const [lending, setLending] = useState(false);
  const [returning, setReturning] = useState(false);
  const [logging, setLogging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingEntry, setRemovingEntry] = useState<string | null>(null);
  const remove = useMutationToast(useDeleteAsset(churchId), { success: t('facilities.assetDeleted') });
  const removeEntry = useMutationToast(useDeleteMaintenance(churchId), {
    success: t('facilities.maintenanceDeleted'),
  });
  const canManage = canManageInventory(access);
  const today = todayIn(church.timezone);
  const crumbs = [
    { label: t('facilities.nav'), to: `${base}/facilities` },
    { label: t('facilities.inventoryTitle'), to: `${base}/facilities/inventory` },
  ];

  if (query.isPending) {
    return (
      <Page size="wide">
        <SkeletonText lines={14} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page size="wide">
        <PageHeader title={t('facilities.inventoryTitle')} breadcrumbs={crumbs} />
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={
            isApiClientError(query.error) && query.error.status === 404
              ? undefined
              : () => void query.refetch()
          }
        />
      </Page>
    );
  }

  const { asset, loans, maintenance, maintenanceCost } = query.data;
  const openLoan = loans.find((loan) => !loan.returnedAt) ?? null;
  const pastLoans = loans.filter((loan) => loan.returnedAt);
  const serviceDue = !!asset.nextMaintenanceDate && asset.nextMaintenanceDate <= today;
  const assetUrl = `${window.location.origin}${base}/facilities/inventory/${asset.id}`;

  return (
    <Page size="wide">
      <PageHeader
        title={asset.name}
        eyebrow={asset.code}
        icon={Package}
        tone={INVENTORY_TONE}
        breadcrumbs={[...crumbs, { label: asset.code }]}
        actions={
          canManage ? (
            <>
              <Button asChild size="sm" variant="outline">
                <Link to={`${base}/facilities/inventory/${asset.id}/edit`}>
                  <Pencil />
                  <span className="hidden sm:inline">{t('common.edit')}</span>
                </Link>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-9 text-muted-foreground hover:text-destructive"
                aria-label={t('facilities.deleteAsset')}
                onClick={() => setDeleting(true)}
              >
                <Trash2 />
              </Button>
            </>
          ) : null
        }
      />
      <FacilitiesNav />

      <div className="flex flex-wrap items-center gap-2">
        <AssetStatusBadge status={asset.status} />
        <ConditionBadge condition={asset.condition} />
        {asset.category ? (
          <StatusBadge tone="slate" size="sm" icon={Tag}>
            {asset.category}
          </StatusBadge>
        ) : null}
      </div>

      {openLoan?.isOverdue ? (
        <Alert
          variant="error"
          title={t('facilities.overdueSince', { date: formatDate(openLoan.dueDate) })}
        >
          {t('facilities.overdueBody', { name: openLoan.borrowerName })}
        </Alert>
      ) : null}
      {serviceDue ? (
        <Alert variant="warning" title={t('facilities.serviceDueTitle')}>
          {t('facilities.serviceDueBody', { date: formatDate(asset.nextMaintenanceDate) })}
        </Alert>
      ) : null}

      {canManage ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {asset.status === 'available' ? (
            <Button onClick={() => setLending(true)}>
              <HandHelping />
              {t('facilities.checkOut')}
            </Button>
          ) : null}
          {openLoan ? (
            <Button onClick={() => setReturning(true)}>
              <Undo2 />
              {t('facilities.markReturned')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setLogging(true)}>
            <Wrench />
            {t('facilities.logMaintenance')}
          </Button>
          <Button asChild variant="outline">
            <Link to={`${base}/facilities/inventory/labels?ids=${asset.id}`}>
              <QrCode />
              {t('facilities.printLabel')}
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="overflow-hidden p-0">
            {asset.photoUrl ? (
              <img src={asset.photoUrl} alt={asset.name} className="aspect-[16/8] w-full object-cover" />
            ) : null}
            <CardContent className="p-4 sm:p-5">
              {asset.description ? (
                <p className="mb-4 text-sm whitespace-pre-line">{asset.description}</p>
              ) : null}
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail icon={MapPin} label={t('facilities.colLocation')}>
                  {asset.resourceName ? (
                    <Link
                      to={`${base}/facilities/rooms/${asset.resourceId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {asset.resourceName}
                    </Link>
                  ) : null}
                  {asset.resourceName && asset.location ? ' · ' : null}
                  {asset.location}
                  {!asset.resourceName && !asset.location ? '—' : null}
                </Detail>
                <Detail icon={UserRound} label={t('facilities.colCustodian')}>
                  {asset.custodian ? (
                    <Link
                      to={`${base}/people/${asset.custodian.id}`}
                      className="inline-flex items-center gap-2 underline-offset-2 hover:underline"
                    >
                      <EntityAvatar
                        name={fullName(asset.custodian)}
                        src={asset.custodian.photoUrl}
                        size="xs"
                      />
                      {fullName(asset.custodian)}
                    </Link>
                  ) : (
                    '—'
                  )}
                </Detail>
                <Detail icon={CalendarClock} label={t('facilities.fieldAcquisitionDate')}>
                  {asset.acquisitionDate ? formatDate(asset.acquisitionDate, 'dateShort') : '—'}
                </Detail>
                <Detail icon={Wallet} label={t('facilities.fieldAcquisitionValue')}>
                  {asset.acquisitionValue !== null ? formatCurrency(asset.acquisitionValue) : '—'}
                </Detail>
                {asset.serialNumber ? (
                  <Detail icon={Hash} label={t('facilities.fieldSerialNumber')}>
                    <span className="font-mono">{asset.serialNumber}</span>
                  </Detail>
                ) : null}
                {asset.notes ? (
                  <Detail icon={ClipboardList} label={t('facilities.fieldNotes')} wide>
                    <span className="whitespace-pre-line">{asset.notes}</span>
                  </Detail>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Section title={t('facilities.loansTitle')} icon={HandHelping}>
            {openLoan ? (
              <div
                data-tone={openLoan.isOverdue ? 'danger' : 'info'}
                className="flex items-center gap-3 rounded-xl border border-tone/30 bg-tone-soft/60 p-3"
              >
                <EntityAvatar name={openLoan.borrowerName} src={openLoan.borrower?.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{openLoan.borrowerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('facilities.borrowedOn', { date: formatDate(openLoan.checkedOutAt) })}
                    {openLoan.dueDate
                      ? ` · ${t('facilities.dueOn', { date: formatDate(openLoan.dueDate) })}`
                      : ''}
                    {openLoan.groupName ? ` · ${openLoan.groupName}` : ''}
                  </p>
                </div>
                {canManage ? (
                  <Button size="sm" variant="outline" onClick={() => setReturning(true)}>
                    {t('facilities.markReturned')}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {pastLoans.length === 0 && !openLoan ? (
              <EmptyState
                compact
                icon={HandHelping}
                tone={INVENTORY_TONE}
                title={t('facilities.noLoans')}
                description={canManage ? t('facilities.noLoansManage') : undefined}
              />
            ) : pastLoans.length > 0 ? (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft">
                {pastLoans.map((loan) => (
                  <li key={loan.id} className="flex items-center gap-3 px-4 py-3">
                    <EntityAvatar name={loan.borrowerName} src={loan.borrower?.photoUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{loan.borrowerName}</p>
                      <p className="text-xs text-muted-foreground tabular">
                        {formatDate(loan.checkedOutAt, 'dayMonth')} –{' '}
                        {formatDate(loan.returnedAt, 'dateShort')}
                      </p>
                    </div>
                    {loan.conditionIn ? <ConditionBadge condition={loan.conditionIn} /> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>

          <Section
            title={t('facilities.maintenanceTitle')}
            icon={Wrench}
            description={
              maintenanceCost > 0
                ? t('facilities.maintenanceTotal', { amount: formatCurrency(maintenanceCost) })
                : undefined
            }
            action={
              canManage ? (
                <Button size="sm" variant="ghost" onClick={() => setLogging(true)}>
                  {t('common.add')}
                </Button>
              ) : null
            }
          >
            {maintenance.length === 0 ? (
              <EmptyState
                compact
                icon={Wrench}
                tone={INVENTORY_TONE}
                title={t('facilities.noMaintenance')}
                description={canManage ? t('facilities.noMaintenanceManage') : undefined}
              />
            ) : (
              <Timeline>
                {maintenance.map((entry, index) => {
                  const KindIcon = MAINTENANCE_KIND_ICONS[entry.kind];
                  return (
                    <TimelineItem
                      key={entry.id}
                      last={index === maintenance.length - 1}
                      icon={KindIcon}
                      tone={entry.kind === 'repair' ? 'amber' : INVENTORY_TONE}
                      title={localize(MAINTENANCE_KIND_LABELS[entry.kind], locale)}
                      time={formatDate(entry.date, 'dateShort')}
                    >
                      <p className="text-sm whitespace-pre-line">{entry.description}</p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {entry.cost !== null ? <span>{formatCurrency(entry.cost)}</span> : null}
                        {entry.performedBy ? <span>{entry.performedBy}</span> : null}
                        {entry.nextDueDate ? (
                          <span>
                            {t('facilities.nextService', { date: formatDate(entry.nextDueDate) })}
                          </span>
                        ) : null}
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => setRemovingEntry(entry.id)}
                            className="font-medium text-destructive underline-offset-2 hover:underline"
                          >
                            {t('common.remove')}
                          </button>
                        ) : null}
                      </p>
                    </TimelineItem>
                  );
                })}
              </Timeline>
            )}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-4">
              <QrDisplay
                value={assetUrl}
                size={160}
                caption={
                  <>
                    <span className="block font-mono font-semibold text-foreground">{asset.code}</span>
                    {t('facilities.qrCaption')}
                  </>
                }
                downloadName={asset.code}
              />
            </CardContent>
          </Card>
          <p className="px-1 text-xs text-muted-foreground">
            {t('facilities.updatedAt', { date: formatDateTime(asset.updatedAt) })}
            {' · '}
            {localize(ASSET_CONDITION_LABELS[asset.condition], locale)}
          </p>
        </aside>
      </div>

      {canManage ? (
        <>
          <CheckOutSheet asset={asset} open={lending} onOpenChange={setLending} />
          <ReturnSheet loan={openLoan} open={returning} onOpenChange={setReturning} />
          <MaintenanceSheet asset={asset} open={logging} onOpenChange={setLogging} />
        </>
      ) : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('facilities.deleteAssetTitle', { name: asset.name })}
        description={
          openLoan ? t('facilities.deleteAssetOnLoan') : t('facilities.deleteAssetBody')
        }
        confirmLabel={t('facilities.deleteAsset')}
        confirmText={asset.code}
        loading={remove.isPending}
        onConfirm={async () => {
          if (await remove.run(asset.id)) {
            setDeleting(false);
            void navigate(`${base}/facilities/inventory`, { replace: true });
          }
        }}
      />
      <ConfirmDialog
        open={removingEntry !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingEntry(null);
        }}
        title={t('facilities.deleteMaintenanceTitle')}
        description={t('facilities.deleteMaintenanceBody')}
        confirmLabel={t('common.remove')}
        loading={removeEntry.isPending}
        onConfirm={async () => {
          if (removingEntry && (await removeEntry.run(removingEntry))) setRemovingEntry(null);
        }}
      />
    </Page>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
  wide = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'flex gap-3 sm:col-span-2' : 'flex gap-3'}>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium text-pretty">{children}</dd>
      </div>
    </div>
  );
}
