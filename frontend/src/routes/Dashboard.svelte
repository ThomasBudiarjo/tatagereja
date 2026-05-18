<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { jemaatApi } from '$lib/api/jemaat';
  import { keluargaApi } from '$lib/api/keluarga';
  import { pelayanApi } from '$lib/api/pelayan';
  import { kebaktianApi } from '$lib/api/kebaktian';
  import { auth } from '$lib/stores/auth.svelte';
  import { link } from 'svelte-spa-router';
  import { formatDateTime } from '$lib/utils/date';

  const jemaatQ = createQuery(toStore(() => ({
    queryKey: ['jemaat', 'count'],
    queryFn: () => jemaatApi.list({ limit: 1, offset: 0 }),
  })));
  const keluargaQ = createQuery(toStore(() => ({
    queryKey: ['keluarga', 'count'],
    queryFn: () => keluargaApi.list({ limit: 1, offset: 0 }),
  })));
  const pelayanQ = createQuery(toStore(() => ({
    queryKey: ['pelayan', 'count'],
    queryFn: () => pelayanApi.list({ limit: 1, offset: 0 }),
  })));
  const kebaktianQ = createQuery(toStore(() => ({
    queryKey: ['kebaktian', 'upcoming'],
    queryFn: () => kebaktianApi.list({ limit: 5, offset: 0 }),
  })));
</script>

<ProtectedRoute>
  {#snippet children()}
    <h1 class="mb-1 text-2xl font-bold">Selamat datang, {auth.user?.display_name ?? ''}</h1>
    <p class="mb-6 text-sm text-muted-foreground">{auth.user?.church_name ?? ''}</p>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      <a href="/jemaat" use:link class="card p-4 hover:bg-accent">
        <p class="text-xs uppercase text-muted-foreground">Jemaat</p>
        <p class="text-2xl font-bold">{$jemaatQ.data?.total ?? '–'}</p>
      </a>
      <a href="/keluarga" use:link class="card p-4 hover:bg-accent">
        <p class="text-xs uppercase text-muted-foreground">Keluarga</p>
        <p class="text-2xl font-bold">{$keluargaQ.data?.total ?? '–'}</p>
      </a>
      <a href="/pelayan" use:link class="card p-4 hover:bg-accent">
        <p class="text-xs uppercase text-muted-foreground">Pelayan</p>
        <p class="text-2xl font-bold">{$pelayanQ.data?.total ?? '–'}</p>
      </a>
      <a href="/kebaktian" use:link class="card p-4 hover:bg-accent">
        <p class="text-xs uppercase text-muted-foreground">Kebaktian</p>
        <p class="text-2xl font-bold">
          {('total' in ($kebaktianQ.data ?? {}) ? ($kebaktianQ.data as { total: number }).total : ($kebaktianQ.data?.data?.length ?? 0))}
        </p>
      </a>
    </div>

    <div class="mt-8">
      <h2 class="mb-3 text-lg font-semibold">Kebaktian terbaru</h2>
      {#if $kebaktianQ.isLoading}
        <p class="text-sm text-muted-foreground">Memuat…</p>
      {:else if !$kebaktianQ.data || ($kebaktianQ.data.data?.length ?? 0) === 0}
        <p class="text-sm text-muted-foreground">Belum ada kebaktian. <a href="/kebaktian" use:link class="underline">Tambah</a>.</p>
      {:else}
        <ul class="space-y-2">
          {#each $kebaktianQ.data.data as kb (kb.id)}
            <li class="card flex items-center justify-between p-3">
              <div>
                <p class="font-medium">{kb.nama}</p>
                <p class="text-xs text-muted-foreground">{formatDateTime(kb.waktu_mulai)}</p>
              </div>
              <a href={`/kebaktian/${kb.id}/jadwal`} use:link class="btn-secondary text-xs">Jadwal</a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/snippet}
</ProtectedRoute>
