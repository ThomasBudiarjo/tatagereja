import { QueryClient } from '@tanstack/react-query';
import { onSignOut } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { isApiClientError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (isApiClientError(error) && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});

// A session that ended must not leave the previous account's data in memory, nor the church
// it last opened in storage.
onSignOut(() => {
  queryClient.clear();
  useUiStore.getState().setLastChurchId(null);
});
