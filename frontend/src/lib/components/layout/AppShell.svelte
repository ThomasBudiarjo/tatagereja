<script lang="ts">
  import type { Snippet } from 'svelte';
  import { location } from 'svelte-spa-router';
  import { auth } from '$lib/stores/auth.svelte';
  import { t } from '$lib/i18n';
  import { cn } from '$lib/utils/cn';

  interface Props {
    children?: Snippet;
  }

  const { children }: Props = $props();

  const navLinks = [
    { href: '/', label: t('nav.dashboard', 'Dashboard') },
    { href: '/jemaat', label: t('nav.jemaat', 'Jemaat') },
    { href: '/pelayan', label: t('nav.pelayan', 'Pelayan') },
    { href: '/service-types', label: t('nav.service_types', 'Jenis Pelayanan') },
    { href: '/kebaktian', label: t('nav.kebaktian', 'Kebaktian') },
  ];

  function isActive(href: string, loc: string) {
    if (href === '/') return loc === '/' || loc === '';
    return loc === href || loc.startsWith(`${href}/`);
  }
</script>

<div class="min-h-screen bg-background text-foreground">
  <header class="border-b bg-card">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
      <div class="flex items-center gap-6">
        <a href="#/" class="text-base font-semibold">Shepherd</a>
        <nav class="hidden gap-1 md:flex">
          {#each navLinks as link (link.href)}
            <a
              href={`#${link.href}`}
              class={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground',
                isActive(link.href, $location) && 'bg-accent text-accent-foreground',
              )}
            >
              {link.label}
            </a>
          {/each}
        </nav>
      </div>
      <div class="flex items-center gap-3">
        {#if auth.user}
          <span class="hidden text-sm text-muted-foreground sm:inline">
            {auth.user.display_name}
          </span>
          <button
            type="button"
            onclick={() => auth.logout()}
            class="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          >
            {t('nav.logout', 'Keluar')}
          </button>
        {/if}
      </div>
    </div>
    <nav class="border-t md:hidden">
      <div class="flex gap-1 overflow-x-auto px-4 py-2">
        {#each navLinks as link (link.href)}
          <a
            href={`#${link.href}`}
            class={cn(
              'shrink-0 rounded-md px-3 py-1 text-sm font-medium hover:bg-accent',
              isActive(link.href, $location) && 'bg-accent text-accent-foreground',
            )}
          >
            {link.label}
          </a>
        {/each}
      </div>
    </nav>
  </header>
  <main class="mx-auto max-w-6xl px-4 py-6">
    {@render children?.()}
  </main>
</div>
