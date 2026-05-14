<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import PelayanForm from '$lib/components/domain/PelayanForm.svelte';
  import { jemaatListQuery } from '$lib/api/jemaat';
  import { serviceTypesListQuery } from '$lib/api/service-types';
  import {
    pelayanListQuery,
    useCreatePelayan,
    useUpdatePelayan,
    useDeletePelayan,
  } from '$lib/api/pelayan';
  import { t } from '$lib/i18n';
  import type {
    CreatePelayanInput,
    Pelayan,
  } from '$lib/types';

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
      onSuccess: () => (creating = false),
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
      { onSuccess: () => (editing = null) },
    );
  }

  function handleDelete(p: Pelayan) {
    if (!confirm(t('pelayan.confirm_delete', `Hapus status pelayan untuk ${p.nama_lengkap}?`))) return;
    $remove.mutate(p.id);
  }
</script>

<AppShell>
  <header class="mb-6 flex items-center justify-between gap-4">
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
    <p class="text-sm text-muted-foreground">Memuat…</p>
  {:else if $query.isError}
    <p class="text-sm text-destructive">{$query.error.message}</p>
  {:else if $query.data}
    {#if $query.data.data.length === 0}
      <div class="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        Belum ada pelayan.
      </div>
    {:else}
      <div class="overflow-hidden rounded-lg border bg-card">
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
                <td class="px-3 py-2 font-medium">{p.nama_lengkap}</td>
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
