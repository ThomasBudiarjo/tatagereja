<script lang="ts">
  import { location, push } from 'svelte-spa-router';
  import Icon from './Icon.svelte';

  type Tab = 'dashboard' | 'jemaat' | 'kebaktian' | 'pelayan' | 'more';

  const items: Array<{ k: Tab; path: string; label: string; icon: 'home' | 'users' | 'calendar' | 'grid' | 'more' }> = [
    { k: 'dashboard', path: '/', label: 'Beranda', icon: 'home' },
    { k: 'jemaat', path: '/jemaat', label: 'Jemaat', icon: 'users' },
    { k: 'kebaktian', path: '/kebaktian', label: 'Kebaktian', icon: 'calendar' },
    { k: 'pelayan', path: '/pelayan', label: 'Pelayan', icon: 'grid' },
    { k: 'more', path: '/more', label: 'Lainnya', icon: 'more' },
  ];

  function isActive(path: string): boolean {
    if (path === '/') return $location === '/';
    return $location === path;
  }
</script>

<div class="bottom-nav">
  {#each items as it (it.k)}
    <button
      class="bn-item {isActive(it.path) ? 'active' : ''}"
      type="button"
      onclick={() => push(it.path)}
    >
      <span class="bn-pill">
        <Icon name={it.icon} size={20} fill={isActive(it.path)} />
      </span>
      {it.label}
    </button>
  {/each}
</div>
