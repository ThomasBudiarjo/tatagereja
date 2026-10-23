import {
  BULLETIN_STATUS_LABELS,
  canManageBulletins,
  localize,
  type BulletinStatus,
  type BulletinSummary,
} from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FilePlus2, Layers, Newspaper } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonCards } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/states';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { bulletinsQuery } from './api';
import { BULLETIN_TONE } from './bulletin-lib';

const PAGE_SIZE = 12;

/** Warta Jemaat: the newest issue first, earlier ones below. Editors also see drafts. */
export function BulletinsPage() {
  const { churchId, base, access } = useChurch();
  const { t } = useI18n();
  const manager = canManageBulletins(access);
  const [state, setState, reset] = useUrlState({ status: '', q: '', page: 1 });
  const status =
    manager && (state.status === 'draft' || state.status === 'published')
      ? (state.status as BulletinStatus)
      : undefined;
  const query = useQuery(
    bulletinsQuery(churchId, {
      status,
      q: state.q || undefined,
      page: state.page,
      limit: PAGE_SIZE,
    }),
  );
  const items = query.data?.items ?? [];
  // The newest published issue leads; drafts and earlier issues follow.
  const featured =
    state.page === 1 && !state.q && !status
      ? items.find((item) => item.status === 'published')
      : undefined;
  const latest = featured;
  const rest = items.filter((item) => item !== featured);

  return (
    <Page>
      <PageHeader
        title={t('comms.bulletins')}
        description={t('comms.bulletinsDescription')}
        icon={Newspaper}
        tone={BULLETIN_TONE}
        actions={
          manager ? (
            <Button asChild size="sm">
              <Link to={`${base}/bulletins/new`} aria-label={t('comms.bulletinNew')}>
                <FilePlus2 />
                <span className="hidden sm:inline">{t('comms.bulletinNew')}</span>
              </Link>
            </Button>
          ) : null
        }
      />
      {manager ? (
        <Tabs
          value={status ?? 'all'}
          onValueChange={(value) =>
            setState({ status: value === 'all' ? '' : value }, { push: true })
          }
        >
          <TabsList variant="underline">
            <TabsTrigger value="all">{t('comms.bulletinTabAll')}</TabsTrigger>
            <TabsTrigger value="published">{t('comms.bulletinTabPublished')}</TabsTrigger>
            <TabsTrigger value="draft">{t('comms.bulletinTabDrafts')}</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('comms.bulletinSearch'),
        }}
        onReset={() => reset(['status'])}
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
      ) : items.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          tone={BULLETIN_TONE}
          title={state.q ? t('comms.bulletinNoneFound') : t('comms.bulletinEmpty')}
          description={
            state.q
              ? t('common.noResultsHint')
              : manager
                ? t('comms.bulletinEmptyEditor')
                : t('comms.bulletinEmptyMember')
          }
          action={
            manager && !state.q ? (
              <Button asChild>
                <Link to={`${base}/bulletins/new`}>
                  <FilePlus2 />
                  {t('comms.bulletinNew')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-4" aria-busy={query.isFetching || undefined}>
          {latest ? <BulletinHero bulletin={latest} to={`${base}/bulletins/${latest.id}`} /> : null}
          {rest.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {rest.map((bulletin) =>
                bulletin ? (
                  <BulletinCard
                    key={bulletin.id}
                    bulletin={bulletin}
                    to={`${base}/bulletins/${bulletin.id}`}
                  />
                ) : null,
              )}
            </div>
          ) : null}
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => {
              setState({ page });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      )}
    </Page>
  );
}

function StatusChip({ status }: { status: BulletinStatus }) {
  const { locale } = useI18n();
  return (
    <StatusBadge tone={status === 'published' ? 'success' : 'warning'} dot size="sm">
      {localize(BULLETIN_STATUS_LABELS[status], locale)}
    </StatusBadge>
  );
}

/** The newest issue, large, the way a printed Warta lies on the pew. */
function BulletinHero({ bulletin, to }: { bulletin: BulletinSummary; to: string }) {
  const { t, formatDate } = useI18n();
  return (
    <Link
      to={to}
      className="group pressable relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft outline-none transition-colors hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:flex-row"
    >
      {bulletin.coverImageUrl ? (
        <img
          src={bulletin.coverImageUrl}
          alt=""
          className="aspect-[16/9] w-full object-cover sm:aspect-auto sm:w-64"
        />
      ) : (
        <div
          data-tone={BULLETIN_TONE}
          className="flex items-center justify-center bg-tone-soft p-6 text-tone-ink sm:w-56"
          aria-hidden
        >
          <div className="text-center">
            <p className="text-overline opacity-80">{formatDate(bulletin.issueDate, 'weekday')}</p>
            <p className="text-5xl leading-none font-bold tabular">
              {formatDate(bulletin.issueDate, { options: { day: 'numeric' } })}
            </p>
            <p className="mt-1 text-sm font-semibold capitalize">
              {formatDate(bulletin.issueDate, 'monthYear')}
            </p>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span data-tone={BULLETIN_TONE} className="text-overline text-tone-ink">
            {t('comms.bulletinLatest')}
          </span>
          {bulletin.status !== 'published' ? <StatusChip status={bulletin.status} /> : null}
        </div>
        <h2 className="text-xl font-bold tracking-tight text-balance">{bulletin.title}</h2>
        {bulletin.theme ? (
          <p className="text-pretty text-muted-foreground italic">“{bulletin.theme}”</p>
        ) : null}
        <p className="mt-auto flex items-center gap-2 pt-2 text-sm font-semibold text-primary">
          {t('comms.bulletinRead')}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </p>
      </div>
    </Link>
  );
}

function BulletinCard({ bulletin, to }: { bulletin: BulletinSummary; to: string }) {
  const { t, formatDate } = useI18n();
  return (
    <Link
      to={to}
      className="group pressable flex items-center gap-3.5 rounded-xl border border-border/70 bg-card p-3.5 shadow-soft outline-none transition-colors hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <span
        data-tone={bulletin.status === 'published' ? BULLETIN_TONE : 'neutral'}
        className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-tone-soft py-2 text-tone-ink"
        aria-hidden
      >
        <span className="text-xl leading-tight font-bold tabular">
          {formatDate(bulletin.issueDate, { options: { day: 'numeric' } })}
        </span>
        <span className="text-[10px] font-semibold uppercase">
          {formatDate(bulletin.issueDate, { options: { month: 'short' } })}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{bulletin.title}</span>
        <span
          className={cn('block truncate text-sm text-muted-foreground', bulletin.theme && 'italic')}
        >
          {bulletin.theme ?? formatDate(bulletin.issueDate, 'dateLong')}
        </span>
        <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {bulletin.status !== 'published' ? <StatusChip status={bulletin.status} /> : null}
          <span className="inline-flex items-center gap-1">
            <Layers className="size-3.5" aria-hidden />
            {t('comms.bulletinSections', { count: bulletin.sectionCount })}
          </span>
        </span>
      </span>
    </Link>
  );
}
