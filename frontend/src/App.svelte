<script lang="ts">
  import Router from 'svelte-spa-router';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { routes } from '$lib/routes';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import Toaster from '$lib/components/ui/Toaster.svelte';

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  });

  onMount(() => {
    auth.restore();
  });
</script>

<QueryClientProvider client={queryClient}>
  {#if !auth.restored}
    <div class="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Memuat…
    </div>
  {:else}
    <Router {routes} />
  {/if}
  <Toaster />
</QueryClientProvider>
