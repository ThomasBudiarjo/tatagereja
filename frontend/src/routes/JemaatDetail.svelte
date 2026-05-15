<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import JemaatForm from '$lib/components/domain/JemaatForm.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import {
    jemaatDetailQuery,
    useUpdateJemaat,
    useDeleteJemaat,
  } from '$lib/api/jemaat';
  import { toast } from '$lib/stores/toast.svelte';
  import { t, formatDate } from '$lib/i18n';
  import type { CreateJemaatInput } from '$lib/types';
  import { push } from 'svelte-spa-router';

  interface Props {
    params?: { id?: string };
  }

  const { params }: Props = $props();
  const id = $derived(params?.id ? Number(params.id) : null);

  const query = jemaatDetailQuery(() => id);
  const update = useUpdateJemaat();
  const remove = useDeleteJemaat();

  let editing = $state(false);

  function save(data: CreateJemaatInput) {
    if (id === null) return;
    $update.mutate(
      { id, data },
      {
        onSuccess: (j) => {
          editing = false;
          toast.success(`${j.nama_lengkap} diperbarui.`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function handleDelete() {
    if (id === null) return;
    if (!confirm(t('jemaat.confirm_delete', 'Yakin menonaktifkan jemaat ini?'))) return;
    $remove.mutate(id, {
      onSuccess: () => {
        toast.success('Jemaat dinonaktifkan.');
        push('/jemaat');
      },
      onError: (err) => toast.error(err.message),
    });
  }
</script>

<AppShell>
  <div class="mb-4">
    <a href="#/jemaat" class="text-sm text-primary hover:underline">
      ← {t('jemaat.back', 'Kembali ke daftar')}
    </a>
  </div>

  {#if $query.isLoading}
    <div class="space-y-3">
      <Skeleton class="h-8 w-1/3" />
      <Skeleton class="h-4 w-1/4" />
      <Skeleton class="h-64 w-full" />
    </div>
  {:else if $query.isError}
    <p class="text-sm text-destructive">{$query.error.message}</p>
  {:else if $query.data}
    {@const j = $query.data}
    <header class="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h1 class="text-2xl font-semibold">{j.nama_lengkap}</h1>
        {#if j.nama_panggilan}
          <p class="text-sm text-muted-foreground">"{j.nama_panggilan}"</p>
        {/if}
      </div>
      <div class="flex flex-wrap gap-2">
        {#if !editing}
          <Button variant="outline" onclick={() => (editing = true)}>
            {t('common.edit', 'Edit')}
          </Button>
          <Button variant="destructive" onclick={handleDelete} disabled={$remove.isPending}>
            {t('common.delete', 'Nonaktifkan')}
          </Button>
        {/if}
      </div>
    </header>

    {#if editing}
      <div class="rounded-lg border bg-card p-6">
        <JemaatForm
          initial={j}
          submitting={$update.isPending}
          onSubmit={save}
          onCancel={() => (editing = false)}
        />
      </div>
    {:else}
      <dl class="grid gap-4 rounded-lg border bg-card p-6 sm:grid-cols-2">
        <div>
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">
            {t('jemaat.jenis_kelamin', 'Jenis kelamin')}
          </dt>
          <dd class="mt-1 text-sm">
            {j.jenis_kelamin === 'L' ? 'Laki-laki' : j.jenis_kelamin === 'P' ? 'Perempuan' : '-'}
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">
            {t('jemaat.tanggal_lahir', 'Tanggal lahir')}
          </dt>
          <dd class="mt-1 text-sm">{formatDate(j.tanggal_lahir)}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">
            {t('jemaat.tempat_lahir', 'Tempat lahir')}
          </dt>
          <dd class="mt-1 text-sm">{j.tempat_lahir ?? '-'}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">
            {t('jemaat.status_pernikahan', 'Status pernikahan')}
          </dt>
          <dd class="mt-1 text-sm">{j.status_pernikahan ?? '-'}</dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">
            {t('jemaat.alamat', 'Alamat')}
          </dt>
          <dd class="mt-1 text-sm">{j.alamat ?? '-'}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">
            {t('jemaat.nomor_telepon', 'Telepon')}
          </dt>
          <dd class="mt-1 text-sm">{j.nomor_telepon ?? '-'}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">
            {t('jemaat.email', 'Email')}
          </dt>
          <dd class="mt-1 text-sm">{j.email ?? '-'}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">
            {t('jemaat.tanggal_baptis', 'Tanggal baptis')}
          </dt>
          <dd class="mt-1 text-sm">{formatDate(j.tanggal_baptis)}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">
            {t('jemaat.tanggal_sidi', 'Tanggal sidi')}
          </dt>
          <dd class="mt-1 text-sm">{formatDate(j.tanggal_sidi)}</dd>
        </div>
        {#if j.catatan}
          <div class="sm:col-span-2">
            <dt class="text-xs uppercase tracking-wide text-muted-foreground">
              {t('jemaat.catatan', 'Catatan')}
            </dt>
            <dd class="mt-1 text-sm whitespace-pre-line">{j.catatan}</dd>
          </div>
        {/if}
      </dl>
    {/if}
  {/if}
</AppShell>
