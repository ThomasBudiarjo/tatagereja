import { Church } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { hostLabel } from '@/lib/utils';
import { useServerStore, isDefaultServer, DEFAULT_SERVER_NAME } from '@/stores/server';

export function AuthLayout({
  title,
  description,
  children,
  showServer = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  showServer?: boolean;
}) {
  const currentUrl = useServerStore((state) => state.currentUrl);
  const server = useServerStore((state) => state.servers[currentUrl]);
  const serverName =
    server?.name ?? (isDefaultServer(currentUrl) ? DEFAULT_SERVER_NAME : hostLabel(currentUrl));
  return (
    <div className="flex min-h-dvh flex-col bg-background safe-top safe-bottom">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <Church className="size-6" />
          </span>
          <span className="text-lg font-bold tracking-tight">TataGereja</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-balance">{title}</h1>
        {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-6">{children}</div>
        {showServer ? (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Server: <span className="font-medium text-foreground">{serverName}</span>
            {' · '}
            <Link to="/welcome" className="text-primary underline-offset-4 hover:underline">
              Change
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
