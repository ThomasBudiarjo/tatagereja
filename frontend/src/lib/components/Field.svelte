<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    required = false,
    hint,
    error,
    children,
  }: {
    label?: string;
    required?: boolean;
    hint?: string;
    error?: string;
    children: Snippet;
  } = $props();
</script>

<div class="field">
  {#if label}
    <div class="field-label">
      {label}{#if required}<span class="req">*</span>{/if}
    </div>
  {/if}
  {@render children()}
  {#if error}
    <span class="field-error">{error}</span>
  {:else if hint}
    <span class="field-hint">{hint}</span>
  {/if}
</div>
