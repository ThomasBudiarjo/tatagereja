<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils/cn';

  interface Props {
    name?: string;
    id?: string;
    value?: string | number | null;
    required?: boolean;
    disabled?: boolean;
    class?: string;
    onchange?: (e: Event) => void;
    children?: Snippet;
  }

  let {
    name,
    id,
    value = $bindable(''),
    required = false,
    disabled = false,
    class: className = '',
    onchange,
    children,
  }: Props = $props();

  const cls = cn(
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
    className,
  );
</script>

<select {name} {id} {required} {disabled} bind:value class={cls} {onchange}>
  {@render children?.()}
</select>
