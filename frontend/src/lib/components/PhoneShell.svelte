<script lang="ts">
  import type { Snippet } from 'svelte';
  import Toast from './Toast.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="shell-bg">
  <div class="phone-frame">
    {@render children()}
    <Toast />
  </div>
</div>
