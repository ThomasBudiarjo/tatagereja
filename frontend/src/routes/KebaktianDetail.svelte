<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import KebaktianForm from '$lib/components/domain/KebaktianForm.svelte';
  import JadwalEditor from '$lib/components/domain/JadwalEditor.svelte';
  import {
    kebaktianDetailQuery,
    kebaktianJadwalQuery,
    useUpdateKebaktian,
    useDeleteKebaktian,
    useUpsertKebaktianJadwal,
  } from '$lib/api/kebaktian';
  import { serviceTypesListQuery } from '$lib/api/service-types';
  import { pelayanListQuery } from '$lib/api/pelayan';
  import { toast } from '$lib/stores/toast.svelte';
  import { t, formatDate } from '$lib/i18n';
  import { push } from 'svelte-spa-router';
  import type { CreateKebaktianInput, JadwalSlotInput } from '$lib/types';
  import { Printer } from 'lucide-svelte';

  interface Props {
    params?: { id?: string };
  }
  const { params }: Props = $props();
  const id = $derived(params?.id ? Number(params.id) : null);

  const detail = kebaktianDetailQuery(() => id);
  const jadwal = kebaktianJadwalQuery(() => id);
  const stQ = serviceTypesListQuery();
  const pelayanQ = pelayanListQuery(() => ({ limit: 200 }));

  const update = useUpdateKebaktian();
  const remove = useDeleteKebaktian();
  const upsertJadwal = useUpsertKebaktianJadwal();

  let editing = $state(false);

  function save(data: CreateKebaktianInput) {
    if (id === null) return;
    $update.mutate(
      { id, data },
      {
        onSuccess: (k) => {
          editing = false;
          toast.success(`Kebaktian "${k.nama}" diperbarui.`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function handleDelete() {
    if (id === null) return;
    if (!confirm(t('kebaktian.confirm_delete', 'Hapus kebaktian ini? Jadwal terkait akan ikut terhapus.'))) return;
    $remove.mutate(id, {
      onSuccess: () => {
        toast.success('Kebaktian dihapus.');
        push('/kebaktian');
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function saveJadwal(slots: JadwalSlotInput[]) {
    if (id === null) return;
    $upsertJadwal.mutate(
      { id, slots },
      {
        onSuccess: () => toast.success('Jadwal tersimpan.'),
        onError: (err) => toast.error(err.message),
      },
    );
  }
</script>

<AppShell>
  <div class="mb-4">
    <a href="#/kebaktian" class="text-sm text-primary hover:underline">
      ← {t('kebaktian.back', 'Kembali ke daftar kebaktian')}
    </a>
  </div>

  {#if $detail.isLoading}
    <div class="space-y-3">
      <Skeleton class="h-8 w-1/2" />
      <Skeleton class="h-4 w-1/3" />
      <Skeleton class="h-32 w-full" />
    </div>
  {:else if $detail.isError}
    <p class="text-sm text-destructive">{$detail.error.message}</p>
  {:else if $detail.data}
    {@const k = $detail.data}
    <header class="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h1 class="text-2xl font-semibold">{k.nama}</h1>
        <p class="text-sm text-muted-foreground">
          {formatDate(k.tanggal)} · {k.waktu_mulai}{k.lokasi ? ` · ${k.lokasi}` : ''}
        </p>
        {#if k.tema}
          <p class="mt-1 text-sm">{t('kebaktian.tema', 'Tema')}: {k.tema}</p>
        {/if}
        {#if k.pengkhotbah}
          <p class="text-sm">{t('kebaktian.pengkhotbah', 'Pengkhotbah')}: {k.pengkhotbah}</p>
        {/if}
      </div>
      <div class="flex flex-wrap gap-2">
        {#if !editing}
          <a
            href={`#/kebaktian/${k.id}/print`}
            target="_blank"
            rel="noopener"
            class="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            <Printer class="h-4 w-4" />
            {t('kebaktian.print', 'Cetak')}
          </a>
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
      <div class="mb-8 rounded-lg border bg-card p-6">
        <KebaktianForm
          initial={k}
          submitting={$update.isPending}
          onSubmit={save}
          onCancel={() => (editing = false)}
        />
      </div>
    {/if}

    <section class="space-y-3">
      <header class="flex items-end justify-between">
        <div>
          <h2 class="text-lg font-semibold">{t('jadwal.title', 'Jadwal Pelayanan')}</h2>
          <p class="text-sm text-muted-foreground">
            {t('jadwal.subtitle', 'Pilih pelayan untuk tiap jenis pelayanan.')}
          </p>
        </div>
      </header>

      {#if $stQ.isLoading || $pelayanQ.isLoading || $jadwal.isLoading}
        <p class="text-sm text-muted-foreground">Memuat jadwal…</p>
      {:else if $stQ.isError}
        <p class="text-sm text-destructive">{$stQ.error.message}</p>
      {:else}
        <JadwalEditor
          serviceTypes={$stQ.data?.data ?? []}
          pelayan={$pelayanQ.data?.data ?? []}
          slots={$jadwal.data?.data ?? []}
          submitting={$upsertJadwal.isPending}
          onSubmit={saveJadwal}
        />
      {/if}
    </section>
  {/if}
</AppShell>
