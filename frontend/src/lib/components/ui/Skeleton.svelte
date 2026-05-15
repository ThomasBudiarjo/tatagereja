<script lang="ts">
  import { cn } from '$lib/utils/cn';

  interface Props {
    class?: string;
  }
  const { class: className = '' }: Props = $props();
</script>

<div class={cn('animate-pulse rounded-md bg-muted', className)}></div>
