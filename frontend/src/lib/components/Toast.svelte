<script lang="ts">
  import Icon from './Icon.svelte';
  import { toast } from '$lib/stores/toast.svelte';
</script>

{#if toast.message}
  <div class="toast-wrap">
    <div class="toast"><Icon name="check" size={16} /> {toast.message}</div>
  </div>
{/if}
