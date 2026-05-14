<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;
  }

  const { children }: Props = $props();
</script>

<div class="overflow-hidden rounded-lg border bg-card">
  <table class="w-full text-left text-sm">
    {@render children?.()}
  </table>
</div>
