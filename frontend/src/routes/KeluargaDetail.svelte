<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import KeluargaForm from '$lib/components/domain/KeluargaForm.svelte';
  import {
    keluargaDetailQuery,
    useUpdateKeluarga,
    useDeleteKeluarga,
  } from '$lib/api/keluarga';
  import { toast } from '$lib/stores/toast.svelte';
  import { t } from '$lib/i18n';
  import type { CreateKeluargaInput } from '$lib/types';
  import { push } from 'svelte-spa-router';
  import { Users } from 'lucide-svelte';

  interface Props {
    params?: { id?: string };
  }
  const { params }: Props = $props();
  const id = $derived(params?.id ? Number(params.id) : null);

  const query = keluargaDetailQuery(() => id);
  const update = useUpdateKeluarga();
  const remove = useDeleteKeluarga();

  let editing = $state(false);

  function save(data: CreateKeluargaInput) {
    if (id === null) return;
    $update.mutate(
      { id, data },
      {
        onSuccess: (k) => {
          editing = false;
          toast.success(`Keluarga "${k.nama_keluarga}" diperbarui.`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function handleDelete() {
    if (id === null) return;
    if (!confirm(t('keluarga.confirm_delete', 'Hapus keluarga ini? Jemaat di dalamnya tidak akan ikut terhapus.'))) {
      return;
    }
    $remove.mutate(id, {
      onSuccess: () => {
        toast.success('Keluarga dihapus.');
        push('/keluarga');
      },
      onError: (err) => toast.error(err.message),
    });
  }
</script>

<AppShell>
  <div class="mb-4">
    <a href="#/keluarga" class="text-sm text-primary hover:underline">
      ← {t('keluarga.back', 'Kembali ke daftar keluarga')}
    </a>
  </div>

  {#if $query.isLoading}
    <div class="space-y-3">
      <Skeleton class="h-8 w-1/3" />
      <Skeleton class="h-4 w-1/2" />
      <Skeleton class="h-40 w-full" />
    </div>
  {:else if $query.isError}
    <p class="text-sm text-destructive">{$query.error.message}</p>
  {:else if $query.data}
    {@const k = $query.data}
    <header class="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h1 class="text-2xl font-semibold">{k.nama_keluarga}</h1>
        {#if k.alamat}
          <p class="text-sm text-muted-foreground">{k.alamat}</p>
        {/if}
      </div>
      <div class="flex flex-wrap gap-2">
        {#if !editing}
          <Button variant="outline" onclick={() => (editing = true)}>
            {t('common.edit', 'Edit')}
          </Button>
          <Button variant="destructive" onclick={handleDelete} disabled={$remove.isPending}>
            {t('common.delete', 'Hapus')}
          </Button>
        {/if}
      </div>
    </header>

    {#if editing}
      <div class="mb-6 rounded-lg border bg-card p-6">
        <KeluargaForm
          initial={k}
          submitting={$update.isPending}
          onSubmit={save}
          onCancel={() => (editing = false)}
        />
      </div>
    {:else if k.catatan}
      <div class="mb-6 rounded-lg border bg-card p-4">
        <p class="text-xs uppercase tracking-wide text-muted-foreground">
          {t('keluarga.catatan', 'Catatan')}
        </p>
        <p class="mt-1 whitespace-pre-line text-sm">{k.catatan}</p>
      </div>
    {/if}

    <section class="space-y-3">
      <h2 class="text-base font-semibold">
        {t('keluarga.members', 'Anggota')} ({k.members.length})
      </h2>
      {#if k.members.length === 0}
        <EmptyState
          icon={Users}
          title={t('keluarga.members_empty.title', 'Belum ada anggota')}
          description={t('keluarga.members_empty.desc', 'Edit jemaat dan pilih keluarga ini untuk menambah anggota.')}
        />
      {:else}
        <ul class="overflow-hidden rounded-lg border bg-card divide-y">
          {#each k.members as m (m.id)}
            <li class="flex items-center justify-between p-3">
              <a href={`#/jemaat/${m.id}`} class="text-sm font-medium hover:underline">
                {m.nama_lengkap}
                {#if m.nama_panggilan}
                  <span class="ml-1 text-xs text-muted-foreground">({m.nama_panggilan})</span>
                {/if}
              </a>
              <a href={`#/jemaat/${m.id}`} class="text-sm text-primary hover:underline">
                {t('common.detail', 'Detail')}
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</AppShell>
