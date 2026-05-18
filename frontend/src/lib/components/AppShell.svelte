<script lang="ts">
  import type { Snippet } from 'svelte';
  import PhoneShell from './PhoneShell.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<PhoneShell>
  {@render children()}
</PhoneShell>
