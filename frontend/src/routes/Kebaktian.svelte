<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import KebaktianForm from '$lib/components/domain/KebaktianForm.svelte';
  import RecurringKebaktianForm from '$lib/components/domain/RecurringKebaktianForm.svelte';
  import {
    kebaktianListQuery,
    useCreateKebaktian,
    useCreateRecurringKebaktian,
  } from '$lib/api/kebaktian';
  import { toast } from '$lib/stores/toast.svelte';
  import { t, formatDate } from '$lib/i18n';
  import type { CreateKebaktianInput, CreateRecurringKebaktianInput } from '$lib/types';
  import { CalendarDays } from 'lucide-svelte';

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
  let creatingSeries = $state(false);

  const query = kebaktianListQuery(() => ({ from, to, limit: 100 }));
  const create = useCreateKebaktian();
  const createSeries = useCreateRecurringKebaktian();

  function submitCreate(data: CreateKebaktianInput) {
    $create.mutate(data, {
      onSuccess: (k) => {
        creating = false;
        toast.success(`Kebaktian "${k.nama}" dibuat.`);
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function submitSeries(data: CreateRecurringKebaktianInput) {
    $createSeries.mutate(data, {
      onSuccess: (res) => {
        creatingSeries = false;
        toast.success(`${res.created.length} kebaktian dibuat.`);
      },
      onError: (err) => toast.error(err.message),
    });
  }
</script>

<AppShell>
  <header class="mb-6 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
    <div>
      <h1 class="text-2xl font-semibold">{t('kebaktian.title', 'Kebaktian')}</h1>
      <p class="text-sm text-muted-foreground">
        {t('kebaktian.subtitle', 'Atur jadwal kebaktian & persekutuan.')}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button variant="outline" onclick={() => (creatingSeries = true)}>
        {t('kebaktian.add_series', 'Buat seri mingguan')}
      </Button>
      <Button onclick={() => (creating = true)}>+ {t('kebaktian.add', 'Tambah Kebaktian')}</Button>
    </div>
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
    <div class="space-y-2">
      {#each Array(4) as _, i (i)}
        <Skeleton class="h-14 w-full" />
      {/each}
    </div>
  {:else if $query.isError}
    <p class="text-sm text-destructive">{$query.error.message}</p>
  {:else if $query.data}
    {#if $query.data.data.length === 0}
      <EmptyState
        icon={CalendarDays}
        title={t('kebaktian.empty.title', 'Belum ada kebaktian di rentang ini')}
        description={t('kebaktian.empty.desc', 'Buat satu kebaktian atau seri mingguan untuk mulai mengatur jadwal pelayanan.')}
      >
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" onclick={() => (creatingSeries = true)}>
            {t('kebaktian.add_series', 'Buat seri mingguan')}
          </Button>
          <Button onclick={() => (creating = true)}>+ {t('kebaktian.add', 'Tambah Kebaktian')}</Button>
        </div>
      </EmptyState>
    {:else}
      <div class="overflow-x-auto rounded-lg border bg-card">
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

<Modal
  open={creatingSeries}
  title={t('kebaktian.add_series', 'Buat seri kebaktian mingguan')}
  onClose={() => (creatingSeries = false)}
>
  <RecurringKebaktianForm
    submitting={$createSeries.isPending}
    onCancel={() => (creatingSeries = false)}
    onSubmit={submitSeries}
  />
</Modal>
