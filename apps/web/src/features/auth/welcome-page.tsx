import { ArrowRight, Server } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { hostLabel } from '@/lib/utils';
import { DEFAULT_SERVER_URL, useServerStore } from '@/stores/server';
import { AuthLayout } from './auth-layout';
import { probeAndRemember, useServerName } from './api';

export function WelcomePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const selectServer = useServerStore((state) => state.selectServer);
  const servers = useServerStore((state) => state.servers);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const defaultName = useServerName(DEFAULT_SERVER_URL);

  const choose = async (url: string) => {
    setLoading(url);
    setError(null);
    try {
      const server = await probeAndRemember(url);
      selectServer(server);
      navigate('/login');
    } catch (err) {
      setError(getErrorMessage(err, t('auth.connectFailed')));
    } finally {
      setLoading(null);
    }
  };

  const otherServers = Object.values(servers).filter((server) => server.url !== DEFAULT_SERVER_URL);

  return (
    <AuthLayout
      title={t('auth.welcomeTitle')}
      description={t('auth.welcomeDescription')}
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
          {t('auth.continueWith', { server: defaultName })}
          <ArrowRight />
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => navigate('/server')}
          disabled={!!loading}
        >
          <Server />
          {t('auth.useAnotherServer')}
        </Button>
        {otherServers.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-overline text-muted-foreground">{t('auth.recentServers')}</p>
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
