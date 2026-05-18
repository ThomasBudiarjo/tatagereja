<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { push } from 'svelte-spa-router';
  import AppShell from './AppShell.svelte';
  import { onMount } from 'svelte';

  let { children } = $props<{ children: () => unknown }>();

  onMount(() => {
    if (auth.bootResolved && !auth.isAuthenticated) {
      push('/login');
    }
  });

  $effect(() => {
    if (auth.bootResolved && !auth.isAuthenticated) {
      push('/login');
    }
  });
</script>

{#if auth.isAuthenticated}
  <AppShell {children} />
{:else}
  <div class="flex h-screen items-center justify-center">
    <p class="text-muted-foreground">Mengarahkan ke login…</p>
  </div>
{/if}
