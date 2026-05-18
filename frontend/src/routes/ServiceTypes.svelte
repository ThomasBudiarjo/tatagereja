<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { serviceTypesApi, type ServiceTypeWrite } from '$lib/api/service-types';
  import { ApiError } from '$lib/api/client';
  import { Plus, Pencil, Trash2 } from 'lucide-svelte';
  import type { ServiceType } from '$lib/types';
  import { emptyToNull } from '$lib/utils/format';

  const qc = useQueryClient();
  const listQ = createQuery(toStore(() => ({
    queryKey: ['service-types'],
    queryFn: () => serviceTypesApi.list(),
  })));

  let showForm = $state(false);
  let editing = $state<ServiceType | null>(null);
  let form = $state<ServiceTypeWrite>({ nama: '', deskripsi: null, urutan: 0 });
  let errors = $state<Record<string, string>>({});

  function openCreate() {
    editing = null;
    form = { nama: '', deskripsi: null, urutan: 0 };
    errors = {};
    showForm = true;
  }
  function openEdit(s: ServiceType) {
    editing = s;
    form = { nama: s.nama, deskripsi: s.deskripsi, urutan: s.urutan };
    errors = {};
    showForm = true;
  }

  const saveMut = createMutation({
    mutationFn: async (input: ServiceTypeWrite) => {
      const payload: ServiceTypeWrite = {
        nama: input.nama.trim(),
        deskripsi: emptyToNull(input.deskripsi ?? ''),
        urutan: Number(input.urutan ?? 0),
      };
      if (editing) return serviceTypesApi.update(editing.id, payload);
      return serviceTypesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-types'] });
      showForm = false;
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        if (e.fields) errors = e.fields;
        else errors = { nama: e.message };
      }
    },
  });

  const deleteMut = createMutation({
    mutationFn: (id: number) => serviceTypesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-types'] }),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        alert('Tidak dapat hapus: masih dipakai pada jadwal.');
      } else {
        alert('Gagal menghapus.');
      }
    },
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    errors = {};
    if (!form.nama.trim()) {
      errors = { nama: 'Wajib diisi' };
      return;
    }
    $saveMut.mutate(form);
  }
</script>

<ProtectedRoute>
  {#snippet children()}
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">Jenis Pelayanan</h1>
      <button class="btn-primary" onclick={openCreate}><Plus class="h-4 w-4" /> Tambah</button>
    </div>

    {#if $listQ.isLoading}
      <p>Memuat…</p>
    {:else if !$listQ.data || $listQ.data.data.length === 0}
      <p class="text-sm text-muted-foreground">Belum ada jenis pelayanan. Contoh: Worship Leader, Singer, Multimedia.</p>
    {:else}
      <ul class="space-y-2">
        {#each $listQ.data.data as s (s.id)}
          <li class="card flex items-center justify-between p-3">
            <div>
              <p class="font-medium">{s.nama}</p>
              {#if s.deskripsi}<p class="text-xs text-muted-foreground">{s.deskripsi}</p>{/if}
            </div>
            <div class="flex gap-1">
              <button class="btn-ghost p-2" onclick={() => openEdit(s)}><Pencil class="h-4 w-4" /></button>
              <button class="btn-ghost p-2 text-destructive" onclick={() => confirm(`Hapus "${s.nama}"?`) && $deleteMut.mutate(s.id)}><Trash2 class="h-4 w-4" /></button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if showForm}
      <div class="fixed inset-0 z-40 bg-black/40" role="presentation" onclick={() => (showForm = false)}></div>
      <div class="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-background p-4 shadow-xl md:inset-auto md:left-1/2 md:top-1/2 md:w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg">
        <h2 class="mb-4 text-lg font-semibold">{editing ? 'Ubah Jenis' : 'Tambah Jenis'}</h2>
        <form onsubmit={submit} class="space-y-3">
          <div class="field">
            <label class="label" for="st-nama">Nama *</label>
            <input id="st-nama" class="input" required maxlength="100" bind:value={form.nama} />
            {#if errors.nama}<p class="field-error">{errors.nama}</p>{/if}
          </div>
          <div class="field">
            <label class="label" for="st-desk">Deskripsi</label>
            <input id="st-desk" class="input" maxlength="500" bind:value={form.deskripsi} />
          </div>
          <div class="field">
            <label class="label" for="st-urutan">Urutan</label>
            <input id="st-urutan" type="number" class="input" bind:value={form.urutan} />
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
