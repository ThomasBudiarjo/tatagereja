import { canManageInventory, type AssetLoan } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { HandHelping, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { DataList } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import type { Tone } from '@/components/ui/tone';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { loansQuery } from './api';
import { ReturnSheet } from './asset-dialogs';
import { INVENTORY_TONE } from './facilities-lib';
import { ConditionBadge, FacilitiesNav } from './facilities-ui';

const PAGE_SIZE = 30;
const SCOPES = ['open', 'overdue', 'returned', 'all'] as const;
type Scope = (typeof SCOPES)[number];

const SCOPE_LABELS: Record<Scope, MessageKey> = {
  open: 'facilities.loansOpen',
  overdue: 'facilities.loansOverdue',
  returned: 'facilities.loansReturned',
  all: 'facilities.loansAll',
};

/** Who has what, what is late, and what came back. */
export function LoansPage() {
  const { churchId, base, access } = useChurch();
  const { t, formatDate } = useI18n();
  /** The due state of an open loan, as a badge on wide screens and a lead-in on phones. */
  const dueOf = (loan: AssetLoan): { tone: Tone; label: string } | null => {
    if (loan.returnedAt) return null;
    if (loan.isOverdue) {
      return {
        tone: 'danger',
        label: t('facilities.overdueSinceShort', { date: formatDate(loan.dueDate, 'dayMonth') }),
      };
    }
    return loan.dueDate
      ? {
          tone: 'info',
          label: t('facilities.dueOn', { date: formatDate(loan.dueDate, 'dayMonth') }),
        }
      : { tone: 'neutral', label: t('facilities.noDueDate') };
  };
  const canManage = canManageInventory(access);
  const [state, setState, reset] = useUrlState({ scope: 'open', q: '', page: 1 });
  const scope: Scope = (SCOPES as readonly string[]).includes(state.scope)
    ? (state.scope as Scope)
    : 'open';
  const query = useQuery(
    loansQuery(churchId, { scope, q: state.q || undefined, page: state.page, limit: PAGE_SIZE }),
  );
  const [returning, setReturning] = useState<AssetLoan | null>(null);

  return (
    <Page size="wide">
      <PageHeader
        title={t('facilities.loansPageTitle')}
        description={t('facilities.loansPageDescription')}
        breadcrumbs={[
          { label: t('facilities.nav'), to: `${base}/facilities` },
          { label: t('facilities.loansPageTitle') },
        ]}
      />
      <FacilitiesNav />
      <Tabs value={scope} onValueChange={(value) => setState({ scope: value }, { push: true })}>
        <TabsList variant="underline">
          {SCOPES.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(SCOPE_LABELS[value])}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('facilities.searchLoans'),
        }}
        onReset={() => reset(['scope'])}
      />

      {query.isPending ? (
        <SkeletonList rows={6} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={HandHelping}
          tone={scope === 'overdue' ? 'success' : INVENTORY_TONE}
          title={
            state.q
              ? t('facilities.noLoansFound')
              : scope === 'overdue'
                ? t('facilities.noOverdue')
                : t('facilities.noLoansScope')
          }
          description={state.q ? t('common.noResultsHint') : t('facilities.noLoansScopeBody')}
        />
      ) : (
        <div className="flex flex-col gap-3" aria-busy={query.isFetching || undefined}>
          <DataList
            items={query.data.items}
            getKey={(loan) => loan.id}
            href={(loan) => `${base}/facilities/inventory/${loan.assetId}`}
            leading={(loan) => (
              <EntityAvatar name={loan.borrowerName} src={loan.borrower?.photoUrl} />
            )}
            title={(loan) => (
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate">{loan.assetName}</span>
                <span className="hidden shrink-0 font-mono text-xs font-normal text-muted-foreground sm:inline">
                  {loan.assetCode}
                </span>
              </span>
            )}
            subtitle={(loan) => {
              const due = dueOf(loan);
              return (
                <>
                  {/* Phones have no room for the badge: the due date leads the second line. */}
                  {due ? (
                    <span data-tone={due.tone} className="font-medium text-tone-ink sm:hidden">
                      {due.label}
                      {' · '}
                    </span>
                  ) : null}
                  {[
                    loan.borrowerName,
                    loan.groupName,
                    loan.returnedAt
                      ? t('facilities.returnedOn', {
                          date: formatDate(loan.returnedAt, 'dateShort'),
                        })
                      : t('facilities.borrowedOn', { date: formatDate(loan.checkedOutAt) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </>
              );
            }}
            trailing={(loan) => {
              if (loan.returnedAt) {
                return loan.conditionIn ? <ConditionBadge condition={loan.conditionIn} /> : null;
              }
              const due = dueOf(loan);
              return due ? (
                <span className="hidden sm:contents">
                  <StatusBadge tone={due.tone} size="sm">
                    {due.label}
                  </StatusBadge>
                </span>
              ) : null;
            }}
            actionsLabel={(loan) => t('facilities.loanActions', { name: loan.assetName })}
            actions={(loan) => [
              {
                id: 'return',
                label: t('facilities.markReturned'),
                icon: Undo2,
                hidden: !canManage || !!loan.returnedAt,
                onSelect: () => setReturning(loan),
              },
            ]}
          />
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => {
              setState({ page }, { push: true });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      )}
      <ReturnSheet
        loan={returning}
        open={returning !== null}
        onOpenChange={(open) => {
          if (!open) setReturning(null);
        }}
      />
    </Page>
  );
}
