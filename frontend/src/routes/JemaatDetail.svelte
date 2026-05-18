<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { jemaatApi } from '$lib/api/jemaat';
  import { link } from 'svelte-spa-router';
  import { ChevronLeft } from 'lucide-svelte';
  import { formatDate } from '$lib/utils/date';
  import { genderLabel, maritalStatusLabel } from '$lib/utils/format';

  let { params } = $props<{ params: { id: string } }>();
  const id = $derived(Number(params.id));

  const q = createQuery(toStore(() => ({
    queryKey: ['jemaat', id],
    queryFn: () => jemaatApi.get(id),
  })));
</script>

<ProtectedRoute>
  {#snippet children()}
    <a href="/jemaat" use:link class="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
      <ChevronLeft class="h-4 w-4" /> Kembali
    </a>
    {#if $q.isLoading}
      <p>Memuat…</p>
    {:else if $q.error}
      <p class="text-destructive">{$q.error.message}</p>
    {:else if $q.data}
      <h1 class="mb-1 text-2xl font-bold">{$q.data.nama_lengkap}</h1>
      {#if $q.data.nama_panggilan}<p class="mb-6 text-muted-foreground">{$q.data.nama_panggilan}</p>{/if}

      <dl class="card grid grid-cols-1 gap-3 p-4 text-sm md:grid-cols-2">
        <div><dt class="text-muted-foreground">Jenis Kelamin</dt><dd>{genderLabel($q.data.jenis_kelamin)}</dd></div>
        <div><dt class="text-muted-foreground">Tanggal Lahir</dt><dd>{formatDate($q.data.tanggal_lahir ?? '')}</dd></div>
        <div><dt class="text-muted-foreground">Tempat Lahir</dt><dd>{$q.data.tempat_lahir ?? '-'}</dd></div>
        <div><dt class="text-muted-foreground">Alamat</dt><dd>{$q.data.alamat ?? '-'}</dd></div>
        <div><dt class="text-muted-foreground">Telepon</dt><dd>{$q.data.nomor_telepon ?? '-'}</dd></div>
        <div><dt class="text-muted-foreground">Email</dt><dd>{$q.data.email ?? '-'}</dd></div>
        <div><dt class="text-muted-foreground">Status Pernikahan</dt><dd>{maritalStatusLabel($q.data.status_pernikahan)}</dd></div>
        <div><dt class="text-muted-foreground">Tanggal Baptis</dt><dd>{formatDate($q.data.tanggal_baptis ?? '')}</dd></div>
        <div><dt class="text-muted-foreground">Tanggal Sidi</dt><dd>{formatDate($q.data.tanggal_sidi ?? '')}</dd></div>
        <div class="md:col-span-2"><dt class="text-muted-foreground">Catatan</dt><dd class="whitespace-pre-wrap">{$q.data.catatan ?? '-'}</dd></div>
      </dl>
    {/if}
  {/snippet}
</ProtectedRoute>
