import { Outlet, ScrollRestoration } from 'react-router';
import { NetworkStatus } from './network-status';

/**
 * The root of every route: scroll restoration (top on new pages, the previous position on
 * back), the loading bar and the network status.
 */
export function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <NetworkStatus />
      <Outlet />
    </>
  );
}
