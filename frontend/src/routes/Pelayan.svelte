<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { pelayanApi } from '$lib/api/pelayan';
  import { jemaatApi } from '$lib/api/jemaat';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { ApiError } from '$lib/api/client';
  import { push } from 'svelte-spa-router';
  import { emptyToNull } from '$lib/utils/format';
  import { toast } from '$lib/stores/toast.svelte';
  import { viewport } from '$lib/stores/viewport.svelte';
  import type { Pelayan } from '$lib/types';
  import TopBar from '$lib/components/TopBar.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/Field.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';
  import DesktopDialog from '$lib/components/DesktopDialog.svelte';

  const qc = useQueryClient();

  const listQ = createQuery(
    toStore(() => ({
      queryKey: ['pelayan', 'all'],
      queryFn: () => pelayanApi.list({ limit: 500, offset: 0 }),
    })),
  );
  const jemaatQ = createQuery(
    toStore(() => ({
      queryKey: ['jemaat', 'all-for-pelayan'],
      queryFn: () => jemaatApi.list({ limit: 500, offset: 0 }),
    })),
  );
  const stQ = createQuery(
    toStore(() => ({
      queryKey: ['service-types'],
      queryFn: () => serviceTypesApi.list(),
    })),
  );

  let filter = $state<number>(0); // 0 = all

  const filtered = $derived.by(() => {
    const all = $listQ.data?.data ?? [];
    if (filter === 0) return all;
    return all.filter((p) => (p.service_type_ids ?? []).includes(filter));
  });

  function nameForServiceTypeIds(ids: number[]): string[] {
    const all = $stQ.data?.data ?? [];
    return ids
      .map((id) => all.find((s) => s.id === id)?.nama)
      .filter((x): x is string => !!x);
  }

  function jemaatById(id: number) {
    return ($jemaatQ.data?.data ?? []).find((j) => j.id === id) ?? null;
  }

  let showForm = $state(false);
  let showEditForm = $state(false);
  let editingPelayan = $state<Pelayan | null>(null);
  let pickedJemaat = $state<{ id: number; nama: string; panggilan: string | null } | null>(null);
  let pickerQ = $state('');
  let selectedTypes = $state<number[]>([]);
  let formCatatan = $state('');
  let editSelectedTypes = $state<number[]>([]);
  let editCatatan = $state('');
  let confirmDeleteId = $state<number | null>(null);

  const candidates = $derived.by(() => {
    const all = $jemaatQ.data?.data ?? [];
    const pelayanIds = new Set(($listQ.data?.data ?? []).map((p) => p.jemaat_id));
    const remaining = all.filter((j) => !pelayanIds.has(j.id));
    if (!pickerQ) return remaining;
    const lc = pickerQ.toLowerCase();
    return remaining.filter((j) => j.nama_lengkap.toLowerCase().includes(lc));
  });

  function openCreate() {
    pickedJemaat = null;
    pickerQ = '';
    selectedTypes = [];
    formCatatan = '';
    showForm = true;
  }

  function openEdit(p: Pelayan) {
    editingPelayan = p;
    editSelectedTypes = [...(p.service_type_ids ?? [])];
    editCatatan = p.catatan ?? '';
    showEditForm = true;
  }

  function toggleType(id: number) {
    selectedTypes = selectedTypes.includes(id) ? selectedTypes.filter((x) => x !== id) : [...selectedTypes, id];
  }

  function toggleEditType(id: number) {
    editSelectedTypes = editSelectedTypes.includes(id)
      ? editSelectedTypes.filter((x) => x !== id)
      : [...editSelectedTypes, id];
  }

  const saveMut = createMutation({
    mutationFn: async () => {
      if (!pickedJemaat) throw new Error('Pilih jemaat');
      if (selectedTypes.length === 0) throw new Error('Pilih jenis pelayanan');
      return pelayanApi.create({
        jemaat_id: pickedJemaat.id,
        catatan: emptyToNull(formCatatan),
        service_type_ids: selectedTypes,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pelayan'] });
      toast.show('Pelayan baru ditambahkan');
      showForm = false;
    },
    onError: (e) => {
      toast.show(e instanceof ApiError ? e.message : (e as Error).message);
    },
  });

  const editMut = createMutation({
    mutationFn: async () => {
      if (!editingPelayan) throw new Error('No pelayan selected');
      if (editSelectedTypes.length === 0) throw new Error('Pilih jenis pelayanan');
      return pelayanApi.update(editingPelayan.id, {
        catatan: emptyToNull(editCatatan),
        service_type_ids: editSelectedTypes,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pelayan'] });
      toast.show('Data pelayan diperbarui');
      showEditForm = false;
    },
    onError: (e) => {
      toast.show(e instanceof ApiError ? e.message : (e as Error).message);
    },
  });

  const deleteMut = createMutation({
    mutationFn: (id: number) => pelayanApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pelayan'] });
      confirmDeleteId = null;
      toast.show('Pelayan dihapus');
    },
    onError: () => toast.show('Gagal menghapus pelayan'),
  });

  function countForServiceType(stId: number): number {
    return ($listQ.data?.data ?? []).filter((p) => (p.service_type_ids ?? []).includes(stId)).length;
  }
</script>

{#snippet editForm()}
  <div style="display: flex; flex-direction: column; gap: 14px;">
    <Field label="Jenis pelayanan" required hint="Pilih satu atau lebih">
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        {#each $stQ.data?.data ?? [] as st (st.id)}
          <button
            type="button"
            class="chip chip-toggle {editSelectedTypes.includes(st.id) ? 'on' : ''}"
            onclick={() => toggleEditType(st.id)}
          >
            {#if editSelectedTypes.includes(st.id)}
              <Icon name="check" size={14} />
            {/if}
            {st.nama}
          </button>
        {/each}
      </div>
    </Field>
    <Field label="Catatan">
      <textarea
        class="textarea"
        rows="3"
        bind:value={editCatatan}
        placeholder="Misal: 'tersedia setiap Minggu kecuali minggu pertama'"
      ></textarea>
    </Field>
  </div>
{/snippet}

{#snippet promoteForm()}
  <div style="display: flex; flex-direction: column; gap: 14px;">
    <Field label="Pilih jemaat" required>
      {#if pickedJemaat}
        <div class="row" style="background: var(--accent-soft); border-color: transparent;">
          <Avatar name={pickedJemaat.nama} />
          <div class="row-body">
            <div class="row-title">{pickedJemaat.nama}</div>
            {#if pickedJemaat.panggilan}<div class="row-sub">{pickedJemaat.panggilan}</div>{/if}
          </div>
          <button class="icon-btn" type="button" onclick={() => (pickedJemaat = null)} aria-label="Hapus">
            <Icon name="close" />
          </button>
        </div>
      {:else}
        <input class="input" placeholder="Cari nama jemaat…" bind:value={pickerQ} />
        <div style="display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; margin-top: 6px;">
          {#each candidates.slice(0, 12) as c (c.id)}
            <button
              type="button"
              onclick={() => (pickedJemaat = { id: c.id, nama: c.nama_lengkap, panggilan: c.nama_panggilan })}
              style="display: flex; align-items: center; gap: 10px; padding: 8px 10px;
                     border-radius: 10px; background: var(--surface);
                     border: 1px solid var(--line); width: 100%; text-align: left;"
            >
              <Avatar name={c.nama_lengkap} size="sm" />
              <div style="flex: 1;">
                <div style="font-size: 14px; font-weight: 600; color: var(--ink);">{c.nama_lengkap}</div>
                {#if c.nama_panggilan}
                  <div style="font-size: 12px; color: var(--ink-3);">{c.nama_panggilan}</div>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </Field>

    <Field label="Jenis pelayanan" required hint="Pilih satu atau lebih">
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        {#each $stQ.data?.data ?? [] as st (st.id)}
          <button
            type="button"
            class="chip chip-toggle {selectedTypes.includes(st.id) ? 'on' : ''}"
            onclick={() => toggleType(st.id)}
          >
            {#if selectedTypes.includes(st.id)}
              <Icon name="check" size={14} />
            {/if}
            {st.nama}
          </button>
        {/each}
      </div>
    </Field>

    <Field label="Catatan">
      <textarea
        class="textarea"
        rows="3"
        bind:value={formCatatan}
        placeholder="Misal: 'tersedia setiap Minggu kecuali minggu pertama'"
      ></textarea>
    </Field>
  </div>
{/snippet}

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <!-- ════════ DESKTOP ════════ -->
      <DesktopLayout title="Pelayan" subtitle={`${$listQ.data?.data?.length ?? 0} pelayan aktif`}>
        {#snippet actions()}
          <button class="dt-btn dt-btn-primary" type="button" onclick={openCreate}>
            <Icon name="plus" size={16} /> Promosikan jemaat
          </button>
        {/snippet}

        <div class="dt-toolbar">
          <button class="chip chip-toggle {filter === 0 ? 'on' : ''}" type="button" onclick={() => (filter = 0)}>
            Semua <span style="opacity: 0.7; margin-left: 4px;">{$listQ.data?.data?.length ?? 0}</span>
          </button>
          {#each $stQ.data?.data ?? [] as st (st.id)}
            <button
              class="chip chip-toggle {filter === st.id ? 'on' : ''}"
              type="button"
              onclick={() => (filter = st.id)}
            >
              {st.nama} <span style="opacity: 0.7; margin-left: 4px;">{countForServiceType(st.id)}</span>
            </button>
          {/each}
        </div>

        <div class="dt-table-wrap">
          <table class="dt-table">
            <thead>
              <tr>
                <th>Pelayan</th>
                <th>Jenis pelayanan</th>
                <th>Telepon</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each filtered as p (p.id)}
                {@const names = nameForServiceTypeIds(p.service_type_ids ?? [])}
                {@const j = jemaatById(p.jemaat_id)}
                <tr onclick={() => push(`/jemaat/${p.jemaat_id}`)}>
                  <td>
                    <div class="dt-cell-primary">
                      <Avatar name={p.nama_lengkap} size="sm" />
                      <div>
                        <div>{p.nama_lengkap}</div>
                        {#if p.nama_panggilan}<div class="dt-cell-meta">{p.nama_panggilan}</div>{/if}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                      {#each names as n, i (i)}
                        <span class="chip chip-accent dt-chip-sm">{n}</span>
                      {/each}
                    </div>
                  </td>
                  <td class="mono" style="font-size: 13px;">{j?.nomor_telepon || '—'}</td>
                  <td style="width: 80px; text-align: right;">
                    <button
                      class="icon-btn"
                      type="button"
                      style="width: 28px; height: 28px;"
                      onclick={(e) => { e.stopPropagation(); openEdit(p); }}
                      aria-label="Ubah"
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    {#if confirmDeleteId === p.id}
                      <button
                        class="icon-btn"
                        type="button"
                        style="width: 28px; height: 28px; color: var(--danger); background: var(--danger-soft);"
                        onclick={(e) => { e.stopPropagation(); $deleteMut.mutate(p.id); }}
                        aria-label="Konfirmasi hapus"
                      >
                        <Icon name="check" size={14} />
                      </button>
                    {:else}
                      <button
                        class="icon-btn"
                        type="button"
                        style="width: 28px; height: 28px; color: var(--danger);"
                        onclick={(e) => { e.stopPropagation(); confirmDeleteId = p.id; }}
                        aria-label="Hapus"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
              {#if filtered.length === 0}
                <tr>
                  <td colspan="4" style="padding: 32px; text-align: center; color: var(--ink-3);">
                    {$listQ.isLoading ? 'Memuat…' : 'Belum ada pelayan.'}
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </DesktopLayout>

      <DesktopDialog
        open={showForm}
        title="Promosikan jemaat menjadi pelayan"
        width={520}
        onClose={() => (showForm = false)}
      >
        {@render promoteForm()}
        {#snippet footer()}
          <button class="dt-btn dt-btn-ghost" type="button" onclick={() => (showForm = false)}>Batal</button>
          <button
            class="dt-btn dt-btn-primary"
            type="button"
            disabled={!pickedJemaat || selectedTypes.length === 0 || $saveMut.isPending}
            onclick={() => $saveMut.mutate()}
          >
            {$saveMut.isPending ? 'Menyimpan…' : 'Tambah'}
          </button>
        {/snippet}
      </DesktopDialog>

      <DesktopDialog
        open={showEditForm}
        title={`Edit pelayan: ${editingPelayan?.nama_lengkap ?? ''}`}
        width={480}
        onClose={() => (showEditForm = false)}
      >
        {@render editForm()}
        {#snippet footer()}
          <button class="dt-btn dt-btn-ghost" type="button" onclick={() => (showEditForm = false)}>Batal</button>
          <button
            class="dt-btn dt-btn-primary"
            type="button"
            disabled={editSelectedTypes.length === 0 || $editMut.isPending}
            onclick={() => $editMut.mutate()}
          >
            {$editMut.isPending ? 'Menyimpan…' : 'Simpan'}
          </button>
        {/snippet}
      </DesktopDialog>
    {:else}
      <!-- ════════ MOBILE (unchanged) ════════ -->
      <div class="app">
        <TopBar title="Pelayan" large />

        <div class="app-scroll" style="padding-bottom: 80px;">
          <div style="padding: 0 16px 12px; display: flex; gap: 8px; overflow-x: auto;" class="no-scrollbar">
            <button class="chip chip-toggle {filter === 0 ? 'on' : ''}" type="button" onclick={() => (filter = 0)}>
              Semua <span style="opacity: 0.7; margin-left: 4px;">{$listQ.data?.data?.length ?? 0}</span>
            </button>
            {#each $stQ.data?.data ?? [] as st (st.id)}
              <button class="chip chip-toggle {filter === st.id ? 'on' : ''}" type="button" onclick={() => (filter = st.id)}>
                {st.nama} <span style="opacity: 0.7; margin-left: 4px;">{countForServiceType(st.id)}</span>
              </button>
            {/each}
          </div>

          <div class="list">
            {#if $listQ.isLoading}
              <div class="row" style="justify-content: center; color: var(--ink-3);">Memuat…</div>
            {:else if filtered.length === 0}
              <div class="empty">
                <div class="empty-icon"><Icon name="grid" /></div>
                <div class="empty-title">Belum ada pelayan</div>
                <div class="empty-sub">Tambahkan jemaat sebagai pelayan untuk mulai mengatur jadwal.</div>
              </div>
            {:else}
              {#each filtered as p (p.id)}
                {@const names = nameForServiceTypeIds(p.service_type_ids ?? [])}
                <div class="row" style="align-items: flex-start; padding-top: 14px; padding-bottom: 14px; min-height: auto; gap: 10px;">
                  <button
                    type="button"
                    style="display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; background: none; text-align: left;"
                    onclick={() => push(`/jemaat/${p.jemaat_id}`)}
                  >
                    <Avatar name={p.nama_lengkap} />
                    <div class="row-body">
                      <div class="row-title">{p.nama_lengkap}</div>
                      <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                        {#each names as n, i (i)}
                          <span class="chip" style="height: 22px; font-size: 11px; padding: 0 8px;">{n}</span>
                        {/each}
                      </div>
                    </div>
                  </button>
                  <button class="icon-btn" type="button" onclick={() => openEdit(p)} aria-label="Ubah">
                    <Icon name="edit" size={18} />
                  </button>
                  {#if confirmDeleteId === p.id}
                    <button
                      class="icon-btn"
                      type="button"
                      style="color: var(--danger); background: var(--danger-soft);"
                      onclick={() => { $deleteMut.mutate(p.id); confirmDeleteId = null; }}
                      aria-label="Konfirmasi hapus"
                    >
                      <Icon name="check" size={18} />
                    </button>
                  {:else}
                    <button
                      class="icon-btn"
                      type="button"
                      style="color: var(--danger);"
                      onclick={() => (confirmDeleteId = p.id)}
                      aria-label="Hapus"
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <button class="fab with-label" type="button" onclick={openCreate}>
          <Icon name="plus" /> Promosikan
        </button>

        <BottomNav />

        <Sheet open={showForm} onClose={() => (showForm = false)} title="Tambah pelayan">
          {@render promoteForm()}

          {#snippet footer()}
            <button class="btn btn-ghost" type="button" style="flex: 1;" onclick={() => (showForm = false)}>
              Batal
            </button>
            <button
              class="btn btn-primary"
              type="button"
              style="flex: 2;"
              disabled={!pickedJemaat || selectedTypes.length === 0 || $saveMut.isPending}
              onclick={() => $saveMut.mutate()}
            >
              {$saveMut.isPending ? 'Menyimpan…' : 'Tambah'}
            </button>
          {/snippet}
        </Sheet>

        <Sheet open={showEditForm} onClose={() => (showEditForm = false)} title={`Edit: ${editingPelayan?.nama_lengkap ?? ''}`}>
          {@render editForm()}

          {#snippet footer()}
            <button class="btn btn-ghost" type="button" style="flex: 1;" onclick={() => (showEditForm = false)}>
              Batal
            </button>
            <button
              class="btn btn-primary"
              type="button"
              style="flex: 2;"
              disabled={editSelectedTypes.length === 0 || $editMut.isPending}
              onclick={() => $editMut.mutate()}
            >
              {$editMut.isPending ? 'Menyimpan…' : 'Simpan'}
            </button>
          {/snippet}
        </Sheet>
      </div>
    {/if}
  {/snippet}
</ProtectedRoute>
