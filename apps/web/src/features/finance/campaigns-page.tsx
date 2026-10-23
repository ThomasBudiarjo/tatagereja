import {
  CAMPAIGN_STATUS_LABELS,
  financeCampaignInputSchema,
  financePledgeInputSchema,
  fullName,
  has,
  localize,
  progressRatio,
  type FinanceCampaign,
  type FinanceCampaignInput,
  type FinancePledge,
  type FinancePledgeInput,
} from '@tatagereja/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Flag, HandHeart, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import type { z } from 'zod';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DataList } from '@/components/ui/data-list';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { SkeletonCards, SkeletonList } from '@/components/ui/skeleton';
import { ErrorState, NoAccessState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { useUrlState } from '@/lib/use-url-state';
import { campaignQuery, campaigns, campaignsQuery, useDeletePledge, useSavePledge } from './api';
import { FinanceNav, Meter, Money, PersonCombobox } from './components';
import { todayIn, useFinanceSetup, withCurrent, useFinanceResolver } from './helpers';

export function CampaignsPage() {
  const { t } = useI18n();
  const { churchId, base, access } = useChurch();
  const [state, setState] = useUrlState({ status: 'active' });
  const query = useQuery(
    campaignsQuery(churchId, state.status === 'all' ? undefined : state.status),
  );
  const [creating, setCreating] = useState(false);
  const canManage = has(access, 'finance.manage');
  return (
    <Page size="wide">
      <PageHeader
        icon={Flag}
        tone="amber"
        title={t('finance.navCampaigns')}
        description={t('finance.campaignsDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navCampaigns') },
        ]}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              <span className="hidden sm:inline">{t('finance.newCampaign')}</span>
              <span className="sm:hidden">{t('common.add')}</span>
            </Button>
          ) : null
        }
      />
      <FinanceNav />
      <Segmented
        aria-label={t('finance.status')}
        className="sm:max-w-sm"
        value={state.status}
        onChange={(status) => setState({ status })}
        options={[
          { value: 'active', label: t('finance.campaignsActive') },
          { value: 'closed', label: t('finance.campaignsClosed') },
          { value: 'all', label: t('common.all') },
        ]}
      />
      {query.isPending ? (
        <SkeletonCards count={3} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Flag}
          tone="amber"
          title={t('finance.noCampaignsTitle')}
          description={t('finance.noCampaignsDescription')}
          action={
            canManage ? (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t('finance.newCampaign')}
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.items.map((campaign) => (
            <li key={campaign.id}>
              <CampaignCard campaign={campaign} to={`${base}/finance/campaigns/${campaign.id}`} />
            </li>
          ))}
        </ul>
      )}
      <CampaignDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}

function CampaignCard({ campaign, to }: { campaign: FinanceCampaign; to: string }) {
  const { t, locale, formatPercent, formatDate } = useI18n();
  const ratio = progressRatio(campaign.targetAmount, campaign.receivedAmount);
  return (
    <Link
      to={to}
      className="pressable flex h-full flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-soft outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{campaign.name}</p>
          <p className="text-xs text-muted-foreground">
            {campaign.fundName} · {formatDate(campaign.startDate, 'dateShort')}
            {campaign.endDate ? ` – ${formatDate(campaign.endDate, 'dateShort')}` : ''}
          </p>
        </div>
        <StatusBadge tone={campaign.status === 'active' ? 'success' : 'neutral'} dot size="sm">
          {localize(CAMPAIGN_STATUS_LABELS[campaign.status], locale)}
        </StatusBadge>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <Money value={campaign.receivedAmount} className="text-xl" />
        <span className="text-sm font-semibold text-muted-foreground tabular">
          {formatPercent(ratio)}
        </span>
      </div>
      <Meter
        value={ratio}
        tone="amber"
        label={t('finance.campaignProgress', { name: campaign.name })}
      />
      <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
        {t('finance.target')}
        <Money value={campaign.targetAmount} className="text-xs" />
        <span aria-hidden>·</span>
        {t('finance.pledgeCountValue', { count: campaign.pledgeCount })}
      </p>
    </Link>
  );
}

export function CampaignPage() {
  const { t, locale, formatCurrency, formatPercent, formatDate } = useI18n();
  const { churchId, base, access } = useChurch();
  const navigate = useNavigate();
  const { campaignId = '' } = useParams();
  const query = useQuery(campaignQuery(churchId, campaignId));
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pledgeDialog, setPledgeDialog] = useState<{ pledge?: FinancePledge } | null>(null);
  const [removing, setRemoving] = useState<FinancePledge | null>(null);
  const remove = campaigns.useDelete(churchId);
  const deleteCampaign = useMutationToast(remove, { success: t('finance.campaignDeleted') });
  const deletePledge = useMutationToast(useDeletePledge(churchId, campaignId), {
    success: t('finance.pledgeRemoved'),
  });
  const crumbs = [
    { label: t('finance.nav'), to: `${base}/finance` },
    { label: t('finance.navCampaigns'), to: `${base}/finance/campaigns` },
  ];
  const canManage = has(access, 'finance.manage');
  const canRecord = has(access, 'finance.record');

  if (query.isPending) {
    return (
      <Page>
        <PageHeader title={t('finance.navCampaigns')} breadcrumbs={crumbs} />
        <SkeletonCards count={1} className="sm:grid-cols-1 lg:grid-cols-1" />
        <SkeletonList rows={4} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <PageHeader title={t('finance.navCampaigns')} breadcrumbs={crumbs} />
        {isApiClientError(query.error) && query.error.status === 404 ? (
          <NoAccessState
            title={t('common.notFoundTitle')}
            description={t('finance.campaignMissing')}
          />
        ) : (
          <ErrorState
            error={query.error}
            message={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        )}
      </Page>
    );
  }
  const { campaign, pledges } = query.data;
  const ratio = progressRatio(campaign.targetAmount, campaign.receivedAmount);
  const pledgedRatio = progressRatio(campaign.targetAmount, campaign.pledgedAmount);

  return (
    <Page>
      <PageHeader
        icon={Flag}
        tone="amber"
        eyebrow={campaign.fundName}
        title={campaign.name}
        description={campaign.description ?? undefined}
        breadcrumbs={[...crumbs, { label: campaign.name }]}
        actions={
          canManage ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              <span className="max-sm:sr-only">{t('common.edit')}</span>
            </Button>
          ) : null
        }
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-overline text-muted-foreground">{t('finance.received')}</p>
              <p className="text-3xl font-bold tracking-tight tabular">
                {formatCurrency(campaign.receivedAmount)}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('finance.ofTarget', {
                  target: formatCurrency(campaign.targetAmount),
                  percent: formatPercent(ratio),
                })}
              </p>
            </div>
            <StatusBadge tone={campaign.status === 'active' ? 'success' : 'neutral'} dot>
              {localize(CAMPAIGN_STATUS_LABELS[campaign.status], locale)}
            </StatusBadge>
          </div>
          <Meter
            value={ratio}
            tone="amber"
            label={t('finance.campaignProgress', { name: campaign.name })}
            className="h-3"
          />
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('finance.pledged')}</p>
              <Money value={campaign.pledgedAmount} />
              <p className="text-xs text-muted-foreground">{formatPercent(pledgedRatio)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('finance.pledgeCount')}</p>
              <p className="font-semibold tabular">{campaign.pledgeCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('finance.period')}</p>
              <p className="font-semibold">
                {formatDate(campaign.startDate, 'dateShort')}
                {campaign.endDate ? ` – ${formatDate(campaign.endDate, 'dateShort')}` : ''}
              </p>
            </div>
          </div>
          {has(access, 'finance.view') ? (
            <Button asChild variant="link" className="w-fit px-0">
              <Link to={`${base}/finance/giving?campaignId=${campaign.id}`}>
                {t('finance.seeCampaignGifts')}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Section
        title={t('finance.pledges')}
        description={t('finance.pledgesHint')}
        action={
          canRecord ? (
            <Button size="sm" onClick={() => setPledgeDialog({})}>
              <Plus />
              {t('finance.addPledge')}
            </Button>
          ) : null
        }
      >
        {pledges.length === 0 ? (
          <EmptyState
            compact
            icon={HandHeart}
            tone="amber"
            title={t('finance.noPledgesTitle')}
            description={t('finance.noPledgesDescription')}
          />
        ) : (
          <DataList
            items={pledges}
            getKey={(pledge) => pledge.id}
            leading={(pledge) => (
              <EntityAvatar
                name={pledge.person ? fullName(pledge.person) : (pledge.donorName ?? '?')}
                src={pledge.person?.photoUrl}
              />
            )}
            title={(pledge) =>
              pledge.person ? fullName(pledge.person) : (pledge.donorName ?? '—')
            }
            subtitle={(pledge) => (
              <span className="flex items-center gap-2">
                <Meter
                  value={progressRatio(pledge.amount, pledge.paidAmount)}
                  tone="amber"
                  label={t('finance.pledgeProgress')}
                  className="w-20"
                />
                {t('finance.paidOf', {
                  paid: formatCurrency(pledge.paidAmount, { compact: true }),
                })}
              </span>
            )}
            trailing={(pledge) => <Money value={pledge.amount} />}
            actions={(pledge) => [
              {
                id: 'edit',
                label: t('common.edit'),
                icon: Pencil,
                hidden: !canRecord,
                onSelect: () => setPledgeDialog({ pledge }),
              },
              {
                id: 'remove',
                label: t('common.remove'),
                icon: Trash2,
                destructive: true,
                hidden: !canRecord,
                onSelect: () => setRemoving(pledge),
              },
            ]}
          />
        )}
      </Section>

      {canManage ? (
        <div className="flex justify-end">
          <Button variant="ghost" className="text-destructive" onClick={() => setDeleting(true)}>
            <Trash2 />
            {t('finance.deleteCampaign')}
          </Button>
        </div>
      ) : null}

      <CampaignDialog open={editing} onOpenChange={setEditing} campaign={campaign} />
      <PledgeDialog
        open={!!pledgeDialog}
        onOpenChange={(open) => !open && setPledgeDialog(null)}
        campaignId={campaign.id}
        pledge={pledgeDialog?.pledge}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('finance.removePledgeTitle')}
        description={t('finance.removePledgeDescription')}
        confirmLabel={t('common.remove')}
        loading={deletePledge.isPending}
        onConfirm={async () => {
          if (removing && (await deletePledge.run(removing.id))) setRemoving(null);
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('finance.deleteCampaignTitle', { name: campaign.name })}
        description={t('finance.deleteCampaignDescription')}
        confirmLabel={t('common.delete')}
        confirmText={campaign.name}
        loading={deleteCampaign.isPending}
        onConfirm={async () => {
          if (await deleteCampaign.run(campaign.id))
            navigate(`${base}/finance/campaigns`, { replace: true });
        }}
      />
    </Page>
  );
}

type CampaignForm = z.input<typeof financeCampaignInputSchema>;

function CampaignDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: FinanceCampaign;
}) {
  const { t, locale } = useI18n();
  const { churchId, church } = useChurch();
  const setup = useFinanceSetup();
  const form = useForm<CampaignForm, unknown, FinanceCampaignInput>({
    resolver: useFinanceResolver(zodResolver(financeCampaignInputSchema)),
    values: {
      name: campaign?.name ?? '',
      description: campaign?.description ?? '',
      fundId:
        campaign?.fundId ??
        setup.activeFunds.find((fund) => fund.name === 'Pembangunan')?.id ??
        setup.activeFunds[0]?.id ??
        '',
      targetAmount: campaign?.targetAmount ?? 0,
      startDate: campaign?.startDate ?? todayIn(church.timezone),
      endDate: campaign?.endDate ?? '',
      status: campaign?.status ?? 'active',
    },
  });
  const save = useMutationToast(campaigns.useSave(churchId), {
    success: (data) => t('finance.campaignSaved', { name: data.campaign.name }),
    form,
  });
  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {campaign ? t('finance.editCampaign') : t('finance.newCampaign')}
          </DialogTitle>
          <DialogDescription>{t('finance.campaignDialogDescription')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex min-h-0 flex-col gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            if (await save.run({ ...values, id: campaign?.id })) onOpenChange(false);
          })}
        >
          <DialogBody className="flex flex-col gap-4">
            <Field
              label={t('finance.name')}
              htmlFor="campaign-name"
              error={errors.name?.message}
              required
            >
              <Input
                id="campaign-name"
                autoFocus
                placeholder={t('finance.campaignNamePlaceholder')}
                {...form.register('name')}
              />
            </Field>
            <Controller
              control={form.control}
              name="targetAmount"
              render={({ field }) => (
                <Field
                  label={t('finance.target')}
                  htmlFor="campaign-target"
                  error={errors.targetAmount?.message}
                  required
                >
                  <CurrencyInput
                    id="campaign-target"
                    value={field.value || null}
                    onChange={(value) => field.onChange(value ?? 0)}
                  />
                </Field>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('finance.fund')} htmlFor="campaign-fund">
                <Select id="campaign-fund" {...form.register('fundId')}>
                  {withCurrent(setup.activeFunds, setup.funds, campaign?.fundId).map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('finance.status')} htmlFor="campaign-status">
                <Select id="campaign-status" {...form.register('status')}>
                  {(['active', 'closed'] as const).map((value) => (
                    <option key={value} value={value}>
                      {localize(CAMPAIGN_STATUS_LABELS[value], locale)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t('finance.startDate')}
                htmlFor="campaign-start"
                error={errors.startDate?.message}
              >
                <Input id="campaign-start" type="date" {...form.register('startDate')} />
              </Field>
              <Field
                label={t('finance.endDate')}
                htmlFor="campaign-end"
                error={errors.endDate?.message}
              >
                <Input id="campaign-end" type="date" {...form.register('endDate')} />
              </Field>
            </div>
            <Field label={t('finance.descriptionField')} htmlFor="campaign-description">
              <Textarea
                id="campaign-description"
                className="min-h-20"
                {...form.register('description')}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

type PledgeForm = z.input<typeof financePledgeInputSchema>;

function PledgeDialog({
  open,
  onOpenChange,
  campaignId,
  pledge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  pledge?: FinancePledge;
}) {
  const { t } = useI18n();
  const { churchId } = useChurch();
  const [mode, setMode] = useState<'person' | 'name'>(pledge && !pledge.person ? 'name' : 'person');
  const form = useForm<PledgeForm, unknown, FinancePledgeInput>({
    resolver: useFinanceResolver(zodResolver(financePledgeInputSchema)),
    values: {
      personId: pledge?.person?.id ?? null,
      donorName: pledge?.donorName ?? '',
      amount: pledge?.amount ?? 0,
      note: pledge?.note ?? '',
    },
  });
  const save = useMutationToast(useSavePledge(churchId, campaignId), {
    success: t('finance.pledgeSaved'),
    form,
  });
  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pledge ? t('finance.editPledge') : t('finance.addPledge')}</DialogTitle>
          <DialogDescription>{t('finance.pledgeDialogDescription')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(async (values) => {
            const body = {
              ...values,
              personId: mode === 'person' ? values.personId : null,
              donorName: mode === 'name' ? values.donorName : null,
            };
            if (await save.run({ ...body, id: pledge?.id })) onOpenChange(false);
          })}
        >
          <Segmented
            aria-label={t('finance.giver')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'person', label: t('finance.giverMember') },
              { value: 'name', label: t('finance.giverName') },
            ]}
          />
          {mode === 'person' ? (
            <Controller
              control={form.control}
              name="personId"
              render={({ field }) => (
                <Field
                  label={t('finance.giver')}
                  htmlFor="pledge-person"
                  error={errors.donorName?.message}
                >
                  <PersonCombobox
                    id="pledge-person"
                    value={field.value ?? null}
                    selected={pledge?.person ?? null}
                    onChange={(value) => field.onChange(value)}
                  />
                </Field>
              )}
            />
          ) : (
            <Field
              label={t('finance.giverName')}
              htmlFor="pledge-name"
              error={errors.donorName?.message}
            >
              <Input id="pledge-name" {...form.register('donorName')} />
            </Field>
          )}
          <Controller
            control={form.control}
            name="amount"
            render={({ field }) => (
              <Field
                label={t('finance.pledgeAmount')}
                htmlFor="pledge-amount"
                error={errors.amount?.message}
                required
              >
                <CurrencyInput
                  id="pledge-amount"
                  value={field.value || null}
                  onChange={(value) => field.onChange(value ?? 0)}
                />
              </Field>
            )}
          />
          <Field label={t('finance.notes')} htmlFor="pledge-note">
            <Input id="pledge-note" {...form.register('note')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
