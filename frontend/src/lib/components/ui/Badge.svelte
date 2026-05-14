<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils/cn';

  interface Props {
    color?: string | null;
    class?: string;
    children?: Snippet;
  }

  const { color, class: className = '', children }: Props = $props();
</script>

<span
  class={cn(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
    className,
  )}
  style={color ? `background-color: ${color}1a; color: ${color}; border-color: ${color}66;` : undefined}
>
  {@render children?.()}
</span>
