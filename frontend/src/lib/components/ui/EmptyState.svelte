<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils/cn';

  interface Props {
    // lucide-svelte v0.460 still ships as legacy SvelteComponentTyped classes;
    // until they migrate to Svelte 5's Component<> type, accept any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon?: any;
    title: string;
    description?: string;
    class?: string;
    children?: Snippet;
  }
  const { icon: Icon, title, description, class: className = '', children }: Props = $props();
</script>

<div
  class={cn(
    'flex flex-col items-center justify-center gap-3 rounded-lg border bg-card p-12 text-center',
    className,
  )}
>
  {#if Icon}
    <div class="rounded-full bg-muted p-3 text-muted-foreground">
      <Icon class="h-6 w-6" />
    </div>
  {/if}
  <div class="space-y-1">
    <p class="text-sm font-medium">{title}</p>
    {#if description}
      <p class="text-sm text-muted-foreground">{description}</p>
    {/if}
  </div>
  {#if children}
    <div>{@render children()}</div>
  {/if}
</div>
