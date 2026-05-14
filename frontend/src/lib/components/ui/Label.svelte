<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils/cn';

  interface Props {
    for?: string;
    class?: string;
    children?: Snippet;
  }

  const { for: htmlFor, class: className = '', children }: Props = $props();
</script>

<label for={htmlFor} class={cn('text-sm font-medium leading-none text-foreground', className)}>
  {@render children?.()}
</label>
