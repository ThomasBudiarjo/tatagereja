<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import ServiceTypeForm from '$lib/components/domain/ServiceTypeForm.svelte';
  import {
    serviceTypesListQuery,
    useCreateServiceType,
    useUpdateServiceType,
    useDeleteServiceType,
  } from '$lib/api/service-types';
  import { toast } from '$lib/stores/toast.svelte';
  import { t } from '$lib/i18n';
  import type { CreateServiceTypeInput, ServiceType } from '$lib/types';
  import { Tags } from 'lucide-svelte';

  const query = serviceTypesListQuery();
  const create = useCreateServiceType();
  const update = useUpdateServiceType();
  const remove = useDeleteServiceType();

  let creating = $state(false);
  let editing = $state<ServiceType | null>(null);

  function submitCreate(data: CreateServiceTypeInput) {
    $create.mutate(data, {
      onSuccess: (st) => {
        creating = false;
        toast.success(`"${st.nama}" ditambahkan.`);
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function submitUpdate(data: CreateServiceTypeInput) {
    if (!editing) return;
    $update.mutate(
      { id: editing.id, data },
      {
        onSuccess: (st) => {
          editing = null;
          toast.success(`"${st.nama}" diperbarui.`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function handleDelete(st: ServiceType) {
    if (!confirm(t('service_type.confirm_delete', `Hapus "${st.nama}"?`))) return;
    $remove.mutate(st.id, {
      onSuccess: () => toast.success(`"${st.nama}" dihapus.`),
      onError: (err) => toast.error(err.message),
    });
  }
</script>

<AppShell>
  <header class="mb-6 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
    <div>
      <h1 class="text-2xl font-semibold">{t('service_type.title', 'Jenis Pelayanan')}</h1>
      <p class="text-sm text-muted-foreground">
        {t('service_type.subtitle', 'Atur jenis pelayanan yang tersedia di gereja Anda.')}
      </p>
    </div>
    <Button onclick={() => (creating = true)}>+ {t('service_type.add', 'Tambah')}</Button>
  </header>

  {#if $query.isLoading}
    <div class="space-y-2">
      {#each Array(4) as _, i (i)}
        <Skeleton class="h-12 w-full" />
      {/each}
    </div>
  {:else if $query.isError}
    <p class="text-sm text-destructive">{$query.error.message}</p>
  {:else if $query.data}
    {#if $query.data.data.length === 0}
      <EmptyState
        icon={Tags}
        title={t('service_type.empty.title', 'Belum ada jenis pelayanan')}
        description={t('service_type.empty.desc', 'Tambahkan jenis pelayanan seperti Worship Leader, Singer, atau Multimedia.')}
      >
        <Button onclick={() => (creating = true)}>+ {t('service_type.add', 'Tambah')}</Button>
      </EmptyState>
    {:else}
      <div class="overflow-x-auto rounded-lg border bg-card">
        <table class="w-full text-left text-sm">
          <thead class="bg-muted/40">
            <tr>
              <th class="px-3 py-2 font-medium">{t('service_type.nama', 'Nama')}</th>
              <th class="px-3 py-2 font-medium">{t('service_type.deskripsi', 'Deskripsi')}</th>
              <th class="px-3 py-2 font-medium">{t('service_type.urutan', 'Urutan')}</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y">
            {#each $query.data.data as st (st.id)}
              <tr>
                <td class="px-3 py-2"><Badge color={st.warna}>{st.nama}</Badge></td>
                <td class="px-3 py-2 text-muted-foreground">{st.deskripsi ?? '-'}</td>
                <td class="px-3 py-2 text-muted-foreground">{st.urutan}</td>
                <td class="px-3 py-2 text-right">
                  <button
                    type="button"
                    class="mr-3 text-sm text-primary hover:underline"
                    onclick={() => (editing = st)}
                  >
                    {t('common.edit', 'Edit')}
                  </button>
                  <button
                    type="button"
                    class="text-sm text-destructive hover:underline"
                    onclick={() => handleDelete(st)}
                  >
                    {t('common.delete', 'Hapus')}
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
  title={t('service_type.add', 'Tambah Jenis Pelayanan')}
  onClose={() => (creating = false)}
  size="sm"
>
  <ServiceTypeForm
    submitting={$create.isPending}
    onCancel={() => (creating = false)}
    onSubmit={submitCreate}
  />
</Modal>

<Modal
  open={editing !== null}
  title={t('service_type.edit', 'Ubah Jenis Pelayanan')}
  onClose={() => (editing = null)}
  size="sm"
>
  {#if editing}
    <ServiceTypeForm
      initial={editing}
      submitting={$update.isPending}
      onCancel={() => (editing = null)}
      onSubmit={submitUpdate}
    />
  {/if}
</Modal>
