<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    open,
    onClose,
    title,
    children,
    footer,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: Snippet;
    footer?: Snippet;
  } = $props();
</script>

{#if open}
  <div
    class="sheet-backdrop"
    role="button"
    tabindex="-1"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    aria-label="Tutup"
  ></div>
  <div class="sheet" role="dialog" aria-modal="true">
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <div class="sheet-title">{title}</div>
      <button class="icon-btn" type="button" onclick={onClose} aria-label="Tutup">
        <Icon name="close" />
      </button>
    </div>
    <div class="sheet-body">{@render children()}</div>
    {#if footer}
      <div class="sheet-actions">{@render footer()}</div>
    {/if}
  </div>
{/if}
