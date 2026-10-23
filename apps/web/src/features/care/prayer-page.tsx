import {
  canModeratePrayer,
  has,
  isCareTeam,
  type PrayerRequest,
  type PrayerScope,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CircleCheckBig, HandHeart, Inbox, Plus, Sparkles, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonCards, SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { TabsList, TabsTrigger, UrlTabs } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useUrlState } from '@/lib/use-url-state';
import { careOverviewQuery, prayerRequestQuery, prayerRequestsQuery } from './api';
import { CareNav } from './components';
import { AnswerDialog, PrayerCard, PrayerSheet } from './prayer-components';

const PAGE_SIZE = 24;

const EMPTY: Record<
  PrayerScope,
  { titleKey: MessageKey; descriptionKey: MessageKey; icon: typeof Inbox }
> = {
  wall: { titleKey: 'care.noWallTitle', descriptionKey: 'care.noWallDescription', icon: Sparkles },
  answered: {
    titleKey: 'care.noAnsweredTitle',
    descriptionKey: 'care.noAnsweredDescription',
    icon: CircleCheckBig,
  },
  mine: { titleKey: 'care.noMineTitle', descriptionKey: 'care.noMineDescription', icon: UserRound },
  moderation: {
    titleKey: 'care.noModerationTitle',
    descriptionKey: 'care.noModerationDescription',
    icon: Inbox,
  },
};

export function PrayerPage() {
  const { t } = useI18n();
  const { churchId, base, access } = useChurch();
  const moderator = canModeratePrayer(access);
  const canSubmit = has(access, 'prayer.submit');
  const scopes: PrayerScope[] = [
    'wall',
    'answered',
    'mine',
    ...(moderator ? ['moderation' as const] : []),
  ];
  const [state, setState] = useUrlState({
    tab: 'wall',
    q: '',
    visibility: '',
    page: 1,
    new: false as boolean,
  });
  const scope = (scopes as string[]).includes(state.tab) ? (state.tab as PrayerScope) : 'wall';
  const query = useQuery({
    ...prayerRequestsQuery(churchId, {
      scope,
      q: state.q || undefined,
      visibility: state.visibility || undefined,
      page: state.page,
      limit: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });
  const overview = useQuery({ ...careOverviewQuery(churchId), enabled: moderator });
  const pending = overview.data?.prayer.pending ?? 0;
  const [editing, setEditing] = useState<PrayerRequest | null>(null);
  const [answering, setAnswering] = useState<PrayerRequest | null>(null);
  const creating = canSubmit && state.new;
  const setCreating = (open: boolean) => setState({ new: open });
  const filtered = !!(state.q || state.visibility);
  const empty = EMPTY[scope];
  const newButton = canSubmit ? (
    <Button size="sm" onClick={() => setCreating(true)}>
      <Plus />
      <span className="hidden sm:inline">{t('care.newPrayer')}</span>
      <span className="sm:hidden">{t('common.add')}</span>
    </Button>
  ) : null;

  return (
    <Page size="wide">
      <PageHeader
        icon={HandHeart}
        tone="violet"
        title={t('care.navPrayer')}
        description={t('care.prayerDescription')}
        breadcrumbs={[{ label: t('care.nav'), to: `${base}/care` }, { label: t('care.navPrayer') }]}
        actions={newButton}
      />
      <CareNav />
      <UrlTabs defaultValue="wall" values={scopes}>
        <TabsList variant="underline">
          <TabsTrigger value="wall">{t('care.tabWall')}</TabsTrigger>
          <TabsTrigger value="answered">{t('care.tabAnswered')}</TabsTrigger>
          <TabsTrigger value="mine">{t('care.tabMine')}</TabsTrigger>
          {moderator ? (
            <TabsTrigger value="moderation">
              {t('care.tabModeration')}
              {pending > 0 ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-bold text-primary-foreground tabular">
                  {pending}
                </span>
              ) : null}
            </TabsTrigger>
          ) : null}
        </TabsList>
      </UrlTabs>
      <FilterBar
        search={{
          value: state.q,
          onChange: (q) => setState({ q }),
          placeholder: t('care.searchPrayer'),
        }}
        filters={
          isCareTeam(access) && scope !== 'moderation'
            ? [
                {
                  id: 'visibility',
                  label: t('care.shareWith'),
                  value: state.visibility,
                  onChange: (visibility) => setState({ visibility }),
                  options: [
                    { value: 'church', label: t('care.visibilityChurchShort') },
                    { value: 'care_team', label: t('care.visibilityCareTeamShort') },
                    ...(has(access, 'care.confidential')
                      ? [{ value: 'pastors', label: t('care.visibilityPastorsShort') }]
                      : []),
                  ],
                },
              ]
            : []
        }
        onReset={() => setState({ q: '', visibility: '' })}
      />
      {query.isPending ? (
        <SkeletonCards count={6} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={filtered ? Inbox : empty.icon}
          tone="violet"
          title={filtered ? t('common.noResults') : t(empty.titleKey)}
          description={filtered ? t('common.noResultsHint') : t(empty.descriptionKey)}
          action={!filtered && scope !== 'moderation' && scope !== 'answered' ? newButton : null}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.items.map((request) => (
              <PrayerCard
                key={request.id}
                request={request}
                showStatus={scope === 'mine'}
                moderation={scope === 'moderation'}
                onEdit={setEditing}
                onAnswer={setAnswering}
              />
            ))}
          </div>
          <Pagination
            page={query.data.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(page) => setState({ page })}
          />
        </>
      )}
      <PrayerSheet open={creating} onOpenChange={setCreating} />
      <PrayerSheet
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        request={editing}
      />
      <AnswerDialog
        request={answering}
        onOpenChange={(open) => {
          if (!open) setAnswering(null);
        }}
      />
    </Page>
  );
}

export function PrayerRequestPage() {
  const { t } = useI18n();
  const { churchId, base } = useChurch();
  const navigate = useNavigate();
  const { requestId = '' } = useParams();
  const query = useQuery(prayerRequestQuery(churchId, requestId));
  const [editing, setEditing] = useState<PrayerRequest | null>(null);
  const [answering, setAnswering] = useState<PrayerRequest | null>(null);
  const crumbs = [
    { label: t('care.nav'), to: `${base}/care` },
    { label: t('care.navPrayer'), to: `${base}/care/prayer` },
  ];
  return (
    <Page size="narrow">
      <PageHeader
        icon={HandHeart}
        tone="violet"
        title={t('care.prayerDetail')}
        breadcrumbs={[...crumbs, { label: t('care.prayerDetail') }]}
      />
      {query.isPending ? (
        <SkeletonText lines={5} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <PrayerCard
          request={query.data.request}
          showStatus={query.data.request.isMine}
          moderation={
            query.data.request.canModerate && query.data.request.moderationStatus === 'pending'
          }
          onEdit={setEditing}
          onAnswer={setAnswering}
          onDeleted={() => navigate(`${base}/care/prayer`, { replace: true })}
        />
      )}
      <Button variant="ghost" className="w-fit" onClick={() => navigate(`${base}/care/prayer`)}>
        {t('care.backToPrayerWall')}
      </Button>
      <PrayerSheet
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        request={editing}
      />
      <AnswerDialog
        request={answering}
        onOpenChange={(open) => {
          if (!open) setAnswering(null);
        }}
      />
    </Page>
  );
}
