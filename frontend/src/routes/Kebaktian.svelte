<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { kebaktianApi, type KebaktianWrite } from '$lib/api/kebaktian';
  import { ApiError } from '$lib/api/client';
  import { link } from 'svelte-spa-router';
  import { Plus, Pencil, Trash2, Calendar } from 'lucide-svelte';
  import { emptyToNull } from '$lib/utils/format';
  import { formatDateTime, localToUTC, utcToLocalInput } from '$lib/utils/date';
  import type { Kebaktian, Paginated } from '$lib/types';

  const qc = useQueryClient();
  let limit = $state(25);
  let offset = $state(0);

  const listQ = createQuery(toStore(() => ({
    queryKey: ['kebaktian', 'list', limit, offset] as const,
    queryFn: () => kebaktianApi.list({ limit, offset }) as Promise<Paginated<Kebaktian>>,
  })));

  let showForm = $state(false);
  let editing = $state<Kebaktian | null>(null);
  let form = $state<KebaktianWrite & { waktuLocal: string }>({
    nama: '',
    waktu_mulai: '',
    waktuLocal: '',
    lokasi: null,
    tema: null,
    pengkhotbah: null,
    catatan: null,
  });
  let errors = $state<Record<string, string>>({});

  function openCreate() {
    editing = null;
    form = { nama: '', waktu_mulai: '', waktuLocal: '', lokasi: null, tema: null, pengkhotbah: null, catatan: null };
    errors = {};
    showForm = true;
  }
  function openEdit(k: Kebaktian) {
    editing = k;
    form = {
      nama: k.nama,
      waktu_mulai: k.waktu_mulai,
      waktuLocal: utcToLocalInput(k.waktu_mulai),
      lokasi: k.lokasi,
      tema: k.tema,
      pengkhotbah: k.pengkhotbah,
      catatan: k.catatan,
    };
    errors = {};
    showForm = true;
  }

  const saveMut = createMutation({
    mutationFn: async () => {
      if (!form.nama.trim()) throw new Error('Nama wajib diisi');
      if (!form.waktuLocal) throw new Error('Waktu wajib diisi');
      const payload: KebaktianWrite = {
        nama: form.nama.trim(),
        waktu_mulai: localToUTC(form.waktuLocal),
        lokasi: emptyToNull(form.lokasi ?? ''),
        tema: emptyToNull(form.tema ?? ''),
        pengkhotbah: emptyToNull(form.pengkhotbah ?? ''),
        catatan: emptyToNull(form.catatan ?? ''),
      };
      if (editing) return kebaktianApi.update(editing.id, payload);
      return kebaktianApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kebaktian'] });
      showForm = false;
    },
    onError: (e) => {
      if (e instanceof ApiError) errors = e.fields ?? { _: e.message };
      else errors = { _: (e as Error).message };
    },
  });

  const deleteMut = createMutation({
    mutationFn: (id: number) => kebaktianApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kebaktian'] }),
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    errors = {};
    $saveMut.mutate();
  }
</script>

<ProtectedRoute>
  {#snippet children()}
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">Kebaktian</h1>
      <button class="btn-primary" onclick={openCreate}><Plus class="h-4 w-4" /> Tambah</button>
    </div>

    {#if $listQ.isLoading}
      <p>Memuat…</p>
    {:else if !$listQ.data || $listQ.data.data.length === 0}
      <p class="text-sm text-muted-foreground">Belum ada kebaktian.</p>
    {:else}
      <ul class="space-y-2">
        {#each $listQ.data.data as k (k.id)}
          <li class="card flex items-center justify-between p-3">
            <div class="min-w-0">
              <p class="font-medium">{k.nama}</p>
              <p class="text-xs text-muted-foreground">{formatDateTime(k.waktu_mulai)}</p>
              {#if k.lokasi}<p class="text-xs text-muted-foreground">{k.lokasi}</p>{/if}
            </div>
            <div class="flex shrink-0 gap-1">
              <a class="btn-ghost p-2" href={`/kebaktian/${k.id}/jadwal`} use:link aria-label="Jadwal"><Calendar class="h-4 w-4" /></a>
              <button class="btn-ghost p-2" onclick={() => openEdit(k)}><Pencil class="h-4 w-4" /></button>
              <button class="btn-ghost p-2 text-destructive" onclick={() => confirm(`Hapus kebaktian "${k.nama}"?`) && $deleteMut.mutate(k.id)}>
                <Trash2 class="h-4 w-4" />
              </button>
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
      <div class="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl md:inset-auto md:left-1/2 md:top-1/2 md:w-[560px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg">
        <h2 class="mb-4 text-lg font-semibold">{editing ? 'Ubah Kebaktian' : 'Tambah Kebaktian'}</h2>
        <form onsubmit={submit} class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div class="field md:col-span-2">
            <label class="label" for="kb-nama">Nama *</label>
            <input id="kb-nama" class="input" required maxlength="200" bind:value={form.nama} />
          </div>
          <div class="field md:col-span-2">
            <label class="label" for="kb-waktu">Waktu Mulai *</label>
            <input id="kb-waktu" type="datetime-local" class="input" required bind:value={form.waktuLocal} />
          </div>
          <div class="field">
            <label class="label" for="kb-lokasi">Lokasi</label>
            <input id="kb-lokasi" class="input" maxlength="200" bind:value={form.lokasi} />
          </div>
          <div class="field">
            <label class="label" for="kb-pengkhotbah">Pengkhotbah</label>
            <input id="kb-pengkhotbah" class="input" maxlength="200" bind:value={form.pengkhotbah} />
          </div>
          <div class="field md:col-span-2">
            <label class="label" for="kb-tema">Tema</label>
            <input id="kb-tema" class="input" maxlength="300" bind:value={form.tema} />
          </div>
          <div class="field md:col-span-2">
            <label class="label" for="kb-cat">Catatan</label>
            <textarea id="kb-cat" class="input min-h-[80px]" maxlength="2000" bind:value={form.catatan}></textarea>
          </div>
          {#if errors._}<p class="field-error md:col-span-2">{errors._}</p>{/if}
          <div class="md:col-span-2 flex justify-end gap-2">
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
