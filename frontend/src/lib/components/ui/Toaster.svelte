<script lang="ts">
  import { toast } from '$lib/stores/toast.svelte';
  import { cn } from '$lib/utils/cn';

  const variantCls: Record<string, string> = {
    success: 'border-l-emerald-500',
    error: 'border-l-destructive',
    info: 'border-l-primary',
  };
</script>

<div
  class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
  aria-live="polite"
  aria-atomic="true"
>
  {#each toast.messages as msg (msg.id)}
    <div
      class={cn(
        'pointer-events-auto flex items-start justify-between gap-3 rounded-md border border-l-4 bg-card px-4 py-3 text-sm shadow-md',
        variantCls[msg.variant],
      )}
      role={msg.variant === 'error' ? 'alert' : 'status'}
    >
      <span class="flex-1">{msg.message}</span>
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground"
        aria-label="Tutup notifikasi"
        onclick={() => toast.dismiss(msg.id)}
      >
        ✕
      </button>
    </div>
  {/each}
</div>
