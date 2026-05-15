<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import KeluargaForm from '$lib/components/domain/KeluargaForm.svelte';
  import {
    keluargaListQuery,
    useCreateKeluarga,
  } from '$lib/api/keluarga';
  import { toast } from '$lib/stores/toast.svelte';
  import { t } from '$lib/i18n';
  import type { CreateKeluargaInput } from '$lib/types';
  import { Users } from 'lucide-svelte';

  let q = $state('');
  let limit = $state(25);
  let offset = $state(0);
  let creating = $state(false);

  const query = keluargaListQuery(() => ({ q, limit, offset }));
  const create = useCreateKeluarga();

  function handleSearch(e: Event) {
    e.preventDefault();
    offset = 0;
  }

  function submitCreate(data: CreateKeluargaInput) {
    $create.mutate(data, {
      onSuccess: (k) => {
        creating = false;
        toast.success(`Keluarga "${k.nama_keluarga}" ditambahkan.`);
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function prevPage() {
    offset = Math.max(0, offset - limit);
  }
  function nextPage() {
    offset = offset + limit;
  }
</script>

<AppShell>
  <header class="mb-6 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
    <div>
      <h1 class="text-2xl font-semibold">{t('keluarga.title', 'Keluarga')}</h1>
      <p class="text-sm text-muted-foreground">
        {t('keluarga.subtitle', 'Daftar keluarga dan anggotanya.')}
      </p>
    </div>
    <Button onclick={() => (creating = true)}>+ {t('keluarga.add', 'Tambah Keluarga')}</Button>
  </header>

  <form class="mb-4 flex gap-2" onsubmit={handleSearch}>
    <Input placeholder={t('keluarga.search', 'Cari nama atau alamat...')} bind:value={q} />
    <Button type="submit" variant="outline">{t('common.search', 'Cari')}</Button>
  </form>

  {#if $query.isLoading}
    <div class="space-y-2">
      {#each Array(5) as _, i (i)}
        <Skeleton class="h-12 w-full" />
      {/each}
    </div>
  {:else if $query.isError}
    <p class="text-sm text-destructive">{$query.error.message}</p>
  {:else if $query.data}
    {#if $query.data.data.length === 0}
      <EmptyState
        icon={Users}
        title={t('keluarga.empty.title', 'Belum ada keluarga')}
        description={t('keluarga.empty.desc', 'Mulai dengan menambah satu keluarga.')}
      >
        <Button onclick={() => (creating = true)}>+ {t('keluarga.add', 'Tambah Keluarga')}</Button>
      </EmptyState>
    {:else}
      <div class="overflow-x-auto rounded-lg border bg-card">
        <table class="w-full text-left text-sm">
          <thead class="bg-muted/40">
            <tr>
              <th class="px-3 py-2 font-medium">{t('keluarga.col.nama', 'Nama')}</th>
              <th class="px-3 py-2 font-medium">{t('keluarga.col.alamat', 'Alamat')}</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y">
            {#each $query.data.data as k (k.id)}
              <tr class="hover:bg-muted/30">
                <td class="px-3 py-2">
                  <a href={`#/keluarga/${k.id}`} class="font-medium hover:underline">
                    {k.nama_keluarga}
                  </a>
                </td>
                <td class="px-3 py-2 text-muted-foreground">{k.alamat ?? '-'}</td>
                <td class="px-3 py-2 text-right">
                  <a href={`#/keluarga/${k.id}`} class="text-sm text-primary hover:underline">
                    {t('common.detail', 'Detail')}
                  </a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {t('common.showing', 'Menampilkan')} {$query.data.data.length} dari {$query.data.total}
        </span>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" onclick={prevPage} disabled={offset === 0}>← Prev</Button>
          <Button
            variant="outline"
            size="sm"
            onclick={nextPage}
            disabled={offset + limit >= $query.data.total}
          >
            Next →
          </Button>
        </div>
      </div>
    {/if}
  {/if}
</AppShell>

<Modal
  open={creating}
  title={t('keluarga.add', 'Tambah Keluarga')}
  onClose={() => (creating = false)}
  size="sm"
>
  <KeluargaForm
    submitting={$create.isPending}
    onCancel={() => (creating = false)}
    onSubmit={submitCreate}
  />
</Modal>
