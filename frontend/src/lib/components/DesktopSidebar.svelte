<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { location, push } from 'svelte-spa-router';
  import { auth } from '$lib/stores/auth.svelte';
  import { jemaatApi } from '$lib/api/jemaat';
  import { keluargaApi } from '$lib/api/keluarga';
  import { pelayanApi } from '$lib/api/pelayan';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { kebaktianApi } from '$lib/api/kebaktian';
  import type { Kebaktian, ListWrap, Paginated } from '$lib/types';
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';

  const jemaatQ = createQuery(
    toStore(() => ({ queryKey: ['jemaat', 'count'], queryFn: () => jemaatApi.list({ limit: 1, offset: 0 }) })),
  );
  const keluargaQ = createQuery(
    toStore(() => ({ queryKey: ['keluarga', 'count'], queryFn: () => keluargaApi.list({ limit: 1, offset: 0 }) })),
  );
  const pelayanQ = createQuery(
    toStore(() => ({ queryKey: ['pelayan', 'count'], queryFn: () => pelayanApi.list({ limit: 1, offset: 0 }) })),
  );
  const stQ = createQuery(
    toStore(() => ({ queryKey: ['service-types'], queryFn: () => serviceTypesApi.list() })),
  );
  const kebaktianQ = createQuery(
    toStore(() => ({
      queryKey: ['kebaktian', 'count'],
      queryFn: () =>
        kebaktianApi.list({ limit: 1, offset: 0 }) as Promise<Paginated<Kebaktian> | ListWrap<Kebaktian>>,
    })),
  );

  function kebaktianCount(d: Paginated<Kebaktian> | ListWrap<Kebaktian> | undefined): number | undefined {
    if (!d) return undefined;
    if ('total' in d) return d.total;
    return d.data.length;
  }

  type NavItem = { path: string; label: string; icon: 'home' | 'users' | 'home2' | 'person' | 'tag' | 'calendar' | 'grid'; count?: number };

  const manajemen = $derived<NavItem[]>([
    { path: '/', label: 'Beranda', icon: 'home' },
    { path: '/jemaat', label: 'Jemaat', icon: 'users', count: $jemaatQ.data?.total },
    { path: '/keluarga', label: 'Keluarga', icon: 'home2', count: $keluargaQ.data?.total },
  ]);
  const pelayanan = $derived<NavItem[]>([
    { path: '/pelayan', label: 'Pelayan', icon: 'person', count: $pelayanQ.data?.total },
    { path: '/service-types', label: 'Jenis Pelayanan', icon: 'tag', count: $stQ.data?.data?.length },
    { path: '/kebaktian', label: 'Kebaktian', icon: 'calendar', count: kebaktianCount($kebaktianQ.data) },
    { path: '/jadwal-master', label: 'Jadwal Master', icon: 'grid' },
  ]);

  function isActive(path: string): boolean {
    const loc = $location;
    if (path === '/') return loc === '/';
    if (path === '/jemaat') return loc === '/jemaat' || loc.startsWith('/jemaat/');
    if (path === '/keluarga') return loc === '/keluarga' || loc.startsWith('/keluarga/');
    if (path === '/kebaktian') return loc === '/kebaktian' || loc.startsWith('/kebaktian/');
    return loc === path;
  }

  async function handleLogout() {
    await auth.logout();
  }
</script>

<aside class="dt-sidebar">
  <button
    type="button"
    class="dt-brand"
    onclick={() => push('/')}
    style="background: none; border: none; padding: 4px 10px 18px; cursor: pointer; text-align: left; width: 100%;"
  >
    <div class="dt-brand-mark">tg</div>
    <div style="min-width: 0;">
      <div class="dt-brand-name">Tata Gereja</div>
      <div class="dt-brand-sub">{auth.user?.church_name ?? ''}</div>
    </div>
  </button>

  <div>
    <div class="dt-side-label">Manajemen</div>
    {#each manajemen as it (it.path)}
      <button
        type="button"
        class="dt-nav-item {isActive(it.path) ? 'active' : ''}"
        onclick={() => push(it.path)}
      >
        <Icon name={it.icon} size={16} />
        <span>{it.label}</span>
        {#if it.count != null}
          <span class="dt-nav-count">{it.count}</span>
        {/if}
      </button>
    {/each}
  </div>

  <div>
    <div class="dt-side-label">Pelayanan</div>
    {#each pelayanan as it (it.path)}
      <button
        type="button"
        class="dt-nav-item {isActive(it.path) ? 'active' : ''}"
        onclick={() => push(it.path)}
      >
        <Icon name={it.icon} size={16} />
        <span>{it.label}</span>
        {#if it.count != null}
          <span class="dt-nav-count">{it.count}</span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="dt-side-profile">
    <Avatar name={auth.user?.display_name ?? '?'} size="sm" />
    <div style="flex: 1; min-width: 0;">
      <div class="dt-side-profile-name">{auth.user?.display_name ?? ''}</div>
      <div class="dt-side-profile-church">{auth.user?.email ?? ''}</div>
    </div>
    <button class="icon-btn" type="button" title="Keluar" onclick={handleLogout} style="width: 32px; height: 32px;">
      <Icon name="logout" size={16} />
    </button>
  </div>
</aside>
