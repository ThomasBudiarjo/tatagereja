<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import PelayanForm from '$lib/components/domain/PelayanForm.svelte';
  import { jemaatListQuery } from '$lib/api/jemaat';
  import { serviceTypesListQuery } from '$lib/api/service-types';
  import {
    pelayanListQuery,
    useCreatePelayan,
    useUpdatePelayan,
    useDeletePelayan,
  } from '$lib/api/pelayan';
  import { toast } from '$lib/stores/toast.svelte';
  import { t } from '$lib/i18n';
  import type {
    CreatePelayanInput,
    Pelayan,
  } from '$lib/types';
  import { ListChecks } from 'lucide-svelte';

  let q = $state('');
  let limit = $state(25);
  let offset = $state(0);
  let creating = $state(false);
  let editing = $state<Pelayan | null>(null);

  const query = pelayanListQuery(() => ({ q, limit, offset }));
  const jemaatQ = jemaatListQuery(() => ({ limit: 200 }));
  const stQ = serviceTypesListQuery();
  const create = useCreatePelayan();
  const update = useUpdatePelayan();
  const remove = useDeletePelayan();

  function handleSearch(e: Event) {
    e.preventDefault();
    offset = 0;
  }

  function submitCreate(data: CreatePelayanInput) {
    $create.mutate(data, {
      onSuccess: (p) => {
        creating = false;
        toast.success(`${p.nama_lengkap} ditambahkan sebagai pelayan.`);
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function submitUpdate(data: CreatePelayanInput) {
    if (!editing) return;
    $update.mutate(
      {
        id: editing.id,
        data: {
          catatan: data.catatan,
          service_type_ids: data.service_type_ids,
        },
      },
      {
        onSuccess: (p) => {
          editing = null;
          toast.success(`${p.nama_lengkap} diperbarui.`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function handleDelete(p: Pelayan) {
    if (!confirm(t('pelayan.confirm_delete', `Hapus status pelayan untuk ${p.nama_lengkap}?`))) return;
    $remove.mutate(p.id, {
      onSuccess: () => toast.success('Pelayan dihapus.'),
      onError: (err) => toast.error(err.message),
    });
  }
</script>

<AppShell>
  <header class="mb-6 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
    <div>
      <h1 class="text-2xl font-semibold">{t('pelayan.title', 'Pelayan')}</h1>
      <p class="text-sm text-muted-foreground">
        {t('pelayan.subtitle', 'Jemaat yang melayani di kebaktian.')}
      </p>
    </div>
    <Button onclick={() => (creating = true)}>+ {t('pelayan.add', 'Tambah Pelayan')}</Button>
  </header>

  <form class="mb-4 flex gap-2" onsubmit={handleSearch}>
    <Input placeholder={t('pelayan.search_placeholder', 'Cari nama pelayan...')} bind:value={q} />
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
        icon={ListChecks}
        title={t('pelayan.empty.title', 'Belum ada pelayan')}
        description={t('pelayan.empty.desc', 'Pilih satu jemaat dan tambahkan sebagai pelayan.')}
      >
        <Button onclick={() => (creating = true)}>+ {t('pelayan.add', 'Tambah Pelayan')}</Button>
      </EmptyState>
    {:else}
      <div class="overflow-x-auto rounded-lg border bg-card">
        <table class="w-full text-left text-sm">
          <thead class="bg-muted/40">
            <tr>
              <th class="px-3 py-2 font-medium">{t('pelayan.col.nama', 'Nama')}</th>
              <th class="px-3 py-2 font-medium">{t('pelayan.col.service_types', 'Jenis pelayanan')}</th>
              <th class="px-3 py-2 font-medium">{t('pelayan.col.catatan', 'Catatan')}</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y">
            {#each $query.data.data as p (p.id)}
              <tr class="hover:bg-muted/30">
                <td class="px-3 py-2 font-medium">
                  <a href={`#/pelayan/${p.id}`} class="hover:underline">{p.nama_lengkap}</a>
                </td>
                <td class="px-3 py-2">
                  <div class="flex flex-wrap gap-1">
                    {#each p.service_types as st (st.id)}
                      <Badge color={st.warna}>{st.nama}</Badge>
                    {:else}
                      <span class="text-xs text-muted-foreground">—</span>
                    {/each}
                  </div>
                </td>
                <td class="px-3 py-2 text-muted-foreground">{p.catatan ?? '-'}</td>
                <td class="px-3 py-2 text-right">
                  <button
                    type="button"
                    class="mr-3 text-sm text-primary hover:underline"
                    onclick={() => (editing = p)}
                  >
                    {t('common.edit', 'Edit')}
                  </button>
                  <button
                    type="button"
                    class="text-sm text-destructive hover:underline"
                    onclick={() => handleDelete(p)}
                  >
                    {t('common.remove', 'Hapus')}
                  </button>
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
  title={t('pelayan.add', 'Tambah Pelayan')}
  onClose={() => (creating = false)}
>
  <PelayanForm
    mode="create"
    jemaatList={$jemaatQ.data?.data ?? []}
    serviceTypes={$stQ.data?.data ?? []}
    submitting={$create.isPending}
    onCancel={() => (creating = false)}
    onSubmit={submitCreate}
  />
</Modal>

<Modal
  open={editing !== null}
  title={t('pelayan.edit', 'Ubah Pelayan')}
  onClose={() => (editing = null)}
>
  {#if editing}
    <PelayanForm
      mode="edit"
      initial={editing}
      jemaatList={$jemaatQ.data?.data ?? []}
      serviceTypes={$stQ.data?.data ?? []}
      submitting={$update.isPending}
      onCancel={() => (editing = null)}
      onSubmit={submitUpdate}
    />
  {/if}
</Modal>
