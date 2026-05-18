<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { jemaatApi, type JemaatWrite } from '$lib/api/jemaat';
  import { keluargaApi } from '$lib/api/keluarga';
  import { pelayanApi } from '$lib/api/pelayan';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { ApiError } from '$lib/api/client';
  import { push } from 'svelte-spa-router';
  import { z } from 'zod';
  import { emptyToNull, ageFromIso, formatDateID, maritalStatusLabel } from '$lib/utils/format';
  import { toast } from '$lib/stores/toast.svelte';
  import { viewport } from '$lib/stores/viewport.svelte';
  import type { Jemaat } from '$lib/types';
  import TopBar from '$lib/components/TopBar.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/Field.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';
  import DesktopDialog from '$lib/components/DesktopDialog.svelte';

  const qc = useQueryClient();

  let search = $state('');
  let filter = $state<'semua' | 'pelayan' | 'L' | 'P'>('semua');
  let limit = $state(200);
  let selectedId = $state<number | null>(null);

  const listQ = createQuery(
    toStore(() => ({
      queryKey: ['jemaat', 'list', search, limit] as const,
      queryFn: () => jemaatApi.list({ q: search || undefined, limit, offset: 0 }),
    })),
  );
  const keluargaQ = createQuery(
    toStore(() => ({
      queryKey: ['keluarga', 'all'],
      queryFn: () => keluargaApi.list({ limit: 200, offset: 0 }),
    })),
  );
  const pelayanQ = createQuery(
    toStore(() => ({
      queryKey: ['pelayan', 'all'],
      queryFn: () => pelayanApi.list({ limit: 500, offset: 0 }),
    })),
  );
  const stQ = createQuery(
    toStore(() => ({
      queryKey: ['service-types'],
      queryFn: () => serviceTypesApi.list(),
    })),
  );

  const pelayanIds = $derived(new Set(($pelayanQ.data?.data ?? []).map((p) => p.jemaat_id)));
  const pelayanByJemaatId = $derived.by(() => {
    const m = new Map<number, { service_type_ids: number[] }>();
    for (const p of $pelayanQ.data?.data ?? []) {
      m.set(p.jemaat_id, { service_type_ids: p.service_type_ids ?? [] });
    }
    return m;
  });

  const filtered = $derived.by(() => {
    const all = $listQ.data?.data ?? [];
    let rows = all;
    if (filter === 'pelayan') rows = rows.filter((j) => pelayanIds.has(j.id));
    if (filter === 'L') rows = rows.filter((j) => j.jenis_kelamin === 'L');
    if (filter === 'P') rows = rows.filter((j) => j.jenis_kelamin === 'P');
    return rows;
  });

  // Auto-select first row when desktop and nothing selected
  $effect(() => {
    if (!viewport.isDesktop) return;
    if (selectedId == null && filtered.length > 0) {
      selectedId = filtered[0].id;
    }
  });

  const selected = $derived(($listQ.data?.data ?? []).find((j) => j.id === selectedId) ?? null);

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
      toast.show(editing ? 'Jemaat diperbarui' : 'Jemaat ditambahkan');
      showForm = false;
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) errors = e.fields;
    },
  });

  function submit(e?: Event) {
    e?.preventDefault();
    errors = {};
    const parsed = schema.safeParse({ nama_lengkap: form.nama_lengkap, email: form.email });
    if (!parsed.success) {
      errors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
      return;
    }
    $saveMut.mutate(form);
  }

  function familyName(id: number | null): string {
    if (!id) return 'Tanpa keluarga';
    return $keluargaQ.data?.data.find((k) => k.id === id)?.nama_keluarga ?? 'Tanpa keluarga';
  }

  function serviceNames(jemaatId: number): string[] {
    const rec = pelayanByJemaatId.get(jemaatId);
    if (!rec) return [];
    const all = $stQ.data?.data ?? [];
    return rec.service_type_ids
      .map((id) => all.find((s) => s.id === id)?.nama)
      .filter((x): x is string => !!x);
  }

  const totals = $derived.by(() => {
    const all = $listQ.data?.data ?? [];
    return {
      semua: all.length,
      pelayan: all.filter((j) => pelayanIds.has(j.id)).length,
    };
  });
</script>

{#snippet jemaatForm()}
  <form onsubmit={submit} style="display: flex; flex-direction: column; gap: 14px;">
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
      <Field label="Nama lengkap" required error={errors.nama_lengkap}>
        <input class="input" bind:value={form.nama_lengkap} placeholder="Budi Santoso" autocomplete="name" />
      </Field>
      <Field label="Nama panggilan">
        <input class="input" bind:value={form.nama_panggilan} />
      </Field>

      <Field label="Jenis kelamin">
        <div style="display: flex; gap: 8px;">
          <button
            type="button"
            class="chip chip-toggle {form.jenis_kelamin === 'L' ? 'on' : ''}"
            style="flex: 1; justify-content: center; height: 40px; border-radius: 10px;"
            onclick={() => (form.jenis_kelamin = 'L')}
          >
            Laki-laki
          </button>
          <button
            type="button"
            class="chip chip-toggle {form.jenis_kelamin === 'P' ? 'on' : ''}"
            style="flex: 1; justify-content: center; height: 40px; border-radius: 10px;"
            onclick={() => (form.jenis_kelamin = 'P')}
          >
            Perempuan
          </button>
        </div>
      </Field>
      <Field label="Tanggal lahir">
        <input class="input" type="date" bind:value={form.tanggal_lahir} />
      </Field>

      <Field label="Nomor telepon">
        <input class="input" type="tel" inputmode="tel" bind:value={form.nomor_telepon} placeholder="0812-xxxx-xxxx" />
      </Field>
      <Field label="Email" error={errors.email}>
        <input class="input" type="email" inputmode="email" bind:value={form.email} />
      </Field>

      <div style="grid-column: 1 / -1;">
        <Field label="Alamat">
          <textarea class="textarea" rows="2" bind:value={form.alamat}></textarea>
        </Field>
      </div>

      <Field label="Status pernikahan">
        <select class="select" bind:value={form.status_pernikahan}>
          <option value={null}>—</option>
          <option value="belum_menikah">Belum menikah</option>
          <option value="menikah">Menikah</option>
          <option value="cerai">Cerai</option>
          <option value="duda">Duda</option>
          <option value="janda">Janda</option>
        </select>
      </Field>
      <Field label="Keluarga">
        <select class="select" bind:value={form.keluarga_id}>
          <option value={null}>— Tidak terhubung —</option>
          {#if $keluargaQ.data}
            {#each $keluargaQ.data.data as k (k.id)}
              <option value={k.id}>{k.nama_keluarga}</option>
            {/each}
          {/if}
        </select>
      </Field>

      <Field label="Tanggal baptis">
        <input class="input" type="date" bind:value={form.tanggal_baptis} />
      </Field>
      <Field label="Tanggal sidi">
        <input class="input" type="date" bind:value={form.tanggal_sidi} />
      </Field>

      <div style="grid-column: 1 / -1;">
        <Field label="Catatan" hint="Maks 2000 karakter">
          <textarea class="textarea" rows="3" bind:value={form.catatan}></textarea>
        </Field>
      </div>
    </div>
  </form>
{/snippet}

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <!-- ════════ DESKTOP ════════ -->
      <DesktopLayout title="Jemaat" subtitle={`${filtered.length} dari ${$listQ.data?.total ?? 0} jemaat`} split>
        {#snippet actions()}
          <button class="dt-btn dt-btn-outline" type="button">
            <Icon name="doc" size={16} /> Ekspor
          </button>
          <button class="dt-btn dt-btn-primary" type="button" onclick={openCreate}>
            <Icon name="plus" size={16} /> Tambah jemaat
          </button>
        {/snippet}

        <div class="dt-split-left">
          <div class="dt-toolbar">
            <div class="dt-search">
              <span class="dt-search-icon"><Icon name="search" /></span>
              <input placeholder="Cari nama, email…" bind:value={search} />
            </div>
            <button class="chip chip-toggle {filter === 'semua' ? 'on' : ''}" type="button" onclick={() => (filter = 'semua')}>
              Semua
            </button>
            <button class="chip chip-toggle {filter === 'pelayan' ? 'on' : ''}" type="button" onclick={() => (filter = 'pelayan')}>
              Pelayan
            </button>
            <button class="chip chip-toggle {filter === 'L' ? 'on' : ''}" type="button" onclick={() => (filter = 'L')}>
              Laki-laki
            </button>
            <button class="chip chip-toggle {filter === 'P' ? 'on' : ''}" type="button" onclick={() => (filter = 'P')}>
              Perempuan
            </button>
            <div style="flex: 1;"></div>
            <button class="dt-btn dt-btn-outline dt-btn-sm" type="button">
              <Icon name="filter" size={14} /> Filter
            </button>
          </div>

          <div class="dt-table-wrap">
            <table class="dt-table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Keluarga</th>
                  <th>Kontak</th>
                  <th>Umur</th>
                  <th>Pelayanan</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {#each filtered as j (j.id)}
                  {@const age = ageFromIso(j.tanggal_lahir)}
                  {@const names = serviceNames(j.id)}
                  <tr class={selectedId === j.id ? 'selected' : ''} onclick={() => (selectedId = j.id)}>
                    <td>
                      <div class="dt-cell-primary">
                        <Avatar name={j.nama_lengkap} size="sm" />
                        <div>
                          <div>{j.nama_lengkap}</div>
                          {#if j.nama_panggilan}<div class="dt-cell-meta">{j.nama_panggilan}</div>{/if}
                        </div>
                      </div>
                    </td>
                    <td style="color: {j.keluarga_id ? 'var(--ink)' : 'var(--ink-3)'};">
                      {familyName(j.keluarga_id)}
                    </td>
                    <td>
                      <div style="font-size: 13px;" class="mono">{j.nomor_telepon || '—'}</div>
                      <div class="dt-cell-meta">{j.email || '—'}</div>
                    </td>
                    <td class="num">{age != null ? `${age} thn` : '—'}</td>
                    <td>
                      {#if names.length === 0}
                        <span style="color: var(--ink-4); font-size: 12px;">—</span>
                      {:else}
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                          {#each names.slice(0, 2) as n, i (i)}
                            <span class="chip chip-accent dt-chip-sm">{n}</span>
                          {/each}
                          {#if names.length > 2}
                            <span class="chip dt-chip-sm">+{names.length - 2}</span>
                          {/if}
                        </div>
                      {/if}
                    </td>
                    <td style="width: 40px;">
                      <button
                        class="icon-btn"
                        type="button"
                        style="width: 28px; height: 28px;"
                        onclick={(e) => {
                          e.stopPropagation();
                          openEdit(j);
                        }}
                        aria-label="Ubah"
                      >
                        <Icon name="more" size={16} />
                      </button>
                    </td>
                  </tr>
                {/each}
                {#if filtered.length === 0}
                  <tr>
                    <td colspan="6" style="padding: 32px; text-align: center; color: var(--ink-3);">
                      Tidak ada hasil.
                    </td>
                  </tr>
                {/if}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Detail panel -->
        <div class="dt-split-right">
          {#if selected}
            {@const age = ageFromIso(selected.tanggal_lahir)}
            {@const names = serviceNames(selected.id)}
            <div class="dt-detail-head">
              <Avatar name={selected.nama_lengkap} size="lg" />
              <div>
                <div style="font-size: 18px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em;">
                  {selected.nama_lengkap}
                </div>
                {#if selected.nama_panggilan}
                  <div style="font-size: 12px; color: var(--ink-3);">Panggilan: {selected.nama_panggilan}</div>
                {/if}
              </div>
              <div class="hstack" style="flex-wrap: wrap; justify-content: center;">
                {#if pelayanIds.has(selected.id)}<span class="chip chip-accent dt-chip-sm">Pelayan</span>{/if}
                {#if selected.jenis_kelamin}<span class="chip dt-chip-sm">{selected.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</span>{/if}
                {#if age != null}<span class="chip dt-chip-sm">{age} tahun</span>{/if}
                {#if selected.status_pernikahan}<span class="chip dt-chip-sm">{maritalStatusLabel(selected.status_pernikahan)}</span>{/if}
              </div>
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                <button class="dt-btn dt-btn-outline dt-btn-sm" type="button" onclick={() => openEdit(selected)}>
                  <Icon name="edit" size={13} /> Edit
                </button>
                <button class="dt-btn dt-btn-ghost dt-btn-sm" type="button" onclick={() => push(`/jemaat/${selected.id}`)}>
                  Buka profil →
                </button>
              </div>
            </div>

            <div class="dt-detail-body">
              <div class="dt-detail-section">
                <div class="t">Kontak</div>
                <div class="dt-detail-row">
                  <span class="lab">Telepon</span>
                  <span class="val mono">{selected.nomor_telepon || '—'}</span>
                </div>
                <div class="dt-detail-row">
                  <span class="lab">Email</span>
                  <span class="val">{selected.email || '—'}</span>
                </div>
                <div class="dt-detail-row">
                  <span class="lab">Alamat</span>
                  <span class="val">{selected.alamat || '—'}</span>
                </div>
              </div>

              <div class="dt-detail-section">
                <div class="t">Rohani</div>
                <div class="dt-detail-row">
                  <span class="lab">Lahir</span>
                  <span class="val">{formatDateID(selected.tanggal_lahir)}</span>
                </div>
                <div class="dt-detail-row">
                  <span class="lab">Baptis</span>
                  <span class="val">{formatDateID(selected.tanggal_baptis)}</span>
                </div>
                <div class="dt-detail-row">
                  <span class="lab">Sidi</span>
                  <span class="val">{formatDateID(selected.tanggal_sidi)}</span>
                </div>
              </div>

              {#if names.length > 0}
                <div class="dt-detail-section">
                  <div class="t">Pelayanan</div>
                  <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                    {#each names as n, i (i)}
                      <span class="chip chip-accent dt-chip-sm">{n}</span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <div class="empty" style="padding: 60px 24px;">
              <div class="empty-icon"><Icon name="users" /></div>
              <div class="empty-title">Pilih jemaat</div>
              <div class="empty-sub">Klik baris di tabel untuk melihat detail.</div>
            </div>
          {/if}
        </div>
      </DesktopLayout>

      <DesktopDialog
        open={showForm}
        title={editing ? 'Edit jemaat' : 'Tambah jemaat baru'}
        width={640}
        onClose={() => (showForm = false)}
      >
        {@render jemaatForm()}
        {#snippet footer()}
          <button class="dt-btn dt-btn-ghost" type="button" onclick={() => (showForm = false)}>
            Batal
          </button>
          <button
            class="dt-btn dt-btn-primary"
            type="button"
            disabled={$saveMut.isPending}
            onclick={() => submit()}
          >
            {$saveMut.isPending ? 'Menyimpan…' : editing ? 'Simpan' : 'Tambah jemaat'}
          </button>
        {/snippet}
      </DesktopDialog>
    {:else}
      <!-- ════════ MOBILE (unchanged) ════════ -->
      <div class="app">
        <TopBar title="Jemaat" large>
          {#snippet trailing()}
            <button class="icon-btn" type="button" aria-label="Filter"><Icon name="filter" /></button>
          {/snippet}
        </TopBar>

        <div class="app-scroll" style="padding-bottom: 80px;">
          <div style="padding: 0 16px 10px;" class="search-wrap">
            <span class="search-icon"><Icon name="search" /></span>
            <input
              class="input input-search"
              placeholder="Cari nama, panggilan, email…"
              bind:value={search}
              inputmode="search"
            />
          </div>

          <div style="padding: 0 16px 12px; display: flex; gap: 8px; overflow-x: auto;" class="no-scrollbar">
            <button class="chip chip-toggle {filter === 'semua' ? 'on' : ''}" type="button" onclick={() => (filter = 'semua')}>
              Semua <span style="opacity: 0.7; margin-left: 4px;">{totals.semua}</span>
            </button>
            <button class="chip chip-toggle {filter === 'pelayan' ? 'on' : ''}" type="button" onclick={() => (filter = 'pelayan')}>
              Pelayan <span style="opacity: 0.7; margin-left: 4px;">{totals.pelayan}</span>
            </button>
            <button class="chip chip-toggle {filter === 'L' ? 'on' : ''}" type="button" onclick={() => (filter = 'L')}>
              Laki-laki
            </button>
            <button class="chip chip-toggle {filter === 'P' ? 'on' : ''}" type="button" onclick={() => (filter = 'P')}>
              Perempuan
            </button>
          </div>

          <div style="padding: 0 18px 8px; font-size: 12px; color: var(--ink-3);">
            {filtered.length} dari {$listQ.data?.total ?? 0} jemaat
          </div>

          <div class="list">
            {#if $listQ.isLoading}
              <div class="row" style="justify-content: center; color: var(--ink-3);">Memuat…</div>
            {:else if filtered.length === 0}
              <div class="empty">
                <div class="empty-icon"><Icon name="users" /></div>
                <div class="empty-title">Tidak ada hasil</div>
                <div class="empty-sub">Coba kata kunci lain atau hapus filter.</div>
              </div>
            {:else}
              {#each filtered as j (j.id)}
                {@const age = ageFromIso(j.tanggal_lahir)}
                <button class="row row-tap" type="button" onclick={() => push(`/jemaat/${j.id}`)}>
                  <Avatar name={j.nama_lengkap} />
                  <div class="row-body">
                    <div class="row-title">{j.nama_lengkap}</div>
                    <div class="row-sub">
                      {familyName(j.keluarga_id)} · {j.jenis_kelamin === 'L' ? '♂' : j.jenis_kelamin === 'P' ? '♀' : ''}
                      {age ?? '—'} thn
                    </div>
                  </div>
                  {#if pelayanIds.has(j.id)}
                    <span class="chip chip-accent">Pelayan</span>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <button class="fab with-label" type="button" onclick={openCreate}>
          <Icon name="plus" /> Tambah
        </button>

        <BottomNav />

        <Sheet open={showForm} onClose={() => (showForm = false)} title={editing ? 'Edit jemaat' : 'Tambah jemaat'}>
          {@render jemaatForm()}
          {#snippet footer()}
            <button class="btn btn-ghost" type="button" style="flex: 1;" onclick={() => (showForm = false)}>
              Batal
            </button>
            <button
              class="btn btn-primary"
              type="button"
              style="flex: 2;"
              disabled={$saveMut.isPending}
              onclick={() => submit()}
            >
              {$saveMut.isPending ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Tambah'}
            </button>
          {/snippet}
        </Sheet>
      </div>
    {/if}
  {/snippet}
</ProtectedRoute>
