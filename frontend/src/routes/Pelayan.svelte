<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { pelayanApi } from '$lib/api/pelayan';
  import { jemaatApi } from '$lib/api/jemaat';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { ApiError } from '$lib/api/client';
  import { Plus, Pencil, Trash2 } from 'lucide-svelte';
  import { emptyToNull } from '$lib/utils/format';
  import type { Pelayan } from '$lib/types';

  const qc = useQueryClient();

  const listQ = createQuery(toStore(() => ({
    queryKey: ['pelayan'],
    queryFn: () => pelayanApi.list({ limit: 200, offset: 0 }),
  })));
  const jemaatQ = createQuery(toStore(() => ({
    queryKey: ['jemaat', 'all-for-pelayan'],
    queryFn: () => jemaatApi.list({ limit: 200, offset: 0 }),
  })));
  const stQ = createQuery(toStore(() => ({
    queryKey: ['service-types'],
    queryFn: () => serviceTypesApi.list(),
  })));

  let showForm = $state(false);
  let editing = $state<Pelayan | null>(null);
  let form = $state<{
    jemaat_id: number | null;
    catatan: string | null;
    service_type_ids: number[];
  }>({ jemaat_id: null, catatan: null, service_type_ids: [] });
  let errors = $state<Record<string, string>>({});

  function openCreate() {
    editing = null;
    form = { jemaat_id: null, catatan: null, service_type_ids: [] };
    errors = {};
    showForm = true;
  }
  function openEdit(p: Pelayan) {
    editing = p;
    form = { jemaat_id: p.jemaat_id, catatan: p.catatan, service_type_ids: [...(p.service_type_ids ?? [])] };
    errors = {};
    showForm = true;
  }

  function toggleST(id: number) {
    form.service_type_ids = form.service_type_ids.includes(id)
      ? form.service_type_ids.filter((x) => x !== id)
      : [...form.service_type_ids, id];
  }

  const saveMut = createMutation({
    mutationFn: async () => {
      if (editing) {
        return pelayanApi.update(editing.id, {
          catatan: emptyToNull(form.catatan ?? ''),
          service_type_ids: form.service_type_ids,
        });
      }
      if (!form.jemaat_id) throw new Error('Pilih jemaat');
      return pelayanApi.create({
        jemaat_id: form.jemaat_id,
        catatan: emptyToNull(form.catatan ?? ''),
        service_type_ids: form.service_type_ids,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pelayan'] });
      showForm = false;
    },
    onError: (e) => {
      if (e instanceof ApiError) errors = e.fields ?? { _: e.message };
      else errors = { _: (e as Error).message };
    },
  });

  const deleteMut = createMutation({
    mutationFn: (id: number) => pelayanApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pelayan'] }),
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    errors = {};
    $saveMut.mutate();
  }

  function serviceTypeNames(ids: number[]): string {
    const all = $stQ.data?.data ?? [];
    return ids
      .map((id) => all.find((s) => s.id === id)?.nama)
      .filter((x): x is string => !!x)
      .join(', ');
  }
</script>

<ProtectedRoute>
  {#snippet children()}
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">Pelayan</h1>
      <button class="btn-primary" onclick={openCreate}><Plus class="h-4 w-4" /> Tambah</button>
    </div>

    {#if $listQ.isLoading}
      <p>Memuat…</p>
    {:else if !$listQ.data || $listQ.data.data.length === 0}
      <p class="text-sm text-muted-foreground">Belum ada pelayan. Tambahkan jemaat sebagai pelayan.</p>
    {:else}
      <ul class="space-y-2">
        {#each $listQ.data.data as p (p.id)}
          <li class="card flex items-center justify-between p-3">
            <div>
              <p class="font-medium">{p.nama_lengkap}</p>
              <p class="text-xs text-muted-foreground">{serviceTypeNames(p.service_type_ids ?? [])}</p>
              {#if p.catatan}<p class="text-xs text-muted-foreground">{p.catatan}</p>{/if}
            </div>
            <div class="flex gap-1">
              <button class="btn-ghost p-2" onclick={() => openEdit(p)}><Pencil class="h-4 w-4" /></button>
              <button class="btn-ghost p-2 text-destructive" onclick={() => confirm(`Hapus pelayan "${p.nama_lengkap}"?`) && $deleteMut.mutate(p.id)}>
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if showForm}
      <div class="fixed inset-0 z-40 bg-black/40" role="presentation" onclick={() => (showForm = false)}></div>
      <div class="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl md:inset-auto md:left-1/2 md:top-1/2 md:w-[500px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg">
        <h2 class="mb-4 text-lg font-semibold">{editing ? 'Ubah Pelayan' : 'Tambah Pelayan'}</h2>
        <form onsubmit={submit} class="space-y-3">
          <div class="field">
            <label class="label" for="p-jemaat">Jemaat *</label>
            <select id="p-jemaat" class="input" disabled={!!editing} bind:value={form.jemaat_id}>
              <option value={null}>-- pilih --</option>
              {#if $jemaatQ.data}
                {#each $jemaatQ.data.data as j (j.id)}
                  <option value={j.id}>{j.nama_lengkap}</option>
                {/each}
              {/if}
            </select>
          </div>
          <fieldset>
            <legend class="label">Jenis Pelayanan</legend>
            {#if !$stQ.data || $stQ.data.data.length === 0}
              <p class="text-xs text-muted-foreground">Belum ada jenis pelayanan. Tambahkan dulu di halaman "Jenis Pelayanan".</p>
            {:else}
              <div class="grid grid-cols-2 gap-2">
                {#each $stQ.data.data as st (st.id)}
                  <label class="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.service_type_ids.includes(st.id)}
                      onchange={() => toggleST(st.id)}
                    />
                    {st.nama}
                  </label>
                {/each}
              </div>
            {/if}
          </fieldset>
          <div class="field">
            <label class="label" for="p-cat">Catatan</label>
            <textarea id="p-cat" class="input min-h-[80px]" maxlength="2000" bind:value={form.catatan}></textarea>
          </div>
          {#if errors._}<p class="field-error">{errors._}</p>{/if}
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
