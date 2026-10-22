import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { normalizeServerUrl } from '@/lib/utils';
import { useServerStore } from '@/stores/server';
import { AuthLayout } from './auth-layout';
import { probeAndRemember } from './api';

export function ServerPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const selectServer = useServerStore((state) => state.selectServer);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const url = normalizeServerUrl(value);
    if (!url) {
      setError(t('auth.serverInvalid'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const server = await probeAndRemember(url);
      selectServer(server);
      navigate('/login');
    } catch (err) {
      setError(
        isApiClientError(err) && err.code === 'INVALID_RESPONSE'
          ? t('auth.serverNotTataGereja')
          : getErrorMessage(err, t('auth.serverNotTataGereja')),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t('auth.serverTitle')}
      description={t('auth.serverDescription')}
      showServer={false}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Field label={t('auth.serverAddress')} htmlFor="server-url" required>
          <Input
            id="server-url"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="https://church.example.com"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
          />
        </Field>
        <FormActions>
          <Button type="button" variant="ghost" asChild>
            <Link to="/welcome">{t('common.back')}</Link>
          </Button>
          <Button type="submit" loading={loading}>
            {t('auth.connect')}
          </Button>
        </FormActions>
      </form>
    </AuthLayout>
  );
}
