<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import {
    pelayanDetailQuery,
    pelayanUpcomingJadwalQuery,
  } from '$lib/api/pelayan';
  import { t, formatDate } from '$lib/i18n';
  import { Calendar } from 'lucide-svelte';

  interface Props {
    params?: { id?: string };
  }
  const { params }: Props = $props();
  const id = $derived(params?.id ? Number(params.id) : null);

  const detail = pelayanDetailQuery(() => id);
  const jadwal = pelayanUpcomingJadwalQuery(() => id);
</script>

<AppShell>
  <div class="mb-4">
    <a href="#/pelayan" class="text-sm text-primary hover:underline">
      ← {t('pelayan.back', 'Kembali ke daftar pelayan')}
    </a>
  </div>

  {#if $detail.isLoading}
    <div class="space-y-3">
      <Skeleton class="h-8 w-1/3" />
      <Skeleton class="h-4 w-1/2" />
      <Skeleton class="h-32 w-full" />
    </div>
  {:else if $detail.isError}
    <p class="text-sm text-destructive">{$detail.error.message}</p>
  {:else if $detail.data}
    {@const p = $detail.data}
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">{p.nama_lengkap}</h1>
      {#if p.nama_panggilan}
        <p class="text-sm text-muted-foreground">"{p.nama_panggilan}"</p>
      {/if}
      <div class="mt-3 flex flex-wrap gap-1">
        {#each p.service_types as st (st.id)}
          <Badge color={st.warna}>{st.nama}</Badge>
        {:else}
          <span class="text-xs text-muted-foreground">
            {t('pelayan.no_service_types', 'Belum memilih jenis pelayanan.')}
          </span>
        {/each}
      </div>
      {#if p.catatan}
        <p class="mt-3 rounded-md border bg-card p-3 text-sm">{p.catatan}</p>
      {/if}
    </header>

    <section class="space-y-3">
      <h2 class="text-base font-semibold">
        {t('pelayan.upcoming', 'Jadwal pelayanan mendatang')}
      </h2>
      {#if $jadwal.isLoading}
        <div class="space-y-2">
          {#each Array(3) as _, i (i)}
            <Skeleton class="h-12 w-full" />
          {/each}
        </div>
      {:else if $jadwal.isError}
        <p class="text-sm text-destructive">{$jadwal.error.message}</p>
      {:else if !$jadwal.data || $jadwal.data.data.length === 0}
        <EmptyState
          icon={Calendar}
          title={t('pelayan.upcoming_empty', 'Belum ada jadwal mendatang.')}
          description={t('pelayan.upcoming_desc', 'Pelayan ini belum diassign ke kebaktian apapun.')}
        />
      {:else}
        <div class="overflow-x-auto rounded-lg border bg-card">
          <table class="w-full text-left text-sm">
            <thead class="bg-muted/40">
              <tr>
                <th class="px-3 py-2 font-medium">{t('jadwal.tanggal', 'Tanggal')}</th>
                <th class="px-3 py-2 font-medium">{t('jadwal.kebaktian', 'Kebaktian')}</th>
                <th class="px-3 py-2 font-medium">{t('jadwal.service_type', 'Jenis pelayanan')}</th>
                <th class="px-3 py-2 font-medium">{t('jadwal.status', 'Status')}</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              {#each $jadwal.data.data as entry (entry.id)}
                <tr class="hover:bg-muted/30">
                  <td class="px-3 py-2">
                    <p class="font-medium">{formatDate(entry.tanggal)}</p>
                    <p class="text-xs text-muted-foreground">{entry.waktu_mulai}</p>
                  </td>
                  <td class="px-3 py-2">
                    <a href={`#/kebaktian/${entry.kebaktian_id}`} class="hover:underline">
                      {entry.kebaktian_nama}
                    </a>
                    {#if entry.lokasi}
                      <p class="text-xs text-muted-foreground">{entry.lokasi}</p>
                    {/if}
                  </td>
                  <td class="px-3 py-2">
                    <Badge color={entry.service_type.warna}>{entry.service_type.nama}</Badge>
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">{entry.status}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</AppShell>
