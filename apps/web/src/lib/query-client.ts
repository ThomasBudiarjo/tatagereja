import { QueryClient } from '@tanstack/react-query';
import { onSignOut } from '@/stores/auth';
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

// A session the server ended must not leave the previous account's data in memory.
onSignOut(() => queryClient.clear());
