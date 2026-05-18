<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { kebaktianApi, type KebaktianWrite } from '$lib/api/kebaktian';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { ApiError } from '$lib/api/client';
  import { push } from 'svelte-spa-router';
  import { emptyToNull } from '$lib/utils/format';
  import { localToUTC, utcToLocalInput } from '$lib/utils/date';
  import { fmtDayMonth, fmtMediumID, fmtTime } from '$lib/utils/idDate';
  import { toast } from '$lib/stores/toast.svelte';
  import { viewport } from '$lib/stores/viewport.svelte';
  import type { Kebaktian, Paginated, ListWrap } from '$lib/types';
  import TopBar from '$lib/components/TopBar.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/Field.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';
  import DesktopDialog from '$lib/components/DesktopDialog.svelte';

  const qc = useQueryClient();

  type Filter = 'upcoming' | 'past' | 'all';
  let filter = $state<Filter>('upcoming');

  const listQ = createQuery(
    toStore(() => ({
      queryKey: ['kebaktian', 'list'],
      queryFn: () =>
        kebaktianApi.list({ limit: 200, offset: 0 }) as Promise<Paginated<Kebaktian> | ListWrap<Kebaktian>>,
    })),
  );
  const stQ = createQuery(
    toStore(() => ({
      queryKey: ['service-types'],
      queryFn: () => serviceTypesApi.list(),
    })),
  );
  const jadwalCountsQ = createQuery(
    toStore(() => ({
      queryKey: ['kebaktian', 'jadwal-counts', ($listQ.data?.data ?? []).map((k) => k.id).join(',')] as const,
      enabled: ($listQ.data?.data ?? []).length > 0,
      queryFn: async () => {
        const ks = $listQ.data?.data ?? [];
        const results = await Promise.all(
          ks.map((k) =>
            kebaktianApi
              .getJadwal(k.id)
              .then((r) => ({ id: k.id, filled: r.data.filter((s) => s.pelayan_id !== null).length }))
              .catch(() => ({ id: k.id, filled: 0 })),
          ),
        );
        const map: Record<number, number> = {};
        for (const r of results) map[r.id] = r.filled;
        return map;
      },
    })),
  );

  const total = $derived($stQ.data?.data?.length ?? 0);

  const filtered = $derived.by(() => {
    const all = ($listQ.data?.data ?? []).slice().sort((a, b) => a.waktu_mulai.localeCompare(b.waktu_mulai));
    const now = Date.now();
    if (filter === 'upcoming') return all.filter((k) => new Date(k.waktu_mulai).getTime() >= now - 86_400_000);
    if (filter === 'past') return all.filter((k) => new Date(k.waktu_mulai).getTime() < now - 86_400_000).reverse();
    return all;
  });

  let showForm = $state(false);
  let editing = $state<Kebaktian | null>(null);
  let confirmDeleteId = $state<number | null>(null);
  let form = $state<{
    nama: string;
    waktuLocal: string;
    lokasi: string | null;
    tema: string | null;
    pengkhotbah: string | null;
    catatan: string | null;
  }>({ nama: '', waktuLocal: '', lokasi: null, tema: null, pengkhotbah: null, catatan: null });
  let errors = $state<Record<string, string>>({});

  function openCreate() {
    editing = null;
    form = { nama: '', waktuLocal: '', lokasi: null, tema: null, pengkhotbah: null, catatan: null };
    errors = {};
    showForm = true;
  }

  function openEdit(k: Kebaktian) {
    editing = k;
    form = {
      nama: k.nama,
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
      toast.show(editing ? 'Kebaktian diperbarui' : 'Kebaktian ditambahkan');
      showForm = false;
    },
    onError: (e) => {
      if (e instanceof ApiError) errors = e.fields ?? { _: e.message };
      else errors = { _: (e as Error).message };
    },
  });

  const deleteMut = createMutation({
    mutationFn: (id: number) => kebaktianApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kebaktian'] });
      confirmDeleteId = null;
      toast.show('Kebaktian dihapus');
    },
    onError: () => toast.show('Gagal menghapus kebaktian'),
  });

  function submit(e?: Event) {
    e?.preventDefault();
    errors = {};
    $saveMut.mutate();
  }

  const dayMonth = fmtDayMonth;
</script>

{#snippet kebaktianForm()}
  <form onsubmit={submit} style="display: flex; flex-direction: column; gap: 14px;">
    <Field label="Nama" required error={errors.nama}>
      <input class="input" bind:value={form.nama} placeholder="Kebaktian Umum / Persekutuan Doa" />
    </Field>
    <div style="display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px;">
      <Field label="Tanggal & jam" required error={errors.waktu_mulai}>
        <input class="input" type="datetime-local" bind:value={form.waktuLocal} />
      </Field>
      <Field label="Lokasi">
        <input class="input" bind:value={form.lokasi} />
      </Field>
    </div>
    <Field label="Tema">
      <input class="input" bind:value={form.tema} />
    </Field>
    <Field label="Pengkhotbah">
      <input class="input" bind:value={form.pengkhotbah} />
    </Field>
    {#if errors._}<p class="field-error">{errors._}</p>{/if}
  </form>
{/snippet}

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <!-- ════════ DESKTOP ════════ -->
      <DesktopLayout
        title="Kebaktian"
        subtitle={`${filtered.length} kebaktian ${filter === 'upcoming' ? 'akan datang' : filter === 'past' ? 'telah lewat' : 'tercatat'}`}
      >
        {#snippet actions()}
          <button class="dt-btn dt-btn-outline" type="button">
            <Icon name="calendar" size={16} /> Tampilan kalender
          </button>
          <button class="dt-btn dt-btn-primary" type="button" onclick={openCreate}>
            <Icon name="plus" size={16} /> Tambah kebaktian
          </button>
        {/snippet}

        <div class="dt-toolbar">
          <button class="chip chip-toggle {filter === 'upcoming' ? 'on' : ''}" type="button" onclick={() => (filter = 'upcoming')}>
            Akan datang
          </button>
          <button class="chip chip-toggle {filter === 'past' ? 'on' : ''}" type="button" onclick={() => (filter = 'past')}>
            Lewat
          </button>
          <button class="chip chip-toggle {filter === 'all' ? 'on' : ''}" type="button" onclick={() => (filter = 'all')}>
            Semua
          </button>
        </div>

        <div class="dt-table-wrap">
          <table class="dt-table">
            <thead>
              <tr>
                <th>Kebaktian</th>
                <th>Tanggal</th>
                <th>Pengkhotbah</th>
                <th>Tema</th>
                <th class="num-r">Jadwal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each filtered as k (k.id)}
                {@const dm = dayMonth(k.waktu_mulai)}
                {@const filled = ($jadwalCountsQ.data ?? {})[k.id] ?? 0}
                {@const chipCls = filled === total && total > 0
                  ? 'chip-ok'
                  : filled === 0
                  ? 'chip-warn'
                  : 'chip-accent'}
                <tr onclick={() => push(`/kebaktian/${k.id}`)}>
                  <td>
                    <div class="dt-cell-primary">
                      <div class="dt-date-tile" style="width: 40px; height: 44px;">
                        <div class="m">{dm.month}</div>
                        <div class="d" style="font-size: 16px;">{dm.day}</div>
                      </div>
                      <div>
                        <div>{k.nama}</div>
                        <div class="dt-cell-meta">{k.lokasi ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {fmtMediumID(k.waktu_mulai)}
                    <div class="dt-cell-meta">{fmtTime(k.waktu_mulai)}</div>
                  </td>
                  <td>
                    {#if k.pengkhotbah}
                      {k.pengkhotbah}
                    {:else}
                      <span style="color: var(--ink-4);">—</span>
                    {/if}
                  </td>
                  <td style="color: var(--ink-2); font-style: {k.tema ? 'italic' : 'normal'};">
                    {#if k.tema}
                      &ldquo;{k.tema}&rdquo;
                    {:else}
                      <span style="color: var(--ink-4); font-style: normal;">—</span>
                    {/if}
                  </td>
                  <td class="num-r">
                    <span class="chip {chipCls}">{filled}/{total}</span>
                  </td>
                  <td style="width: 140px; text-align: right; white-space: nowrap;">
                    <button
                      class="dt-btn dt-btn-outline dt-btn-sm"
                      type="button"
                      onclick={(e) => { e.stopPropagation(); push(`/kebaktian/${k.id}/jadwal`); }}
                    >
                      Atur →
                    </button>
                    <button
                      class="icon-btn"
                      type="button"
                      style="width: 28px; height: 28px; margin-left: 4px;"
                      onclick={(e) => { e.stopPropagation(); openEdit(k); }}
                      aria-label="Ubah"
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    {#if confirmDeleteId === k.id}
                      <button
                        class="icon-btn"
                        type="button"
                        style="width: 28px; height: 28px; color: var(--danger); background: var(--danger-soft);"
                        onclick={(e) => { e.stopPropagation(); $deleteMut.mutate(k.id); }}
                        aria-label="Konfirmasi hapus"
                      >
                        <Icon name="check" size={14} />
                      </button>
                    {:else}
                      <button
                        class="icon-btn"
                        type="button"
                        style="width: 28px; height: 28px; color: var(--danger);"
                        onclick={(e) => { e.stopPropagation(); confirmDeleteId = k.id; }}
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
                  <td colspan="6" style="padding: 32px; text-align: center; color: var(--ink-3);">
                    {$listQ.isLoading ? 'Memuat…' : 'Belum ada kebaktian.'}
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </DesktopLayout>

      <DesktopDialog
        open={showForm}
        title={editing ? 'Edit kebaktian' : 'Tambah kebaktian'}
        width={560}
        onClose={() => (showForm = false)}
      >
        {@render kebaktianForm()}
        {#snippet footer()}
          <button class="dt-btn dt-btn-ghost" type="button" onclick={() => (showForm = false)}>Batal</button>
          <button
            class="dt-btn dt-btn-primary"
            type="button"
            disabled={$saveMut.isPending}
            onclick={() => submit()}
          >
            {$saveMut.isPending ? 'Menyimpan…' : editing ? 'Simpan' : 'Tambah'}
          </button>
        {/snippet}
      </DesktopDialog>
    {:else}
      <!-- ════════ MOBILE (unchanged) ════════ -->
      <div class="app">
        <TopBar title="Kebaktian" large>
          {#snippet trailing()}
            <button class="icon-btn" type="button" aria-label="Kalender"><Icon name="calendar" /></button>
          {/snippet}
        </TopBar>

        <div class="app-scroll" style="padding-bottom: 80px;">
          <div style="padding: 0 16px 12px; display: flex; gap: 8px;">
            <button class="chip chip-toggle {filter === 'upcoming' ? 'on' : ''}" type="button" onclick={() => (filter = 'upcoming')}>
              Akan datang
            </button>
            <button class="chip chip-toggle {filter === 'past' ? 'on' : ''}" type="button" onclick={() => (filter = 'past')}>
              Lewat
            </button>
            <button class="chip chip-toggle {filter === 'all' ? 'on' : ''}" type="button" onclick={() => (filter = 'all')}>
              Semua
            </button>
          </div>

          <div class="list">
            {#if $listQ.isLoading}
              <div class="row" style="justify-content: center; color: var(--ink-3);">Memuat…</div>
            {:else if filtered.length === 0}
              <div class="empty">
                <div class="empty-icon"><Icon name="calendar" /></div>
                <div class="empty-title">Belum ada kebaktian</div>
                <div class="empty-sub">Tambahkan kebaktian untuk mulai mengatur jadwal pelayanan.</div>
              </div>
            {:else}
              {#each filtered as k (k.id)}
                {@const dm = dayMonth(k.waktu_mulai)}
                {@const filled = ($jadwalCountsQ.data ?? {})[k.id] ?? 0}
                {@const chipCls = filled === total && total > 0 ? 'chip-ok' : filled === 0 ? 'chip-warn' : 'chip-accent'}
                <div class="row" style="align-items: flex-start; padding: 14px; flex-direction: column; gap: 10px; min-height: auto;">
                  <div style="display: flex; align-items: flex-start; gap: 12px; width: 100%;">
                    <button
                      type="button"
                      style="display: flex; align-items: flex-start; gap: 12px; flex: 1; min-width: 0; background: none; text-align: left;"
                      onclick={() => push(`/kebaktian/${k.id}`)}
                    >
                      <div
                        style="width: 48px; min-width: 48px; height: 56px; background: var(--accent-soft);
                               border-radius: 12px; display: flex; flex-direction: column;
                               align-items: center; justify-content: center; color: var(--accent-ink);"
                      >
                        <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.08em;">{dm.month}</div>
                        <div style="font-size: 20px; font-weight: 800; line-height: 1; letter-spacing: -0.02em;">{dm.day}</div>
                      </div>
                      <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 15px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em;">{k.nama}</div>
                        <div style="font-size: 13px; color: var(--ink-3); margin-top: 1px;">{fmtMediumID(k.waktu_mulai)}</div>
                        <div style="font-size: 12px; color: var(--ink-3); margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                          <Icon name="map" size={12} />
                          {k.lokasi ?? '—'}{k.pengkhotbah ? ` · ${k.pengkhotbah}` : ''}
                        </div>
                      </div>
                    </button>
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                      <span class="chip {chipCls}">{filled}/{total}</span>
                      <div style="display: flex; gap: 2px;">
                        <button class="icon-btn" type="button" onclick={() => openEdit(k)} aria-label="Ubah" style="width: 32px; height: 32px;">
                          <Icon name="edit" size={15} />
                        </button>
                        {#if confirmDeleteId === k.id}
                          <button
                            class="icon-btn"
                            type="button"
                            style="width: 32px; height: 32px; color: var(--danger); background: var(--danger-soft);"
                            onclick={() => { $deleteMut.mutate(k.id); confirmDeleteId = null; }}
                            aria-label="Konfirmasi hapus"
                          >
                            <Icon name="check" size={15} />
                          </button>
                        {:else}
                          <button
                            class="icon-btn"
                            type="button"
                            style="width: 32px; height: 32px; color: var(--danger);"
                            onclick={() => (confirmDeleteId = k.id)}
                            aria-label="Hapus"
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        {/if}
                      </div>
                    </div>
                  </div>
                  {#if k.tema}
                    <div style="font-size: 12px; color: var(--ink-2); background: var(--surface-2); padding: 6px 10px; border-radius: 8px; align-self: stretch; margin-left: 60px;">
                      &ldquo;{k.tema}&rdquo;
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <button class="fab with-label" type="button" onclick={openCreate}>
          <Icon name="plus" /> Tambah
        </button>

        <BottomNav />

        <Sheet open={showForm} onClose={() => (showForm = false)} title={editing ? 'Edit kebaktian' : 'Tambah kebaktian'}>
          {@render kebaktianForm()}

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
              {$saveMut.isPending ? 'Menyimpan…' : editing ? 'Simpan' : 'Tambah'}
            </button>
          {/snippet}
        </Sheet>
      </div>
    {/if}
  {/snippet}
</ProtectedRoute>
