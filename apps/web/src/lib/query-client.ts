import { QueryClient, type Query, type QueryKey } from '@tanstack/react-query';
import { onSignOut } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { isApiClientError } from './api';
import { clearOfflineData } from './service-worker';

/*
 * How long data stays fresh depends on what it is. Church keys read
 * `['church', churchId, area, kind, ...]`; a query's own `staleTime` always wins.
 *
 * - Reports, statements, the audit log and summaries are the heaviest answers of the API and
 *   change slowly: fresh for five minutes, never refetched just because the app regained
 *   focus (coming back to a phone would otherwise refetch every open report at once).
 * - Setup and reference data (settings, roles, funds and categories, service types, tags,
 *   custom fields, calendar feeds): fresh for five minutes.
 * - Everything else (lists, details, the dashboard): thirty seconds, refetched on focus when
 *   stale. Writes invalidate what they change, so freshness only bounds other people's edits.
 */
const MINUTE = 60_000;
const HEAVY = new Set(['report', 'reports', 'statement', 'audit', 'summary', 'export']);
const REFERENCE = new Set([
  'setup',
  'settings',
  'policy',
  'modules',
  'roles',
  'service-types',
  'tags',
  'fields',
  'categories',
  'feeds',
  'sources',
  'audience-options',
]);

const kindsOf = (queryKey: QueryKey): unknown[] =>
  queryKey[0] === 'church' ? queryKey.slice(2, 4) : [];

export const isHeavyQuery = (queryKey: QueryKey) =>
  kindsOf(queryKey).some((part) => typeof part === 'string' && HEAVY.has(part));

export const staleTimeOf = (queryKey: QueryKey): number => {
  if (isHeavyQuery(queryKey)) return 5 * MINUTE;
  if (kindsOf(queryKey).some((part) => typeof part === 'string' && REFERENCE.has(part))) {
    return 5 * MINUTE;
  }
  return 30_000;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: (query: Query) => staleTimeOf(query.queryKey),
      // Screens left behind stay in memory for back navigation, not for the whole session.
      gcTime: 10 * MINUTE,
      retry: (failureCount, error) => {
        if (isApiClientError(error) && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: (query: Query) => !isHeavyQuery(query.queryKey),
      // Ask even when the browser reports no network: the service worker answers from the
      // screens viewed last, and a real network error still shows the error state.
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: false,
    },
  },
});

// A session that ended must not leave the previous account's data in memory, in the service
// worker's offline copies, nor the church it last opened in storage.
onSignOut(() => {
  queryClient.clear();
  void clearOfflineData();
  useUiStore.getState().setLastChurchId(null);
});
