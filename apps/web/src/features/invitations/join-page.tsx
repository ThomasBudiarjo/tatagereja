import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Alert, PageLoader } from '@/components/ui/misc';
import { AuthLayout } from '@/features/auth/auth-layout';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ROLE_KEYS } from '@/lib/i18n/labels';
import { useAuth } from '@/stores/auth';
import { publicInvitationQuery, useAcceptInvitation } from './api';

export function JoinPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const invitation = useQuery(publicInvitationQuery(token));
  const accept = useAcceptInvitation();
  const { t, formatDate } = useI18n();

  const join = async () => {
    try {
      const result = await accept.mutateAsync(token);
      toast.success(
        result.alreadyMember
          ? t('invitations.alreadyMember')
          : t('invitations.welcome', { church: invitation.data?.church.name ?? '' }),
      );
      navigate(`/c/${result.churchId}`, { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, t('invitations.joinFailed')));
    }
  };

  const encoded = encodeURIComponent(token);

  return (
    <AuthLayout title={t('invitations.title')} showServer={!isAuthenticated}>
      {invitation.isPending ? (
        <PageLoader />
      ) : invitation.isError ? (
        <Alert variant="error" title={t('invitations.notFound')}>
          {getErrorMessage(invitation.error)}
        </Alert>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft">
            <EntityAvatar
              name={invitation.data.church.name}
              src={invitation.data.church.logoUrl}
              color={invitation.data.church.brandColor}
              size="lg"
              square
            />
            <div className="min-w-0">
              <p className="text-lg font-bold tracking-tight">{invitation.data.church.name}</p>
              {invitation.data.church.city ? (
                <p className="text-sm text-muted-foreground">{invitation.data.church.city}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {t('invitations.joinAs', { role: t(ROLE_KEYS[invitation.data.role]) })}
                {invitation.data.expiresAt
                  ? ` · ${t('invitations.expiresOn', { date: formatDate(invitation.data.expiresAt) })}`
                  : ''}
              </p>
            </div>
          </div>
          {invitation.data.status !== 'active' ? (
            <Alert variant="warning" title={t('invitations.noLongerValid')}>
              {invitation.data.status === 'expired'
                ? t('invitations.expired')
                : invitation.data.status === 'exhausted'
                  ? t('invitations.exhausted')
                  : t('invitations.revoked')}
            </Alert>
          ) : isAuthenticated ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t('invitations.loggedInAs', { email: user?.email ?? '' })}
              </p>
              <Button size="lg" onClick={() => void join()} loading={accept.isPending}>
                {t('invitations.join', { church: invitation.data.church.name })}
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/churches">{t('invitations.notNow')}</Link>
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" asChild>
                <Link to={`/register?invite=${encoded}`}>{t('invitations.registerAndJoin')}</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to={`/login?invite=${encoded}`}>{t('invitations.haveAccount')}</Link>
              </Button>
            </>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
