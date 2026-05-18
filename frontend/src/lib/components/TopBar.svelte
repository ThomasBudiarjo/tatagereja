<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title = '',
    large = false,
    scrolled = false,
    leading,
    trailing,
  }: {
    title?: string;
    large?: boolean;
    scrolled?: boolean;
    leading?: Snippet;
    trailing?: Snippet;
  } = $props();
</script>

<div class="topbar {scrolled ? 'scrolled' : ''}">
  {#if leading}{@render leading()}{/if}
  {#if !large}
    <div class="topbar-title">{title}</div>
  {:else}
    <div class="spacer"></div>
  {/if}
  <div class="hstack">
    {#if trailing}{@render trailing()}{/if}
  </div>
  {#if large}
    <div class="topbar-title large" style="flex-basis: 100%;">{title}</div>
  {/if}
</div>
