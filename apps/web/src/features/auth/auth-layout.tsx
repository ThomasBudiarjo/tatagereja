import { BookOpen, Church, HeartHandshake, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ToneIcon } from '@/components/ui/status-badge';
import { useI18n } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { hostLabel } from '@/lib/utils';
import { useServerStore, isDefaultServer, DEFAULT_SERVER_NAME } from '@/stores/server';

/** Auth screens: a form column, and on wide screens a warm panel describing the app. */
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
  const { t } = useI18n();
  useDocumentTitle(title);
  const currentUrl = useServerStore((state) => state.currentUrl);
  const server = useServerStore((state) => state.servers[currentUrl]);
  const serverName =
    server?.name ?? (isDefaultServer(currentUrl) ? DEFAULT_SERVER_NAME : hostLabel(currentUrl));
  const highlights = [
    { icon: Users, tone: 'sky' as const, text: t('auth.welcomeHighlightPeople') },
    { icon: BookOpen, tone: 'violet' as const, text: t('auth.welcomeHighlightWorship') },
    { icon: HeartHandshake, tone: 'rose' as const, text: t('auth.welcomeHighlightCare') },
  ];

  return (
    <div className="flex min-h-dvh bg-background safe-top safe-bottom">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden border-r bg-sunken p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-[oklch(0.75_0.1_80/0.18)] blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-raised">
            <Church className="size-6" />
          </span>
          <span className="text-lg font-bold tracking-tight">{t('common.appName')}</span>
        </div>
        <div className="relative flex flex-col gap-6">
          <p className="max-w-sm text-3xl leading-tight font-bold tracking-tight text-balance">
            {t('common.tagline')}
          </p>
          <ul className="flex flex-col gap-3">
            {highlights.map((item) => (
              <li
                key={item.text}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/70 p-3 text-sm font-medium shadow-xs backdrop-blur"
              >
                <ToneIcon icon={item.icon} tone={item.tone} size="sm" />
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted-foreground">{t('common.poweredBy')}</p>
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-md flex-1 animate-page-in flex-col justify-center px-5 py-10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-raised">
              <Church className="size-6" />
            </span>
            <span className="text-lg font-bold tracking-tight">{t('common.appName')}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">{title}</h1>
          {description ? (
            <p className="mt-2 text-[0.9375rem] text-pretty text-muted-foreground">{description}</p>
          ) : null}
          <div className="mt-7">{children}</div>
          {showServer ? (
            <p className="mt-8 text-center text-xs text-muted-foreground">
              {t('auth.server')}: <span className="font-medium text-foreground">{serverName}</span>
              {' · '}
              <Link
                to="/welcome"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t('auth.change')}
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
