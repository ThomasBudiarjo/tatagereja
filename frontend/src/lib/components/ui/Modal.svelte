<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils/cn';

  interface Props {
    open: boolean;
    title?: string;
    onClose: () => void;
    children?: Snippet;
    size?: 'sm' | 'md' | 'lg';
  }

  const { open, title, onClose, children, size = 'md' }: Props = $props();

  const sizeCls = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
  } as const;
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="presentation"
  >
    <div
      class={cn(
        'relative w-full rounded-lg border bg-card p-6 shadow-xl',
        sizeCls[size],
      )}
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      {#if title}
        <div class="mb-4 flex items-start justify-between gap-4">
          <h2 class="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground"
            onclick={onClose}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>
      {/if}
      {@render children?.()}
    </div>
  </div>
{/if}
