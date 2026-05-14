<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils/cn';

  type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline';

  interface Props {
    type?: 'button' | 'submit' | 'reset';
    variant?: Variant;
    size?: 'sm' | 'md';
    disabled?: boolean;
    href?: string;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  }

  const {
    type = 'button',
    variant = 'primary',
    size = 'md',
    disabled = false,
    href,
    class: className = '',
    onclick,
    children,
  }: Props = $props();

  const base =
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
  const variants: Record<Variant, string> = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    outline:
      'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  };
  const sizes: Record<'sm' | 'md', string> = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
  };
  const cls = cn(base, variants[variant], sizes[size], className);
</script>

{#if href}
  <a {href} class={cls} aria-disabled={disabled}>{@render children?.()}</a>
{:else}
  <button {type} {disabled} class={cls} {onclick}>{@render children?.()}</button>
{/if}
