<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { keluargaApi, type KeluargaWrite } from '$lib/api/keluarga';
  import { ApiError } from '$lib/api/client';
  import { link } from 'svelte-spa-router';
  import { Plus, Pencil, Trash2 } from 'lucide-svelte';
  import { emptyToNull } from '$lib/utils/format';
  import type { Keluarga } from '$lib/types';

  const qc = useQueryClient();
  let limit = $state(50);
  let offset = $state(0);

  const listQ = createQuery(toStore(() => ({
    queryKey: ['keluarga', 'list', limit, offset] as const,
    queryFn: () => keluargaApi.list({ limit, offset }),
  })));

  let showForm = $state(false);
  let editing = $state<Keluarga | null>(null);
  let form = $state<KeluargaWrite>({ nama_keluarga: '', alamat: null, catatan: null });
  let errors = $state<Record<string, string>>({});

  function openCreate() {
    editing = null;
    form = { nama_keluarga: '', alamat: null, catatan: null };
    errors = {};
    showForm = true;
  }
  function openEdit(k: Keluarga) {
    editing = k;
    form = { nama_keluarga: k.nama_keluarga, alamat: k.alamat, catatan: k.catatan };
    errors = {};
    showForm = true;
  }

  const saveMut = createMutation({
    mutationFn: async (input: KeluargaWrite) => {
      const payload = {
        nama_keluarga: input.nama_keluarga.trim(),
        alamat: emptyToNull(input.alamat ?? ''),
        catatan: emptyToNull(input.catatan ?? ''),
      };
      if (editing) return keluargaApi.update(editing.id, payload);
      return keluargaApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keluarga'] });
      showForm = false;
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) errors = e.fields;
    },
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    errors = {};
    if (!form.nama_keluarga.trim()) {
      errors = { nama_keluarga: 'Wajib diisi' };
      return;
    }
    $saveMut.mutate(form);
  }

  const deleteMut = createMutation({
    mutationFn: (id: number) => keluargaApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keluarga'] }),
  });
  function confirmDelete(k: Keluarga) {
    if (confirm(`Hapus keluarga "${k.nama_keluarga}"? Anggota tidak ikut dihapus.`)) {
      $deleteMut.mutate(k.id);
    }
  }
</script>

<ProtectedRoute>
  {#snippet children()}
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">Keluarga</h1>
      <button class="btn-primary" onclick={openCreate}>
        <Plus class="h-4 w-4" /> Tambah
      </button>
    </div>

    {#if $listQ.isLoading}
      <p>Memuat…</p>
    {:else if !$listQ.data || $listQ.data.data.length === 0}
      <p class="text-sm text-muted-foreground">Belum ada keluarga.</p>
    {:else}
      <ul class="space-y-2">
        {#each $listQ.data.data as k (k.id)}
          <li class="card flex items-center justify-between p-3">
            <div class="min-w-0">
              <a href={`/keluarga/${k.id}`} use:link class="font-medium underline-offset-2 hover:underline">
                {k.nama_keluarga}
              </a>
              {#if k.alamat}<p class="truncate text-xs text-muted-foreground">{k.alamat}</p>{/if}
            </div>
            <div class="flex gap-1">
              <button class="btn-ghost p-2" onclick={() => openEdit(k)}><Pencil class="h-4 w-4" /></button>
              <button class="btn-ghost p-2 text-destructive" onclick={() => confirmDelete(k)}><Trash2 class="h-4 w-4" /></button>
            </div>
          </li>
        {/each}
      </ul>
      <div class="mt-4 flex items-center justify-between text-sm">
        <p class="text-muted-foreground">{$listQ.data.data.length} dari {$listQ.data.total}</p>
        <div class="flex gap-2">
          <button class="btn-secondary" disabled={offset === 0} onclick={() => (offset = Math.max(0, offset - limit))}>Prev</button>
          <button class="btn-secondary"
            disabled={offset + $listQ.data.data.length >= $listQ.data.total}
            onclick={() => (offset = offset + limit)}>Next</button>
        </div>
      </div>
    {/if}

    {#if showForm}
      <div class="fixed inset-0 z-40 bg-black/40" role="presentation" onclick={() => (showForm = false)}></div>
      <div class="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-background p-4 shadow-xl md:inset-auto md:left-1/2 md:top-1/2 md:w-[500px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg">
        <h2 class="mb-4 text-lg font-semibold">{editing ? 'Ubah Keluarga' : 'Tambah Keluarga'}</h2>
        <form onsubmit={submit} class="space-y-3">
          <div class="field">
            <label class="label" for="k-nama">Nama Keluarga *</label>
            <input id="k-nama" class="input" required maxlength="200" bind:value={form.nama_keluarga} />
            {#if errors.nama_keluarga}<p class="field-error">{errors.nama_keluarga}</p>{/if}
          </div>
          <div class="field">
            <label class="label" for="k-alamat">Alamat</label>
            <input id="k-alamat" class="input" maxlength="500" bind:value={form.alamat} />
          </div>
          <div class="field">
            <label class="label" for="k-cat">Catatan</label>
            <textarea id="k-cat" class="input min-h-[80px]" maxlength="2000" bind:value={form.catatan}></textarea>
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secondary" onclick={() => (showForm = false)}>Batal</button>
            <button type="submit" class="btn-primary" disabled={$saveMut.isPending}>
              {$saveMut.isPending ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    {/if}
  {/snippet}
</ProtectedRoute>
