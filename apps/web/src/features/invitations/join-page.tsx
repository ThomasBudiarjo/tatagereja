import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Alert, PageLoader } from '@/components/ui/misc';
import { AuthLayout } from '@/features/auth/auth-layout';
import { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/stores/auth';
import { publicInvitationQuery, useAcceptInvitation } from './api';

export function JoinPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const invitation = useQuery(publicInvitationQuery(token));
  const accept = useAcceptInvitation();

  const join = async () => {
    try {
      const result = await accept.mutateAsync(token);
      toast.success(
        result.alreadyMember ? 'You are already a member of this church' : 'Welcome to the church!',
      );
      navigate(`/c/${result.churchId}`, { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not accept the invitation'));
    }
  };

  const encoded = encodeURIComponent(token);

  return (
    <AuthLayout title="Church invitation" showServer={!isAuthenticated}>
      {invitation.isPending ? (
        <PageLoader />
      ) : invitation.isError ? (
        <Alert variant="error" title="Invitation not found">
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
                Join as{' '}
                <span className="font-medium text-foreground capitalize">
                  {invitation.data.role}
                </span>
                {invitation.data.expiresAt
                  ? ` · expires ${formatDate(invitation.data.expiresAt)}`
                  : ''}
              </p>
            </div>
          </div>
          {invitation.data.status !== 'active' ? (
            <Alert variant="warning" title="This invitation is no longer valid">
              {invitation.data.status === 'expired'
                ? 'The invitation has expired. Ask an administrator for a new link.'
                : invitation.data.status === 'exhausted'
                  ? 'The invitation has reached its usage limit.'
                  : 'The invitation was revoked by an administrator.'}
            </Alert>
          ) : isAuthenticated ? (
            <>
              <p className="text-sm text-muted-foreground">
                You are logged in as{' '}
                <span className="font-medium text-foreground">{user?.email}</span>.
              </p>
              <Button size="lg" onClick={() => void join()} loading={accept.isPending}>
                Join {invitation.data.church.name}
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/churches">Not now</Link>
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" asChild>
                <Link to={`/register?invite=${encoded}`}>Create an account and join</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to={`/login?invite=${encoded}`}>I already have an account</Link>
              </Button>
            </>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
