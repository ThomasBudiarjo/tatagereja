import { can, canViewSecurity, has } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  FileClock,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ListGroup, ListRow } from '@/components/ui/list';
import { Alert, EmptyState, ErrorState } from '@/components/ui/misc';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { securityOverviewQuery, twoFactorStatusQuery } from './api';
import { RoleBadge } from './components/badges';

/** The security centre: policy, two-step verification coverage, roles and recent changes. */
export function SecurityHomePage() {
  const { t, formatNumber, formatRelative, formatPercent } = useI18n();
  const { churchId, base, access } = useChurch();
  const overview = useQuery(securityOverviewQuery(churchId));
  const mine = useQuery(twoFactorStatusQuery());

  const header = (
    <PageHeader
      title={t('admin-security.centerTitle')}
      description={t('admin-security.centerDescription')}
      icon={ShieldCheck}
      tone="slate"
      eyebrow={t('admin-security.nav')}
    />
  );

  if (overview.isPending) {
    return (
      <Page size="wide">
        {header}
        <SkeletonStats count={4} />
        <SkeletonList rows={4} />
      </Page>
    );
  }
  if (overview.isError) {
    return (
      <Page size="wide">
        {header}
        <ErrorState
          error={overview.error}
          message={getErrorMessage(overview.error)}
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
        />
      </Page>
    );
  }

  const data = overview.data;
  const recent = data.audit?.recent ?? [];
  const coverage =
    data.twoFactor && data.twoFactor.managers > 0
      ? data.twoFactor.managersWithTwoFactor / data.twoFactor.managers
      : null;
  const policyOn = data.policy.requireTwoFactorForManagers;
  const links = [
    {
      to: 'settings/members',
      icon: Users,
      tone: 'sky' as const,
      label: t('admin-security.sectionMembers'),
      show: can.viewMembers(access),
    },
    {
      to: 'settings/roles',
      icon: KeyRound,
      tone: 'amber' as const,
      label: t('admin-security.sectionRoles'),
      show: can.manageRoles(access) || can.viewMembers(access),
    },
    {
      to: 'settings/audit',
      icon: FileClock,
      tone: 'indigo' as const,
      label: t('admin-security.sectionAudit'),
      show: has(access, 'audit.view'),
    },
    {
      to: 'settings/security',
      icon: ShieldCheck,
      tone: 'emerald' as const,
      label: t('admin-security.sectionSecurity'),
      show: canViewSecurity(access) || has(access, 'backup.export'),
    },
  ].filter((link) => link.show);

  return (
    <Page size="wide">
      {header}

      {mine.data && !mine.data.enabled ? (
        <Alert
          variant={mine.data.requiredByChurchIds.includes(churchId) ? 'error' : 'warning'}
          title={t('admin-security.centerYouWithout')}
          action={
            <Button asChild size="sm">
              <Link to="/profile?tab=security&setup=1">
                <Smartphone />
                {t('admin-security.setUpNow')}
              </Link>
            </Button>
          }
        >
          {t('admin-security.centerYouWithoutBody')}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('admin-security.statActiveMembers')}
          value={formatNumber(data.members.active)}
          hint={
            data.members.suspended > 0
              ? t('admin-security.statSuspended', { count: data.members.suspended })
              : undefined
          }
          icon={Users}
          tone="sky"
          to={can.viewMembers(access) ? `${base}/settings/members` : undefined}
        />
        {data.twoFactor ? (
          <StatCard
            label={t('admin-security.statCoverage')}
            value={coverage === null ? '—' : formatPercent(coverage)}
            hint={t('admin-security.managersProgress', {
              done: data.twoFactor.managersWithTwoFactor,
              total: data.twoFactor.managers,
            })}
            icon={ShieldCheck}
            tone={coverage === 1 ? 'success' : 'warning'}
            to={can.viewMembers(access) ? `${base}/settings/members?twoFactor=off` : undefined}
          />
        ) : null}
        <StatCard
          label={t('admin-security.statRoles')}
          value={formatNumber(data.customRoles)}
          icon={KeyRound}
          tone="amber"
          to={
            can.manageRoles(access) || can.viewMembers(access)
              ? `${base}/settings/roles`
              : undefined
          }
        />
        {data.audit ? (
          <StatCard
            label={t('admin-security.statAudit')}
            value={formatNumber(data.audit.last7Days)}
            hint={t('admin-security.statAuditHint')}
            icon={FileClock}
            tone="indigo"
            to={`${base}/settings/audit`}
          />
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardContent className="flex items-start gap-3">
              <ToneIcon
                icon={policyOn ? ShieldCheck : ShieldAlert}
                tone={policyOn ? 'success' : 'warning'}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{t('admin-security.policyTitle')}</p>
                  <StatusBadge tone={policyOn ? 'success' : 'neutral'} size="sm">
                    {policyOn ? t('admin-security.policyOn') : t('admin-security.policyOff')}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {policyOn
                    ? t('admin-security.centerPolicyOn')
                    : t('admin-security.centerPolicyOff')}
                </p>
                {canViewSecurity(access) || has(access, 'backup.export') ? (
                  <Button asChild variant="link" className="mt-1 h-auto px-0">
                    <Link to={`${base}/settings/security`}>
                      {t('admin-security.centerOpenPolicy')}
                      <ArrowRight />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {data.twoFactor ? (
            <Section title={t('admin-security.centerAttention')}>
              {data.twoFactor.withoutTwoFactor.length === 0 ? (
                <EmptyState
                  compact
                  icon={ShieldCheck}
                  tone="success"
                  title={t('admin-security.allManagersProtected')}
                  description={t('admin-security.allManagersProtectedHint')}
                />
              ) : (
                <ListGroup>
                  {data.twoFactor.withoutTwoFactor.slice(0, 6).map((item) => (
                    <ListRow
                      key={item.membershipId}
                      to={
                        can.viewMembers(access)
                          ? `${base}/settings/members/${item.membershipId}`
                          : undefined
                      }
                      leading={<EntityAvatar name={item.user.name} src={item.user.avatarUrl} />}
                      title={item.user.name}
                      subtitle={t('admin-security.twoFactorOff')}
                      trailing={<RoleBadge role={item.role} size="sm" />}
                    />
                  ))}
                </ListGroup>
              )}
            </Section>
          ) : null}

          {links.length > 0 ? (
            <Section title={t('admin-security.centerShortcuts')}>
              <div className="grid grid-cols-2 gap-2.5">
                {links.map((link) => (
                  <Link
                    key={link.to}
                    to={`${base}/${link.to}`}
                    className="pressable flex min-h-14 items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-sm font-semibold shadow-soft outline-none hover:border-border focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  >
                    <ToneIcon icon={link.icon} tone={link.tone} size="sm" />
                    <span className="min-w-0 truncate">{link.label}</span>
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}
        </div>

        {data.audit ? (
          <Section
            title={t('admin-security.centerRecent')}
            className="min-w-0"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to={`${base}/settings/audit`}>
                  {t('common.seeAll')}
                  <ArrowRight />
                </Link>
              </Button>
            }
          >
            <Card>
              <CardContent>
                {recent.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t('admin-security.auditEmpty')}
                  </p>
                ) : (
                  <Timeline>
                    {recent.map((entry, index) => (
                      <TimelineItem
                        key={entry.id}
                        tone="indigo"
                        icon={FileClock}
                        title={
                          <Link
                            to={`${base}/settings/audit?entry=${entry.id}`}
                            className="rounded-sm underline-offset-4 hover:underline"
                          >
                            {entry.summary}
                          </Link>
                        }
                        time={formatRelative(entry.createdAt)}
                        last={index === recent.length - 1}
                      >
                        {entry.actorName ?? t('admin-security.auditSystem')}
                      </TimelineItem>
                    ))}
                  </Timeline>
                )}
              </CardContent>
            </Card>
          </Section>
        ) : null}
      </div>
    </Page>
  );
}
