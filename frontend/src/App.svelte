<script lang="ts">
  import Router from 'svelte-spa-router';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { routes } from '$lib/routes';
  import { auth } from '$lib/stores/auth.svelte';

  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
  });

  auth.restore();
</script>

<QueryClientProvider client={queryClient}>
  {#if !auth.bootResolved}
    <div class="flex h-screen items-center justify-center">
      <p class="text-muted-foreground">Memuat…</p>
    </div>
  {:else}
    <Router {routes} />
  {/if}
</QueryClientProvider>
