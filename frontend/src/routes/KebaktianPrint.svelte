<script lang="ts">
  import { onMount } from 'svelte';
  import {
    kebaktianDetailQuery,
    kebaktianJadwalQuery,
  } from '$lib/api/kebaktian';
  import { t, formatDate } from '$lib/i18n';

  interface Props {
    params?: { id?: string };
  }
  const { params }: Props = $props();
  const id = $derived(params?.id ? Number(params.id) : null);

  const detail = kebaktianDetailQuery(() => id);
  const jadwal = kebaktianJadwalQuery(() => id);

  let printed = $state(false);

  $effect(() => {
    if (!printed && $detail.data && $jadwal.data) {
      printed = true;
      setTimeout(() => window.print(), 300);
    }
  });

  onMount(() => {
    document.documentElement.classList.add('print-mode');
    return () => document.documentElement.classList.remove('print-mode');
  });
</script>

<div class="mx-auto max-w-3xl bg-white p-8 print:p-0 text-black">
  <div class="mb-4 flex items-center justify-end gap-2 print:hidden">
    <button
      type="button"
      class="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
      onclick={() => window.print()}
    >
      {t('print.print', 'Cetak')}
    </button>
    <button
      type="button"
      class="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
      onclick={() => window.close()}
    >
      {t('print.close', 'Tutup')}
    </button>
  </div>

  {#if $detail.isLoading || $jadwal.isLoading}
    <p class="text-sm text-gray-500">Memuat…</p>
  {:else if $detail.data}
    {@const k = $detail.data}
    <header class="mb-6 border-b border-black pb-4">
      <p class="text-xs uppercase tracking-wide text-gray-600">Jadwal Pelayanan</p>
      <h1 class="text-2xl font-bold">{k.nama}</h1>
      <p class="mt-1 text-sm">
        {formatDate(k.tanggal)} · {k.waktu_mulai}{k.lokasi ? ` · ${k.lokasi}` : ''}
      </p>
      {#if k.tema}
        <p class="text-sm">Tema: {k.tema}</p>
      {/if}
      {#if k.pengkhotbah}
        <p class="text-sm">Pengkhotbah: {k.pengkhotbah}</p>
      {/if}
    </header>

    <table class="w-full text-left text-sm">
      <thead>
        <tr class="border-b-2 border-black">
          <th class="py-2 pr-2 font-semibold">Jenis Pelayanan</th>
          <th class="py-2 pr-2 font-semibold">Pelayan</th>
          <th class="py-2 font-semibold">Catatan</th>
        </tr>
      </thead>
      <tbody>
        {#each $jadwal.data?.data ?? [] as slot (slot.id)}
          <tr class="border-b border-gray-300 align-top">
            <td class="py-2 pr-2">{slot.service_type_name}</td>
            <td class="py-2 pr-2">{slot.pelayan_nama ?? '—'}</td>
            <td class="py-2">{slot.catatan ?? ''}</td>
          </tr>
        {:else}
          <tr><td colspan="3" class="py-4 text-center text-gray-500">Belum ada jadwal.</td></tr>
        {/each}
      </tbody>
    </table>

    <footer class="mt-12 pt-4 text-xs text-gray-500">
      Dicetak {formatDate(new Date().toISOString().slice(0, 10))} · Shepherd
    </footer>
  {/if}
</div>

<style>
  @media print {
    @page { margin: 1.5cm; }
    :global(body) {
      background: white;
    }
  }
</style>
