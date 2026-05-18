<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { keluargaApi } from '$lib/api/keluarga';
  import { link } from 'svelte-spa-router';
  import { ChevronLeft } from 'lucide-svelte';

  let { params } = $props<{ params: { id: string } }>();
  const id = $derived(Number(params.id));

  const q = createQuery(toStore(() => ({
    queryKey: ['keluarga', id],
    queryFn: () => keluargaApi.get(id),
  })));
</script>

<ProtectedRoute>
  {#snippet children()}
    <a href="/keluarga" use:link class="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
      <ChevronLeft class="h-4 w-4" /> Kembali
    </a>
    {#if $q.isLoading}
      <p>Memuat…</p>
    {:else if $q.error}
      <p class="text-destructive">{$q.error.message}</p>
    {:else if $q.data}
      <h1 class="mb-1 text-2xl font-bold">{$q.data.keluarga.nama_keluarga}</h1>
      {#if $q.data.keluarga.alamat}<p class="mb-4 text-muted-foreground">{$q.data.keluarga.alamat}</p>{/if}

      <h2 class="mb-2 text-lg font-semibold">Anggota</h2>
      {#if $q.data.members.length === 0}
        <p class="text-sm text-muted-foreground">Belum ada anggota.</p>
      {:else}
        <ul class="space-y-2">
          {#each $q.data.members as m (m.id)}
            <li class="card flex items-center justify-between p-3">
              <a href={`/jemaat/${m.id}`} use:link class="font-medium underline-offset-2 hover:underline">{m.nama_lengkap}</a>
              <span class="text-xs text-muted-foreground">{m.nama_panggilan ?? ''}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/snippet}
</ProtectedRoute>
