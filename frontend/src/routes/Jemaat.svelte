<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import JemaatForm from '$lib/components/domain/JemaatForm.svelte';
  import { jemaatListQuery, useCreateJemaat } from '$lib/api/jemaat';
  import { t } from '$lib/i18n';
  import type { CreateJemaatInput } from '$lib/types';

  let q = $state('');
  let limit = $state(25);
  let offset = $state(0);
  let showCreate = $state(false);

  const query = jemaatListQuery(() => ({ q, limit, offset }));
  const create = useCreateJemaat();

  function handleSearch(e: Event) {
    e.preventDefault();
    offset = 0;
  }

  function handleCreate(data: CreateJemaatInput) {
    $create.mutate(data, {
      onSuccess: () => {
        showCreate = false;
      },
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
  <header class="mb-6 flex items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold">{t('jemaat.title', 'Daftar Jemaat')}</h1>
      <p class="text-sm text-muted-foreground">
        {t('jemaat.subtitle', 'Kelola data anggota jemaat.')}
      </p>
    </div>
    <Button onclick={() => (showCreate = true)}>+ {t('jemaat.add', 'Tambah Jemaat')}</Button>
  </header>

  <form class="mb-4 flex gap-2" onsubmit={handleSearch}>
    <Input placeholder={t('jemaat.search_placeholder', 'Cari nama atau email...')} bind:value={q} />
    <Button type="submit" variant="outline">{t('common.search', 'Cari')}</Button>
  </form>

  {#if $query.isLoading}
    <p class="text-sm text-muted-foreground">Memuat…</p>
  {:else if $query.isError}
    <p class="text-sm text-destructive">{$query.error.message}</p>
  {:else if $query.data}
    {#if $query.data.data.length === 0}
      <div class="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        Belum ada jemaat.
      </div>
    {:else}
      <div class="overflow-hidden rounded-lg border bg-card">
        <table class="w-full text-left text-sm">
          <thead class="bg-muted/40">
            <tr>
              <th class="px-3 py-2 font-medium">{t('jemaat.col.nama', 'Nama')}</th>
              <th class="px-3 py-2 font-medium">{t('jemaat.col.jk', 'JK')}</th>
              <th class="px-3 py-2 font-medium">{t('jemaat.col.kontak', 'Kontak')}</th>
              <th class="px-3 py-2 font-medium">{t('jemaat.col.status', 'Status')}</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y">
            {#each $query.data.data as j (j.id)}
              <tr class="hover:bg-muted/30">
                <td class="px-3 py-2">
                  <a href={`#/jemaat/${j.id}`} class="font-medium text-foreground hover:underline">
                    {j.nama_lengkap}
                  </a>
                  {#if j.nama_panggilan}
                    <span class="ml-1 text-xs text-muted-foreground">({j.nama_panggilan})</span>
                  {/if}
                </td>
                <td class="px-3 py-2 text-muted-foreground">{j.jenis_kelamin ?? '-'}</td>
                <td class="px-3 py-2 text-muted-foreground">{j.email ?? j.nomor_telepon ?? '-'}</td>
                <td class="px-3 py-2 text-muted-foreground">{j.status_pernikahan ?? '-'}</td>
                <td class="px-3 py-2 text-right">
                  <a href={`#/jemaat/${j.id}`} class="text-sm text-primary hover:underline">
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
          <Button variant="outline" size="sm" onclick={prevPage} disabled={offset === 0}>
            ← Prev
          </Button>
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
  open={showCreate}
  title={t('jemaat.add', 'Tambah Jemaat')}
  onClose={() => (showCreate = false)}
>
  <JemaatForm
    submitting={$create.isPending}
    onCancel={() => (showCreate = false)}
    onSubmit={handleCreate}
  />
</Modal>
