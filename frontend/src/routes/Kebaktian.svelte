<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import KebaktianForm from '$lib/components/domain/KebaktianForm.svelte';
  import {
    kebaktianListQuery,
    useCreateKebaktian,
  } from '$lib/api/kebaktian';
  import { t, formatDate } from '$lib/i18n';
  import type { CreateKebaktianInput } from '$lib/types';

  function today(): string {
    return new Date().toISOString().slice(0, 10);
  }
  function plusDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  let from = $state(today());
  let to = $state(plusDays(90));
  let creating = $state(false);

  const query = kebaktianListQuery(() => ({ from, to, limit: 100 }));
  const create = useCreateKebaktian();

  function submitCreate(data: CreateKebaktianInput) {
    $create.mutate(data, {
      onSuccess: () => (creating = false),
    });
  }
</script>

<AppShell>
  <header class="mb-6 flex items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold">{t('kebaktian.title', 'Kebaktian')}</h1>
      <p class="text-sm text-muted-foreground">
        {t('kebaktian.subtitle', 'Atur jadwal kebaktian & persekutuan.')}
      </p>
    </div>
    <Button onclick={() => (creating = true)}>+ {t('kebaktian.add', 'Tambah Kebaktian')}</Button>
  </header>

  <div class="mb-4 flex flex-wrap items-end gap-3">
    <div class="space-y-1">
      <label class="block text-xs font-medium text-muted-foreground" for="from">
        {t('kebaktian.from', 'Dari tanggal')}
      </label>
      <Input id="from" type="date" bind:value={from} />
    </div>
    <div class="space-y-1">
      <label class="block text-xs font-medium text-muted-foreground" for="to">
        {t('kebaktian.to', 'Sampai tanggal')}
      </label>
      <Input id="to" type="date" bind:value={to} />
    </div>
  </div>

  {#if $query.isLoading}
    <p class="text-sm text-muted-foreground">Memuat…</p>
  {:else if $query.isError}
    <p class="text-sm text-destructive">{$query.error.message}</p>
  {:else if $query.data}
    {#if $query.data.data.length === 0}
      <div class="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        Belum ada kebaktian di rentang ini.
      </div>
    {:else}
      <div class="overflow-hidden rounded-lg border bg-card">
        <table class="w-full text-left text-sm">
          <thead class="bg-muted/40">
            <tr>
              <th class="px-3 py-2 font-medium">{t('kebaktian.col.tanggal', 'Tanggal')}</th>
              <th class="px-3 py-2 font-medium">{t('kebaktian.col.nama', 'Nama')}</th>
              <th class="px-3 py-2 font-medium">{t('kebaktian.col.lokasi', 'Lokasi')}</th>
              <th class="px-3 py-2 font-medium">{t('kebaktian.col.pengkhotbah', 'Pengkhotbah')}</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y">
            {#each $query.data.data as k (k.id)}
              <tr class="hover:bg-muted/30">
                <td class="px-3 py-2 font-medium">
                  {formatDate(k.tanggal)}
                  <span class="ml-1 text-xs text-muted-foreground">{k.waktu_mulai}</span>
                </td>
                <td class="px-3 py-2">
                  <a href={`#/kebaktian/${k.id}`} class="font-medium text-foreground hover:underline">
                    {k.nama}
                  </a>
                  {#if k.tema}
                    <p class="text-xs text-muted-foreground">{k.tema}</p>
                  {/if}
                </td>
                <td class="px-3 py-2 text-muted-foreground">{k.lokasi ?? '-'}</td>
                <td class="px-3 py-2 text-muted-foreground">{k.pengkhotbah ?? '-'}</td>
                <td class="px-3 py-2 text-right">
                  <a href={`#/kebaktian/${k.id}`} class="text-sm text-primary hover:underline">
                    {t('kebaktian.edit_jadwal', 'Atur jadwal')}
                  </a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</AppShell>

<Modal
  open={creating}
  title={t('kebaktian.add', 'Tambah Kebaktian')}
  onClose={() => (creating = false)}
>
  <KebaktianForm
    submitting={$create.isPending}
    onCancel={() => (creating = false)}
    onSubmit={submitCreate}
  />
</Modal>
