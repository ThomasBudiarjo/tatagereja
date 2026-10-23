import { can, has, type AnnouncementState } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, SquarePen } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar, type FilterDefinition } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonCards } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { groupsQuery } from '@/features/groups/api';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { announcementsQuery } from './api';
import { ANNOUNCEMENT_TONE } from './announcement-lib';
import { AnnouncementCard } from './announcement-ui';

const PAGE_SIZE = 20;
const TABS = ['all', 'published', 'scheduled', 'draft', 'expired'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, MessageKey> = {
  all: 'announcements.tabAll',
  published: 'announcements.tabPublished',
  scheduled: 'announcements.tabScheduled',
  draft: 'announcements.tabDrafts',
  expired: 'announcements.tabExpired',
};

export function AnnouncementsPage() {
  const { churchId, base, access } = useChurch();
  const { t } = useI18n();
  const [state, setState, reset] = useUrlState({ tab: 'all', q: '', groupId: '', page: 1 });
  // Managers and leaders see drafts and schedules (leaders for their groups); members only news.
  const writer = can.createAnyAnnouncement(access);
  const tab: Tab =
    writer && (TABS as readonly string[]).includes(state.tab) ? (state.tab as Tab) : 'all';
  const query = useQuery(
    announcementsQuery(churchId, {
      q: state.q || undefined,
      groupId: state.groupId || undefined,
      state: tab === 'all' ? undefined : (tab as AnnouncementState),
      page: state.page,
      limit: PAGE_SIZE,
    }),
  );
  const groups = useQuery({
    ...groupsQuery(churchId),
    enabled: has(access, 'groups.view'),
  });
  const filtered = !!(state.q || state.groupId);

  const filters: FilterDefinition[] =
    (groups.data?.items.length ?? 0) > 0
      ? [
          {
            id: 'groupId',
            label: t('announcements.filterGroup'),
            value: state.groupId,
            onChange: (groupId) => setState({ groupId }),
            options: (groups.data?.items ?? []).map((group) => ({
              value: group.id,
              label: group.name,
            })),
          },
        ]
      : [];

  const newButton = writer ? (
    <Button asChild size="sm">
      <Link
        to={`${base}/announcements/new${state.groupId ? `?groupId=${state.groupId}` : ''}`}
        aria-label={t('announcements.new')}
      >
        <SquarePen />
        <span className="hidden sm:inline">{t('announcements.new')}</span>
      </Link>
    </Button>
  ) : null;

  return (
    <Page>
      <PageHeader
        title={t('announcements.title')}
        description={t('announcements.description')}
        icon={Megaphone}
        tone={ANNOUNCEMENT_TONE}
        actions={newButton}
      />
      {writer ? (
        <Tabs value={tab} onValueChange={(value) => setState({ tab: value }, { push: true })}>
          <TabsList variant="underline">
            {TABS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(TAB_LABELS[value])}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('announcements.search'),
        }}
        filters={filters}
        onReset={() => reset(['tab'])}
      />

      {query.isPending ? (
        <SkeletonCards count={4} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          tone={ANNOUNCEMENT_TONE}
          title={filtered ? t('announcements.noneFound') : t('announcements.empty')}
          description={
            filtered
              ? t('common.noResultsHint')
              : writer
                ? t('announcements.emptyWriter')
                : t('announcements.emptyMember')
          }
          action={
            filtered ? (
              <Button variant="outline" onClick={() => reset(['tab'])}>
                {t('common.clearAll')}
              </Button>
            ) : writer ? (
              <Button asChild>
                <Link to={`${base}/announcements/new`}>
                  <SquarePen />
                  {t('announcements.new')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-3" aria-busy={query.isFetching || undefined}>
          {query.data.items.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              to={`${base}/announcements/${announcement.id}`}
              showState={announcement.seenCount !== null}
            />
          ))}
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => {
              setState({ page });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="pt-2"
          />
        </div>
      )}
    </Page>
  );
}
