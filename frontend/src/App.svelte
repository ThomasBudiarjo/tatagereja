<script lang="ts">
  import Router from 'svelte-spa-router';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { routes } from '$lib/routes';
  import { auth } from '$lib/stores/auth.svelte';
  import { viewport } from '$lib/stores/viewport.svelte';
  import PhoneShell from '$lib/components/PhoneShell.svelte';

  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
  });

  auth.restore();
  viewport.init();
</script>

<QueryClientProvider client={queryClient}>
  <PhoneShell>
    {#if !auth.bootResolved}
      <div class="app">
        <div class="empty" style="margin: auto;">
          <div class="empty-icon"><span class="mono">tg</span></div>
          <div class="empty-title">Memuat…</div>
        </div>
      </div>
    {:else}
      <Router {routes} />
    {/if}
  </PhoneShell>
</QueryClientProvider>
