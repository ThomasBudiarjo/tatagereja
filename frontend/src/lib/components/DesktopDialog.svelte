<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    open,
    title,
    subtitle,
    width = 560,
    onClose,
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    subtitle?: string;
    width?: number;
    onClose: () => void;
    children: Snippet;
    footer?: Snippet;
  } = $props();
</script>

{#if open}
  <div
    class="dt-dialog-backdrop"
    role="button"
    tabindex="-1"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    aria-label="Tutup"
  >
    <div
      class="dt-dialog"
      style="width: {width}px;"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="dt-dialog-head">
        <div class="dt-title-block">
          <div class="dt-dialog-title">{title}</div>
          {#if subtitle}<div class="dt-title-sub" style="font-size: 12px;">{subtitle}</div>{/if}
        </div>
        <button class="icon-btn" type="button" onclick={onClose} aria-label="Tutup"><Icon name="close" /></button>
      </div>
      <div class="dt-dialog-body">{@render children()}</div>
      {#if footer}
        <div class="dt-dialog-foot">{@render footer()}</div>
      {/if}
    </div>
  </div>
{/if}
