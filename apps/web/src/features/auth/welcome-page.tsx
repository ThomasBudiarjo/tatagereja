import { ArrowRight, Server } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { getErrorMessage } from '@/lib/api';
import { hostLabel } from '@/lib/utils';
import { DEFAULT_SERVER_NAME, DEFAULT_SERVER_URL, useServerStore } from '@/stores/server';
import { AuthLayout } from './auth-layout';
import { probeAndRemember } from './api';

export function WelcomePage() {
  const navigate = useNavigate();
  const selectServer = useServerStore((state) => state.selectServer);
  const servers = useServerStore((state) => state.servers);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (url: string) => {
    setLoading(url);
    setError(null);
    try {
      const server = await probeAndRemember(url);
      selectServer(server);
      navigate('/login');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not connect to this server'));
    } finally {
      setLoading(null);
    }
  };

  const otherServers = Object.values(servers).filter((server) => server.url !== DEFAULT_SERVER_URL);

  return (
    <AuthLayout
      title="Welcome to TataGereja"
      description="Church management that keeps people, groups, events and attendance in one place."
      showServer={false}
    >
      <div className="flex flex-col gap-3">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Button
          size="lg"
          onClick={() => void choose(DEFAULT_SERVER_URL)}
          loading={loading === DEFAULT_SERVER_URL}
          disabled={!!loading}
        >
          Continue with {DEFAULT_SERVER_NAME}
          <ArrowRight />
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => navigate('/server')}
          disabled={!!loading}
        >
          <Server />
          Use another server
        </Button>
        {otherServers.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Recent servers
            </p>
            {otherServers.map((server) => (
              <Button
                key={server.url}
                variant="secondary"
                className="justify-between"
                onClick={() => void choose(server.url)}
                loading={loading === server.url}
                disabled={!!loading}
              >
                <span className="truncate">{server.name}</span>
                <span className="text-xs text-muted-foreground">{hostLabel(server.url)}</span>
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </AuthLayout>
  );
}
