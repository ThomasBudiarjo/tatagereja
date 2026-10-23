import {
  FAILED_LOGIN_OUTCOMES,
  LOGIN_EVENT_OUTCOME_LABELS,
  localize,
  type LoginEventOutcome,
  type Session,
} from '@tatagereja/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  CircleCheck,
  CircleX,
  History,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useState } from 'react';
import { Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DataList } from '@/components/ui/data-list';
import { EmptyState, ErrorState, Segmented } from '@/components/ui/misc';
import { InfiniteListFooter } from '@/components/ui/pagination';
import { SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import type { Tone } from '@/components/ui/tone';
import { sessionsQuery, useRevokeSession } from '@/features/auth/api';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import { loginEventsInfiniteQuery, useRevokeOtherSessions } from '../api';
import { describeDevice, isMobileDevice } from '../components/device';

const OUTCOME_LOOK: Record<LoginEventOutcome, { tone: Tone; icon: typeof CircleCheck }> = {
  success: { tone: 'success', icon: CircleCheck },
  two_factor_success: { tone: 'success', icon: ShieldCheck },
  recovery_code_used: { tone: 'warning', icon: KeyRound },
  two_factor_required: { tone: 'info', icon: Smartphone },
  failure: { tone: 'danger', icon: CircleX },
  two_factor_failure: { tone: 'danger', icon: CircleX },
  locked: { tone: 'danger', icon: Lock },
};

/** Devices signed in to the account: sign one out, or every other one at once. */
export function SessionsSection() {
  const { t, formatRelative } = useI18n();
  const sessions = useQuery(sessionsQuery());
  const revokeMutation = useRevokeSession();
  const revokeOne = useMutationToast(revokeMutation, { success: t('profile.sessionSignedOut') });
  const revokeOthers = useMutationToast(useRevokeOtherSessions(), {
    success: (data) => t('profile.othersSignedOut', { count: data.revokedSessions }),
  });
  const [confirming, setConfirming] = useState(false);
  const others = sessions.data?.items.filter((session) => !session.current).length ?? 0;

  return (
    <Section
      title={t('profile.sessions')}
      description={t('profile.sessionsDescription')}
      action={
        others > 0 ? (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            <LogOut />
            <span className="hidden sm:inline">{t('profile.signOutOthers')}</span>
            <span className="sm:hidden">{t('profile.signOutOthersShort')}</span>
          </Button>
        ) : null
      }
    >
      {sessions.isPending ? (
        <SkeletonList rows={2} />
      ) : sessions.isError ? (
        <ErrorState
          compact
          error={sessions.error}
          message={getErrorMessage(sessions.error)}
          onRetry={() => void sessions.refetch()}
          retrying={sessions.isFetching}
        />
      ) : (
        <DataList<Session>
          items={sessions.data.items}
          getKey={(session) => session.id}
          leading={(session) => (
            <span
              data-tone={session.current ? 'success' : 'neutral'}
              className="flex size-10 items-center justify-center rounded-full bg-tone-soft text-tone-ink"
              aria-hidden
            >
              {isMobileDevice(session.userAgent) ? (
                <Smartphone className="size-5" />
              ) : (
                <Laptop className="size-5" />
              )}
            </span>
          )}
          title={(session) => (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{describeDevice(session.userAgent, t)}</span>
              {session.current ? (
                <StatusBadge tone="success" dot size="sm">
                  {t('profile.thisDevice')}
                </StatusBadge>
              ) : null}
            </span>
          )}
          subtitle={(session) =>
            [
              session.ip,
              t('profile.sessionMeta', {
                lastActive: formatRelative(session.lastUsedAt),
                expires: formatRelative(session.expiresAt),
              }),
            ]
              .filter(Boolean)
              .join(' · ')
          }
          trailing={(session) =>
            !session.current ? (
              <Button
                variant="ghost"
                size="sm"
                loading={revokeMutation.isPending && revokeMutation.variables === session.id}
                disabled={revokeMutation.isPending}
                onClick={() => void revokeOne.run(session.id)}
                aria-label={t('profile.signOutDevice', {
                  device: describeDevice(session.userAgent, t),
                })}
              >
                {t('profile.signOutSession')}
              </Button>
            ) : null
          }
        />
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('profile.signOutOthersTitle')}
        description={t('profile.signOutOthersBody', { count: others })}
        confirmLabel={t('profile.signOutOthers')}
        loading={revokeOthers.isPending}
        onConfirm={async () => {
          if (await revokeOthers.run()) setConfirming(false);
        }}
      />
    </Section>
  );
}

/** Sign-in history: successes, wrong passwords and codes, locks, newest first. */
export function LoginHistorySection() {
  const { t, locale, formatDateTime, formatRelative } = useI18n();
  const [outcome, setOutcome] = useState<'all' | 'failed'>('all');
  const history = useInfiniteQuery(loginEventsInfiniteQuery(outcome));
  const events = history.data?.pages.flatMap((page) => page.items) ?? [];
  const [now] = useState(() => Date.now());
  const failedRecently = events.some(
    (event) =>
      FAILED_LOGIN_OUTCOMES.includes(event.outcome) &&
      now - new Date(event.createdAt).getTime() < 7 * 86_400_000,
  );

  return (
    <Section title={t('profile.loginHistory')} description={t('profile.loginHistoryDescription')}>
      <Segmented<'all' | 'failed'>
        aria-label={t('profile.loginHistory')}
        value={outcome}
        onChange={setOutcome}
        options={[
          { value: 'all', label: t('profile.historyAll') },
          { value: 'failed', label: t('profile.historyFailed') },
        ]}
        className="sm:max-w-xs"
      />
      {outcome === 'all' && failedRecently ? (
        <p className="text-sm text-muted-foreground">{t('profile.failedRecentlyHint')}</p>
      ) : null}
      {history.isPending ? (
        <SkeletonList rows={4} />
      ) : history.isError ? (
        <ErrorState
          compact
          error={history.error}
          message={getErrorMessage(history.error)}
          onRetry={() => void history.refetch()}
          retrying={history.isFetching}
        />
      ) : events.length === 0 ? (
        <EmptyState
          compact
          icon={History}
          tone={outcome === 'failed' ? 'success' : 'sky'}
          title={outcome === 'failed' ? t('profile.noFailures') : t('profile.noHistory')}
          description={outcome === 'failed' ? t('profile.noFailuresHint') : undefined}
        />
      ) : (
        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-soft">
          <Timeline>
            {events.map((event, index) => {
              const look = OUTCOME_LOOK[event.outcome];
              return (
                <TimelineItem
                  key={event.id}
                  icon={look.icon}
                  tone={look.tone}
                  title={localize(LOGIN_EVENT_OUTCOME_LABELS[event.outcome], locale)}
                  time={
                    <span title={formatDateTime(event.createdAt)}>
                      {formatRelative(event.createdAt)}
                    </span>
                  }
                  last={index === events.length - 1 && !history.hasNextPage}
                >
                  {[describeDevice(event.userAgent, t), event.ip].filter(Boolean).join(' · ')}
                </TimelineItem>
              );
            })}
          </Timeline>
          <InfiniteListFooter
            hasNextPage={!!history.hasNextPage}
            isFetchingNextPage={history.isFetchingNextPage}
            fetchNextPage={history.fetchNextPage}
          />
        </div>
      )}
    </Section>
  );
}
