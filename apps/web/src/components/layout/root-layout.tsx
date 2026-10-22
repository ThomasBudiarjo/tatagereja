import { Outlet, ScrollRestoration } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NetworkStatus } from './network-status';

/**
 * The root of every route: scroll restoration (top on new pages, the previous position on
 * back), the loading bar and the network status.
 */
export function RootLayout() {
  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={150}>
      <ScrollRestoration />
      <NetworkStatus />
      <Outlet />
    </TooltipProvider>
  );
}
