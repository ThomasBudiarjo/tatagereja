<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { jemaatApi, type JemaatWrite } from '$lib/api/jemaat';
  import { keluargaApi } from '$lib/api/keluarga';
  import { ApiError } from '$lib/api/client';
  import { link } from 'svelte-spa-router';
  import { z } from 'zod';
  import { Plus, Search, Pencil, Trash2 } from 'lucide-svelte';
  import { emptyToNull } from '$lib/utils/format';
  import type { Jemaat } from '$lib/types';

  const qc = useQueryClient();

  let search = $state('');
  let limit = $state(25);
  let offset = $state(0);

  const listQ = createQuery(toStore(() => ({
    queryKey: ['jemaat', 'list', search, limit, offset] as const,
    queryFn: () => jemaatApi.list({ q: search || undefined, limit, offset }),
  })));

  const keluargaQ = createQuery(toStore(() => ({
    queryKey: ['keluarga', 'all'],
    queryFn: () => keluargaApi.list({ limit: 200, offset: 0 }),
  })));

  let showForm = $state(false);
  let editing = $state<Jemaat | null>(null);
  let form = $state<JemaatWrite>(emptyForm());
  let errors = $state<Record<string, string>>({});

  function emptyForm(): JemaatWrite {
    return {
      nama_lengkap: '',
      nama_panggilan: null,
      jenis_kelamin: null,
      tanggal_lahir: null,
      tempat_lahir: null,
      alamat: null,
      nomor_telepon: null,
      email: null,
      status_pernikahan: null,
      tanggal_baptis: null,
      tanggal_sidi: null,
      keluarga_id: null,
      catatan: null,
    };
  }

  const schema = z.object({
    nama_lengkap: z.string().min(1, 'Wajib diisi').max(200),
    email: z.union([z.string().email('Format email salah').max(200), z.literal(''), z.null()]).optional(),
  });

  function openCreate() {
    editing = null;
    form = emptyForm();
    errors = {};
    showForm = true;
  }

  function openEdit(j: Jemaat) {
    editing = j;
    form = {
      nama_lengkap: j.nama_lengkap,
      nama_panggilan: j.nama_panggilan,
      jenis_kelamin: j.jenis_kelamin,
      tanggal_lahir: j.tanggal_lahir,
      tempat_lahir: j.tempat_lahir,
      alamat: j.alamat,
      nomor_telepon: j.nomor_telepon,
      email: j.email,
      status_pernikahan: j.status_pernikahan,
      tanggal_baptis: j.tanggal_baptis,
      tanggal_sidi: j.tanggal_sidi,
      keluarga_id: j.keluarga_id,
      catatan: j.catatan,
    };
    errors = {};
    showForm = true;
  }

  const saveMut = createMutation({
    mutationFn: async (input: JemaatWrite) => {
      const payload: JemaatWrite = {
        ...input,
        nama_panggilan: emptyToNull(input.nama_panggilan ?? ''),
        jenis_kelamin: (input.jenis_kelamin as string) === '' ? null : input.jenis_kelamin,
        status_pernikahan: (input.status_pernikahan as string) === '' ? null : input.status_pernikahan,
        tanggal_lahir: emptyToNull(input.tanggal_lahir ?? ''),
        tempat_lahir: emptyToNull(input.tempat_lahir ?? ''),
        alamat: emptyToNull(input.alamat ?? ''),
        nomor_telepon: emptyToNull(input.nomor_telepon ?? ''),
        email: emptyToNull(input.email ?? ''),
        tanggal_baptis: emptyToNull(input.tanggal_baptis ?? ''),
        tanggal_sidi: emptyToNull(input.tanggal_sidi ?? ''),
        catatan: emptyToNull(input.catatan ?? ''),
        keluarga_id: input.keluarga_id || null,
      };
      if (editing) return jemaatApi.update(editing.id, payload);
      return jemaatApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jemaat'] });
      showForm = false;
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) errors = e.fields;
    },
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    errors = {};
    const parsed = schema.safeParse({
      nama_lengkap: form.nama_lengkap,
      email: form.email,
    });
    if (!parsed.success) {
      errors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
      return;
    }
    $saveMut.mutate(form);
  }

  const deleteMut = createMutation({
    mutationFn: (id: number) => jemaatApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jemaat'] }),
  });

  function confirmDelete(j: Jemaat) {
    if (confirm(`Nonaktifkan jemaat "${j.nama_lengkap}"?`)) {
      $deleteMut.mutate(j.id);
    }
  }
</script>

<ProtectedRoute>
  {#snippet children()}
    <div class="mb-4 flex items-center justify-between gap-2">
      <h1 class="text-2xl font-bold">Jemaat</h1>
      <button class="btn-primary" onclick={openCreate}>
        <Plus class="h-4 w-4" /> Tambah
      </button>
    </div>

    <div class="card mb-4 flex items-center gap-2 p-3">
      <Search class="h-4 w-4 text-muted-foreground" />
      <input
        class="input border-0 p-0 focus-visible:ring-0"
        placeholder="Cari nama, panggilan, atau email…"
        bind:value={search}
        oninput={() => (offset = 0)}
      />
    </div>

    {#if $listQ.isLoading}
      <p class="text-sm text-muted-foreground">Memuat…</p>
    {:else if !$listQ.data || $listQ.data.data.length === 0}
      <p class="text-sm text-muted-foreground">Belum ada jemaat.</p>
    {:else}
      <!-- Mobile: card list -->
      <ul class="space-y-2 md:hidden">
        {#each $listQ.data.data as j (j.id)}
          <li class="card p-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <a href={`/jemaat/${j.id}`} use:link class="font-medium underline-offset-2 hover:underline">
                  {j.nama_lengkap}
                </a>
                {#if j.nama_panggilan}
                  <span class="text-xs text-muted-foreground"> ({j.nama_panggilan})</span>
                {/if}
                <p class="text-xs text-muted-foreground">{j.email ?? '-'}</p>
              </div>
              <div class="flex shrink-0 gap-1">
                <button class="btn-ghost p-2" onclick={() => openEdit(j)} aria-label="Edit">
                  <Pencil class="h-4 w-4" />
                </button>
                <button class="btn-ghost p-2 text-destructive" onclick={() => confirmDelete(j)} aria-label="Hapus">
                  <Trash2 class="h-4 w-4" />
                </button>
              </div>
            </div>
          </li>
        {/each}
      </ul>

      <!-- Desktop: table -->
      <div class="hidden md:block">
        <table class="w-full text-sm">
          <thead class="text-left text-muted-foreground">
            <tr class="border-b">
              <th class="p-2">Nama</th>
              <th class="p-2">Email</th>
              <th class="p-2">Telepon</th>
              <th class="p-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {#each $listQ.data.data as j (j.id)}
              <tr class="border-b">
                <td class="p-2">
                  <a href={`/jemaat/${j.id}`} use:link class="font-medium underline-offset-2 hover:underline">
                    {j.nama_lengkap}
                  </a>
                  {#if j.nama_panggilan}<span class="text-xs text-muted-foreground"> ({j.nama_panggilan})</span>{/if}
                </td>
                <td class="p-2">{j.email ?? '-'}</td>
                <td class="p-2">{j.nomor_telepon ?? '-'}</td>
                <td class="p-2 text-right">
                  <button class="btn-ghost p-2" onclick={() => openEdit(j)}><Pencil class="h-4 w-4" /></button>
                  <button class="btn-ghost p-2 text-destructive" onclick={() => confirmDelete(j)}><Trash2 class="h-4 w-4" /></button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex items-center justify-between text-sm">
        <p class="text-muted-foreground">
          {$listQ.data.data.length} dari {$listQ.data.total}
        </p>
        <div class="flex gap-2">
          <button class="btn-secondary" disabled={offset === 0} onclick={() => (offset = Math.max(0, offset - limit))}>
            Prev
          </button>
          <button
            class="btn-secondary"
            disabled={offset + $listQ.data.data.length >= $listQ.data.total}
            onclick={() => (offset = offset + limit)}
          >
            Next
          </button>
        </div>
      </div>
    {/if}

    {#if showForm}
      <div class="fixed inset-0 z-40 bg-black/40" role="presentation" onclick={() => (showForm = false)}></div>
      <div class="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[85vh] md:w-[640px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg">
        <h2 class="mb-4 text-lg font-semibold">{editing ? 'Ubah Jemaat' : 'Tambah Jemaat'}</h2>
        <form onsubmit={submit} class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="field md:col-span-2">
            <label class="label" for="j-nama">Nama Lengkap *</label>
            <input id="j-nama" class="input" bind:value={form.nama_lengkap} required maxlength="200" />
            {#if errors.nama_lengkap}<p class="field-error">{errors.nama_lengkap}</p>{/if}
          </div>
          <div class="field">
            <label class="label" for="j-panggilan">Nama Panggilan</label>
            <input id="j-panggilan" class="input" bind:value={form.nama_panggilan} maxlength="100" />
          </div>
          <div class="field">
            <label class="label" for="j-gender">Jenis Kelamin</label>
            <select id="j-gender" class="input" bind:value={form.jenis_kelamin}>
              <option value={null}>-</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>
          <div class="field">
            <label class="label" for="j-tl">Tanggal Lahir</label>
            <input id="j-tl" type="date" class="input" bind:value={form.tanggal_lahir} />
          </div>
          <div class="field">
            <label class="label" for="j-tp">Tempat Lahir</label>
            <input id="j-tp" class="input" bind:value={form.tempat_lahir} maxlength="100" />
          </div>
          <div class="field md:col-span-2">
            <label class="label" for="j-alamat">Alamat</label>
            <input id="j-alamat" class="input" bind:value={form.alamat} maxlength="500" />
          </div>
          <div class="field">
            <label class="label" for="j-tel">Telepon</label>
            <input id="j-tel" inputmode="tel" autocomplete="tel" class="input" bind:value={form.nomor_telepon} maxlength="30" />
          </div>
          <div class="field">
            <label class="label" for="j-email">Email</label>
            <input id="j-email" type="email" inputmode="email" class="input" bind:value={form.email} maxlength="200" />
            {#if errors.email}<p class="field-error">{errors.email}</p>{/if}
          </div>
          <div class="field">
            <label class="label" for="j-status">Status Pernikahan</label>
            <select id="j-status" class="input" bind:value={form.status_pernikahan}>
              <option value={null}>-</option>
              <option value="belum_menikah">Belum Menikah</option>
              <option value="menikah">Menikah</option>
              <option value="cerai">Cerai</option>
              <option value="duda">Duda</option>
              <option value="janda">Janda</option>
            </select>
          </div>
          <div class="field">
            <label class="label" for="j-kel">Keluarga</label>
            <select id="j-kel" class="input" bind:value={form.keluarga_id}>
              <option value={null}>-</option>
              {#if $keluargaQ.data}
                {#each $keluargaQ.data.data as k (k.id)}
                  <option value={k.id}>{k.nama_keluarga}</option>
                {/each}
              {/if}
            </select>
          </div>
          <div class="field">
            <label class="label" for="j-baptis">Tanggal Baptis</label>
            <input id="j-baptis" type="date" class="input" bind:value={form.tanggal_baptis} />
          </div>
          <div class="field">
            <label class="label" for="j-sidi">Tanggal Sidi</label>
            <input id="j-sidi" type="date" class="input" bind:value={form.tanggal_sidi} />
          </div>
          <div class="field md:col-span-2">
            <label class="label" for="j-cat">Catatan</label>
            <textarea id="j-cat" class="input min-h-[80px]" bind:value={form.catatan} maxlength="2000"></textarea>
          </div>

          <div class="md:col-span-2 mt-2 flex justify-end gap-2">
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
