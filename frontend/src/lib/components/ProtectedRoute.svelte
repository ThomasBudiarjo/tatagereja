<script lang="ts">
  import type { Snippet } from 'svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { push } from 'svelte-spa-router';

  let { children }: { children: Snippet } = $props();

  $effect(() => {
    if (auth.bootResolved && !auth.isAuthenticated) {
      push('/login');
    }
  });
</script>

{#if auth.isAuthenticated}
  {@render children()}
{:else}
  <div class="app">
    <div class="empty" style="margin: auto;">
      <div class="empty-title">Mengarahkan ke login…</div>
    </div>
  </div>
{/if}
