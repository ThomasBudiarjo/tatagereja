<script lang="ts">
  import type { Snippet } from 'svelte';
  import DesktopSidebar from './DesktopSidebar.svelte';

  let {
    title,
    subtitle,
    actions,
    children,
    split = false,
    noPad = false,
  }: {
    title: string;
    subtitle?: string;
    actions?: Snippet;
    children: Snippet;
    split?: boolean;
    noPad?: boolean;
  } = $props();
</script>

<div class="dt-app">
  <DesktopSidebar />
  <main class="dt-main">
    <div class="dt-topbar">
      <div class="dt-title-block">
        <div class="dt-title">{title}</div>
        {#if subtitle}<div class="dt-title-sub">{subtitle}</div>{/if}
      </div>
      {#if actions}{@render actions()}{/if}
    </div>
    <div class="dt-content {split ? 'split' : ''} {noPad ? 'no-pad' : ''}">
      {@render children()}
    </div>
  </main>
</div>
