import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Field, FormActions } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { getErrorMessage } from '@/lib/api';
import { normalizeServerUrl } from '@/lib/utils';
import { useServerStore } from '@/stores/server';
import { AuthLayout } from './auth-layout';
import { probeAndRemember } from './api';

export function ServerPage() {
  const navigate = useNavigate();
  const selectServer = useServerStore((state) => state.selectServer);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const url = normalizeServerUrl(value);
    if (!url) {
      setError('Enter a valid address such as https://church.example.com');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const server = await probeAndRemember(url);
      selectServer(server);
      navigate('/login');
    } catch (err) {
      setError(getErrorMessage(err, 'This address does not point to a TataGereja server'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Use another server"
      description="Enter the address of a self-hosted TataGereja server. Your login is stored separately for each server."
      showServer={false}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Field label="Server address" htmlFor="server-url" required error={undefined}>
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
            <Link to="/welcome">Back</Link>
          </Button>
          <Button type="submit" loading={loading}>
            Connect
          </Button>
        </FormActions>
      </form>
    </AuthLayout>
  );
}
