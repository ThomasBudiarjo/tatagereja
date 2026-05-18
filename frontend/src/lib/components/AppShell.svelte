<script lang="ts">
  import { link, location, push } from 'svelte-spa-router';
  import { auth } from '$lib/stores/auth.svelte';
  import { LayoutDashboard, Users, Home, UserCheck, ListChecks, Calendar, Menu, LogOut } from 'lucide-svelte';

  let { children } = $props<{ children: () => unknown }>();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/jemaat', label: 'Jemaat', icon: Users },
    { href: '/keluarga', label: 'Keluarga', icon: Home },
    { href: '/pelayan', label: 'Pelayan', icon: UserCheck },
    { href: '/service-types', label: 'Jenis Pelayanan', icon: ListChecks },
    { href: '/kebaktian', label: 'Kebaktian', icon: Calendar },
  ];

  let mobileOpen = $state(false);

  function isActive(href: string): boolean {
    if (href === '/') return $location === '/';
    return $location === href || $location.startsWith(href + '/');
  }

  async function handleLogout() {
    await auth.logout();
  }
</script>

<div class="flex min-h-screen flex-col md:flex-row">
  <!-- Sidebar (desktop) -->
  <aside class="hidden md:flex md:w-60 md:flex-col md:border-r md:border-border md:bg-secondary/30">
    <div class="border-b border-border p-4">
      <a href="/" use:link class="text-lg font-semibold">Tata Gereja</a>
      <p class="text-xs text-muted-foreground">{auth.user?.church_name ?? ''}</p>
    </div>
    <nav class="flex-1 space-y-1 p-2">
      {#each navItems as item (item.href)}
        <a
          href={item.href}
          use:link
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium {isActive(item.href)
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-accent hover:text-accent-foreground'}"
        >
          <item.icon class="h-4 w-4" />
          {item.label}
        </a>
      {/each}
    </nav>
    <div class="border-t border-border p-2">
      <button class="btn-ghost w-full justify-start text-sm" onclick={handleLogout}>
        <LogOut class="h-4 w-4" /> Keluar
      </button>
    </div>
  </aside>

  <!-- Mobile top bar -->
  <header class="flex items-center justify-between border-b border-border p-3 md:hidden">
    <button class="btn-ghost min-w-11 min-h-11 p-2" onclick={() => (mobileOpen = !mobileOpen)} aria-label="Menu">
      <Menu class="h-5 w-5" />
    </button>
    <h1 class="font-semibold">Tata Gereja</h1>
    <button class="btn-ghost min-w-11 min-h-11 p-2" onclick={handleLogout} aria-label="Logout">
      <LogOut class="h-5 w-5" />
    </button>
  </header>

  <!-- Mobile drawer -->
  {#if mobileOpen}
    <div
      class="fixed inset-0 z-40 bg-black/40 md:hidden"
      onclick={() => (mobileOpen = false)}
      onkeydown={(e) => e.key === 'Escape' && (mobileOpen = false)}
      role="button"
      tabindex="-1"
    ></div>
    <nav class="fixed inset-y-0 left-0 z-50 w-64 bg-background p-4 shadow-xl md:hidden">
      <div class="mb-4">
        <p class="text-lg font-semibold">Tata Gereja</p>
        <p class="text-xs text-muted-foreground">{auth.user?.church_name ?? ''}</p>
      </div>
      {#each navItems as item (item.href)}
        <a
          href={item.href}
          use:link
          onclick={() => (mobileOpen = false)}
          class="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium {isActive(item.href)
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-accent'}"
        >
          <item.icon class="h-4 w-4" />
          {item.label}
        </a>
      {/each}
    </nav>
  {/if}

  <main class="flex-1 overflow-x-hidden">
    <div class="mx-auto max-w-6xl p-4 md:p-6">
      {@render children()}
    </div>
  </main>
</div>
