import { QueryClient, QueryCache, MutationCache } from "@tanstack/solid-query";
import { ApiError } from "./api/client";

function redirectToLogin() {
  if (!window.location.pathname.endsWith("/login")) {
    window.location.assign("/app/login");
  }
}

// A 401 means the session expired. The /me query handles its own redirect via
// the router; for any other query/mutation we hard-redirect to login.
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (err instanceof ApiError && err.status === 401 && query.queryKey[0] !== "me") {
        redirectToLogin();
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) redirectToLogin();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
