import { canViewSecurity, has } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { DatabaseBackup, Download, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Section } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ListGroup, ListRow } from '@/components/ui/list';
import { Alert, EmptyState, ErrorState } from '@/components/ui/misc';
import { Skeleton, SkeletonList } from '@/components/ui/skeleton';
import { StatusBadge, ToneIcon } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useMutationToast } from '@/lib/use-mutation-toast';
import {
  securityOverviewQuery,
  securityPolicyQuery,
  useDownloadBackup,
  useUpdateSecurityPolicy,
} from '../api';
import { RoleBadge } from '../components/badges';
import { PasswordConfirmDialog } from '../components/password-confirm-dialog';
import { SettingsPage } from './layout';

function PolicyCard() {
  const { t } = useI18n();
  const { churchId, access } = useChurch();
  const policy = useQuery(securityPolicyQuery(churchId));
  const overview = useQuery({
    ...securityOverviewQuery(churchId),
    enabled: canViewSecurity(access),
  });
  const [confirming, setConfirming] = useState<boolean | null>(null);
  const update = useMutationToast(useUpdateSecurityPolicy(churchId), {
    success: (_data, enabled) =>
      t(enabled ? 'admin-security.policyOnToast' : 'admin-security.policyOffToast'),
  });
  const canManage = has(access, 'security.manage');

  if (policy.isPending) return <Skeleton className="h-36 rounded-xl" />;
  if (policy.isError) {
    return (
      <ErrorState
        compact
        error={policy.error}
        message={getErrorMessage(policy.error)}
        onRetry={() => void policy.refetch()}
      />
    );
  }
  const on = policy.data.policy.requireTwoFactorForManagers;
  const blocked = overview.data?.twoFactor?.withoutTwoFactor.length ?? 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <ToneIcon icon={on ? ShieldCheck : ShieldAlert} tone={on ? 'success' : 'warning'} />
        <div className="min-w-0 flex-1">
          <CardTitle>{t('admin-security.policyTitle')}</CardTitle>
          <CardDescription className="mt-1">{t('admin-security.policyBody')}</CardDescription>
        </div>
        {canManage ? (
          <Switch
            checked={on}
            disabled={update.isPending}
            onCheckedChange={(checked) => setConfirming(checked)}
            aria-label={t('admin-security.policyTitle')}
          />
        ) : (
          <StatusBadge tone={on ? 'success' : 'neutral'}>
            {on ? t('admin-security.policyOn') : t('admin-security.policyOff')}
          </StatusBadge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {canManage && !policy.data.twoFactorEnabled ? (
          <Alert variant="warning" title={t('admin-security.policyOwnFirstTitle')}>
            <p>{t('admin-security.policyOwnFirstBody')}</p>
            <Button asChild size="sm" variant="outline" className="mt-2.5">
              <Link to="/profile?tab=security&setup=1">
                <Smartphone />
                {t('admin-security.setUpNow')}
              </Link>
            </Button>
          </Alert>
        ) : null}
        {policy.data.appliesToYou ? (
          <p className="text-sm text-muted-foreground">{t('admin-security.policyAppliesToYou')}</p>
        ) : null}
        {!canManage ? (
          <p className="text-xs text-muted-foreground">{t('admin-security.policyOwnerOnly')}</p>
        ) : null}
      </CardContent>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        variant={confirming ? 'default' : 'destructive'}
        title={t(confirming ? 'admin-security.policyOnTitle' : 'admin-security.policyOffTitle')}
        description={
          confirming
            ? t('admin-security.policyOnConfirm', { count: blocked })
            : t('admin-security.policyOffConfirm')
        }
        confirmLabel={t(
          confirming ? 'admin-security.policyTurnOn' : 'admin-security.policyTurnOff',
        )}
        loading={update.isPending}
        onConfirm={async () => {
          if (confirming === null) return;
          if (await update.run(confirming)) setConfirming(null);
        }}
      />
    </Card>
  );
}

function ManagersWithoutTwoFactor() {
  const { t } = useI18n();
  const { churchId, base } = useChurch();
  const overview = useQuery(securityOverviewQuery(churchId));
  if (overview.isPending) return <SkeletonList rows={3} />;
  if (overview.isError) {
    return (
      <ErrorState
        compact
        message={getErrorMessage(overview.error)}
        onRetry={() => void overview.refetch()}
      />
    );
  }
  const twoFactor = overview.data.twoFactor;
  if (!twoFactor) return null;
  return (
    <Section
      title={t('admin-security.managersTitle')}
      description={t('admin-security.managersProgress', {
        done: twoFactor.managersWithTwoFactor,
        total: twoFactor.managers,
      })}
    >
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={twoFactor.managers}
        aria-valuenow={twoFactor.managersWithTwoFactor}
        aria-label={t('admin-security.managersTitle')}
      >
        <div
          className="h-full rounded-full bg-success transition-[width] duration-500"
          style={{
            width: `${twoFactor.managers === 0 ? 100 : (twoFactor.managersWithTwoFactor / twoFactor.managers) * 100}%`,
          }}
        />
      </div>
      {twoFactor.withoutTwoFactor.length === 0 ? (
        <EmptyState
          compact
          icon={ShieldCheck}
          tone="success"
          title={t('admin-security.allManagersProtected')}
          description={t('admin-security.allManagersProtectedHint')}
        />
      ) : (
        <ListGroup>
          {twoFactor.withoutTwoFactor.map((item) => (
            <ListRow
              key={item.membershipId}
              to={`${base}/settings/members/${item.membershipId}`}
              leading={<EntityAvatar name={item.user.name} src={item.user.avatarUrl} />}
              title={item.user.name}
              subtitle={item.user.email}
              trailing={<RoleBadge role={item.role} size="sm" />}
            />
          ))}
        </ListGroup>
      )}
    </Section>
  );
}

function BackupCard() {
  const { t } = useI18n();
  const { church, churchId } = useChurch();
  const [open, setOpen] = useState(false);
  const download = useDownloadBackup(churchId);
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <ToneIcon icon={DatabaseBackup} tone="indigo" />
        <div className="min-w-0 flex-1">
          <CardTitle>{t('admin-security.backupTitle')}</CardTitle>
          <CardDescription className="mt-1">{t('admin-security.backupBody')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Alert variant="warning">{t('admin-security.backupWarning')}</Alert>
        <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
          <Download />
          {t('admin-security.backupDownload')}
        </Button>
      </CardContent>
      <PasswordConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('admin-security.backupConfirmTitle', { church: church.name })}
        description={t('admin-security.backupConfirmBody')}
        confirmLabel={t('admin-security.backupDownload')}
        mutation={download}
        success={t('admin-security.backupDone')}
      />
    </Card>
  );
}

export function SecuritySettingsPage() {
  const { t } = useI18n();
  const { access } = useChurch();
  return (
    <SettingsPage section="security" description={t('admin-security.securityDescription')}>
      <PolicyCard />
      {canViewSecurity(access) ? <ManagersWithoutTwoFactor /> : null}
      {has(access, 'backup.export') ? <BackupCard /> : null}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          <ToneIcon icon={Smartphone} tone="sky" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('admin-security.ownAccountTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('admin-security.ownAccountBody')}</p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/profile?tab=security">{t('admin-security.openAccountSecurity')}</Link>
          </Button>
        </CardContent>
      </Card>
    </SettingsPage>
  );
}
