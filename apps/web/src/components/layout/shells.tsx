import { Church } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useI18n, useLocale } from '@/lib/i18n';
import { BottomNav } from './bottom-nav';
import { CommandPalette } from './command-palette';
import { ModuleRouteGuard } from './route-guard';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { UserMenu } from './user-menu';

function SkipLink() {
  const { t } = useI18n();
  return (
    <a
      href="#main"
      className="fixed top-2 left-2 z-[70] -translate-y-16 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-raised transition-transform focus:translate-y-0"
    >
      {t('common.skipToContent')}
    </a>
  );
}

/** Each page fades in; changing the language re-renders the page in it. */
function AnimatedOutlet() {
  const { pathname } = useLocation();
  const locale = useLocale();
  return (
    <div key={`${locale}:${pathname}`} className="animate-page-in">
      <Outlet />
    </div>
  );
}

/** Shell for pages outside a church (church list, account). */
export function AccountShell() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header
        data-print="hide"
        className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-lg safe-top"
      >
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5 rounded-lg font-bold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
              <Church className="size-4" />
            </span>
            {t('common.appName')}
          </NavLink>
          <UserMenu />
        </div>
      </header>
      <main id="main" className="flex-1 safe-x">
        <AnimatedOutlet />
      </main>
    </div>
  );
}

/**
 * Shell for pages inside a church: sidebar, top bar, bottom tabs and the command palette.
 * Tooltips (the collapsed sidebar) only exist here, so their provider is not in the sign-in
 * download.
 */
export function AppShell() {
  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={150}>
      <div className="flex min-h-dvh">
        <SkipLink />
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main
            id="main"
            className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] safe-x md:pb-8"
          >
            <ModuleRouteGuard>
              <AnimatedOutlet />
            </ModuleRouteGuard>
          </main>
          <BottomNav />
        </div>
        <CommandPalette />
      </div>
    </TooltipProvider>
  );
}
