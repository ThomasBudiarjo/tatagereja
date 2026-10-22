import {
  FINANCE_ACCOUNT_TYPE_LABELS,
  localize,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceCategoryKind,
  type FinanceFund,
} from '@tatagereja/shared';
import {
  Banknote,
  FolderTree,
  Landmark,
  Lock,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DataList } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { TabsContent, TabsList, TabsTrigger, UrlTabs } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { accounts, categories, funds } from './api';
import { FinanceNav, Money } from './components';
import { useFinanceSetup } from './helpers';
import { AccountDialog, CategoryDialog, DefaultsDialog, FundDialog } from './setup-dialogs';

type Editing =
  | { kind: 'fund'; item?: FinanceFund }
  | { kind: 'account'; item?: FinanceAccount }
  | { kind: 'category'; item?: FinanceCategory; categoryKind: FinanceCategoryKind };

type Removing = { kind: 'fund' | 'account' | 'category'; id: string; name: string };

export function FinanceSettingsPage() {
  const { t, locale } = useI18n();
  const { base, churchId } = useChurch();
  const setup = useFinanceSetup();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<Removing | null>(null);
  const [defaults, setDefaults] = useState(false);
  const deleteFund = useMutationToast(funds.useDelete(churchId), { success: t('finance.deleted') });
  const deleteAccount = useMutationToast(accounts.useDelete(churchId), {
    success: t('finance.deleted'),
  });
  const deleteCategory = useMutationToast(categories.useDelete(churchId), {
    success: t('finance.deleted'),
  });
  const remover = removing
    ? { fund: deleteFund, account: deleteAccount, category: deleteCategory }[removing.kind]
    : null;

  const inactive = (active: boolean) =>
    active ? null : (
      <StatusBadge tone="neutral" size="sm">
        {t('finance.inactive')}
      </StatusBadge>
    );

  return (
    <Page size="wide">
      <PageHeader
        icon={Settings2}
        tone="emerald"
        title={t('finance.settingsTitle')}
        description={t('finance.settingsDescription')}
        breadcrumbs={[
          { label: t('finance.nav'), to: `${base}/finance` },
          { label: t('finance.navSettings') },
        ]}
        actions={
          <Button variant="outline" onClick={() => setDefaults(true)}>
            <Sparkles />
            <span className="max-sm:sr-only">{t('finance.setupStart')}</span>
          </Button>
        }
      />
      <FinanceNav />
      {setup.query.isPending ? (
        <SkeletonList rows={6} />
      ) : setup.query.isError ? (
        <ErrorState
          error={setup.query.error}
          message={getErrorMessage(setup.query.error)}
          onRetry={() => void setup.query.refetch()}
        />
      ) : (
        <UrlTabs defaultValue="funds" values={['funds', 'accounts', 'categories']}>
          <TabsList>
            <TabsTrigger value="funds">{t('finance.funds')}</TabsTrigger>
            <TabsTrigger value="accounts">{t('finance.accounts')}</TabsTrigger>
            <TabsTrigger value="categories">{t('finance.categories')}</TabsTrigger>
          </TabsList>

          <TabsContent value="funds" className="flex flex-col gap-3">
            <Section
              description={t('finance.fundsHint')}
              action={
                <Button size="sm" onClick={() => setEditing({ kind: 'fund' })}>
                  <Plus />
                  {t('finance.newFund')}
                </Button>
              }
            >
              {setup.funds.length === 0 ? (
                <EmptyState
                  compact
                  icon={FolderTree}
                  tone="emerald"
                  title={t('finance.noFundsTitle')}
                  description={t('finance.noFundsDescription')}
                />
              ) : (
                <DataList
                  items={setup.funds}
                  getKey={(fund) => fund.id}
                  leading={(fund) => (
                    <ToneIcon
                      icon={fund.isRestricted ? Lock : FolderTree}
                      tone={fund.isRestricted ? 'amber' : 'emerald'}
                      size="sm"
                    />
                  )}
                  title={(fund) => (
                    <span className="flex items-center gap-2">
                      {fund.name}
                      {fund.code ? (
                        <span className="text-xs text-muted-foreground">{fund.code}</span>
                      ) : null}
                    </span>
                  )}
                  subtitle={(fund) =>
                    fund.isRestricted
                      ? t('finance.restricted')
                      : (fund.description ?? t('finance.unrestricted'))
                  }
                  trailing={(fund) => (
                    <>
                      {inactive(fund.isActive)}
                      <Money value={fund.balance} />
                    </>
                  )}
                  actions={(fund) => [
                    {
                      id: 'edit',
                      label: t('common.edit'),
                      icon: Pencil,
                      onSelect: () => setEditing({ kind: 'fund', item: fund }),
                    },
                    {
                      id: 'delete',
                      label: t('common.delete'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setRemoving({ kind: 'fund', id: fund.id, name: fund.name }),
                    },
                  ]}
                />
              )}
            </Section>
          </TabsContent>

          <TabsContent value="accounts" className="flex flex-col gap-3">
            <Section
              description={t('finance.accountsHint')}
              action={
                <Button size="sm" onClick={() => setEditing({ kind: 'account' })}>
                  <Plus />
                  {t('finance.newAccount')}
                </Button>
              }
            >
              {setup.accounts.length === 0 ? (
                <EmptyState
                  compact
                  icon={Landmark}
                  tone="sky"
                  title={t('finance.noAccountsTitle')}
                  description={t('finance.noAccountsDescription')}
                />
              ) : (
                <DataList
                  items={setup.accounts}
                  getKey={(account) => account.id}
                  leading={(account) => (
                    <ToneIcon
                      icon={account.type === 'cash' ? Banknote : Landmark}
                      tone={account.type === 'cash' ? 'emerald' : 'sky'}
                      size="sm"
                    />
                  )}
                  title={(account) => account.name}
                  subtitle={(account) =>
                    [
                      localize(FINANCE_ACCOUNT_TYPE_LABELS[account.type], locale),
                      account.bankName,
                      account.accountNumber,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  }
                  trailing={(account) => (
                    <>
                      {inactive(account.isActive)}
                      <Money value={account.balance} />
                    </>
                  )}
                  actions={(account) => [
                    {
                      id: 'edit',
                      label: t('common.edit'),
                      icon: Pencil,
                      onSelect: () => setEditing({ kind: 'account', item: account }),
                    },
                    {
                      id: 'delete',
                      label: t('common.delete'),
                      icon: Trash2,
                      destructive: true,
                      onSelect: () =>
                        setRemoving({ kind: 'account', id: account.id, name: account.name }),
                    },
                  ]}
                />
              )}
            </Section>
          </TabsContent>

          <TabsContent value="categories" className="flex flex-col gap-6">
            {(['income', 'expense'] as FinanceCategoryKind[]).map((kind) => {
              const items = setup.categories.filter((category) => category.kind === kind);
              return (
                <Section
                  key={kind}
                  title={
                    kind === 'income'
                      ? t('finance.incomeCategories')
                      : t('finance.expenseCategories')
                  }
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing({ kind: 'category', categoryKind: kind })}
                    >
                      <Plus />
                      {t('finance.newCategory')}
                    </Button>
                  }
                >
                  {items.length === 0 ? (
                    <EmptyState
                      compact
                      icon={FolderTree}
                      tone="slate"
                      title={t('finance.noCategoriesTitle')}
                      description={t('finance.noCategoriesDescription')}
                    />
                  ) : (
                    <DataList
                      items={items}
                      getKey={(category) => category.id}
                      title={(category) => category.name}
                      subtitle={(category) => category.code ?? undefined}
                      trailing={(category) => inactive(category.isActive)}
                      actions={(category) => [
                        {
                          id: 'edit',
                          label: t('common.edit'),
                          icon: Pencil,
                          onSelect: () =>
                            setEditing({
                              kind: 'category',
                              item: category,
                              categoryKind: category.kind,
                            }),
                        },
                        {
                          id: 'delete',
                          label: t('common.delete'),
                          icon: Trash2,
                          destructive: true,
                          onSelect: () =>
                            setRemoving({ kind: 'category', id: category.id, name: category.name }),
                        },
                      ]}
                    />
                  )}
                </Section>
              );
            })}
          </TabsContent>
        </UrlTabs>
      )}

      <FundDialog
        open={editing?.kind === 'fund'}
        onOpenChange={(open) => !open && setEditing(null)}
        fund={editing?.kind === 'fund' ? editing.item : undefined}
      />
      <AccountDialog
        open={editing?.kind === 'account'}
        onOpenChange={(open) => !open && setEditing(null)}
        account={editing?.kind === 'account' ? editing.item : undefined}
      />
      <CategoryDialog
        open={editing?.kind === 'category'}
        onOpenChange={(open) => !open && setEditing(null)}
        category={editing?.kind === 'category' ? editing.item : undefined}
        kind={editing?.kind === 'category' ? editing.categoryKind : 'expense'}
      />
      <DefaultsDialog open={defaults} onOpenChange={setDefaults} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('finance.deleteTitle', { name: removing?.name ?? '' })}
        description={t('finance.deleteDescription')}
        confirmLabel={t('common.delete')}
        loading={remover?.isPending}
        onConfirm={async () => {
          if (removing && remover && (await remover.run(removing.id))) setRemoving(null);
        }}
      />
    </Page>
  );
}
