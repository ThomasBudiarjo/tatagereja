<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { kebaktianApi, type JadwalSlotWrite } from '$lib/api/kebaktian';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { pelayanApi } from '$lib/api/pelayan';
  import { ApiError } from '$lib/api/client';
  import { push } from 'svelte-spa-router';
  import { fmtMediumID, fmtDayMonth } from '$lib/utils/idDate';
  import { toast } from '$lib/stores/toast.svelte';
  import { viewport } from '$lib/stores/viewport.svelte';
  import type { Kebaktian, Paginated, ListWrap } from '$lib/types';
  import TopBar from '$lib/components/TopBar.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';

  const qc = useQueryClient();

  const kebaktianListQ = createQuery(
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
  const pelayanQ = createQuery(
    toStore(() => ({
      queryKey: ['pelayan', 'all'],
      queryFn: () => pelayanApi.list({ limit: 500, offset: 0 }),
    })),
  );

  // Upcoming next-5 kebaktian
  const upcoming = $derived.by(() => {
    const all = ($kebaktianListQ.data?.data ?? [])
      .slice()
      .sort((a, b) => a.waktu_mulai.localeCompare(b.waktu_mulai));
    const now = Date.now();
    return all.filter((k) => new Date(k.waktu_mulai).getTime() >= now - 86_400_000).slice(0, 5);
  });

  // Fetch jadwal for upcoming kebaktian
  const upcomingIds = $derived(upcoming.map((k) => k.id));
  const jadwalAllQ = createQuery(
    toStore(() => ({
      queryKey: ['jadwal', 'master', upcomingIds.join(',')] as const,
      enabled: upcomingIds.length > 0,
      queryFn: async () => {
        const results = await Promise.all(
          upcomingIds.map((id) =>
            kebaktianApi
              .getJadwal(id)
              .then((r) => ({ id, slots: r.data }))
              .catch(() => ({ id, slots: [] as Awaited<ReturnType<typeof kebaktianApi.getJadwal>>['data'] })),
          ),
        );
        const map: Record<number, Record<number, number | null>> = {};
        for (const r of results) {
          map[r.id] = {};
          for (const s of r.slots) {
            map[r.id][s.service_type_id] = s.pelayan_id;
          }
        }
        return map;
      },
    })),
  );

  // Local edit state: { [kebId]: { [stId]: pelayan_id | null } }
  let edits = $state<Record<number, Record<number, number | null>>>({});

  $effect(() => {
    const fetched = $jadwalAllQ.data;
    if (!fetched) return;
    // Initialize edits from fetched (preserve any user edits already made)
    const next: typeof edits = {};
    for (const id of upcomingIds) {
      next[id] = { ...(fetched[id] ?? {}), ...(edits[id] ?? {}) };
    }
    edits = next;
  });

  const total = $derived($stQ.data?.data?.length ?? 0);

  const totalEmpty = $derived.by(() => {
    let count = 0;
    for (const k of upcoming) {
      for (const st of $stQ.data?.data ?? []) {
        const pid = edits[k.id]?.[st.id];
        if (pid === null || pid === undefined) count++;
      }
    }
    return count;
  });

  function pelayanForService(stId: number) {
    return ($pelayanQ.data?.data ?? []).filter((p) => p.service_type_ids?.includes(stId));
  }

  function pelayanById(id: number | null | undefined) {
    if (!id) return null;
    return ($pelayanQ.data?.data ?? []).find((p) => p.id === id) ?? null;
  }

  function iconForServiceType(name: string): 'mic' | 'music' | 'doc' | 'person' | 'sparkle' | 'tag' {
    const n = name.toLowerCase();
    if (n.includes('pujian') || n.includes('worship') || n.includes('pemimpin')) return 'mic';
    if (n.includes('singer') || n.includes('musisi') || n.includes('music')) return 'music';
    if (n.includes('multimedia') || n.includes('slide') || n.includes('sound')) return 'doc';
    if (n.includes('usher') || n.includes('penyambut')) return 'person';
    if (n.includes('doa')) return 'sparkle';
    return 'tag';
  }

  let picker = $state<{ kebId: number; stId: number } | null>(null);
  let pickerQuery = $state('');

  function setCell(kebId: number, stId: number, pid: number | null) {
    edits = {
      ...edits,
      [kebId]: { ...(edits[kebId] ?? {}), [stId]: pid },
    };
  }

  const saveAllMut = createMutation({
    mutationFn: async () => {
      const ops = upcoming.map((k) => {
        const slots: JadwalSlotWrite[] = ($stQ.data?.data ?? []).map((st) => ({
          service_type_id: st.id,
          pelayan_id: edits[k.id]?.[st.id] ?? null,
          catatan: null,
        }));
        return kebaktianApi.replaceJadwal(k.id, slots);
      });
      await Promise.all(ops);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jadwal'] });
      qc.invalidateQueries({ queryKey: ['kebaktian', 'jadwal-counts'] });
      toast.show('Jadwal tersimpan');
    },
    onError: (e) => {
      toast.show(e instanceof ApiError ? e.message : 'Gagal menyimpan');
    },
  });

  const pickerCandidates = $derived.by(() => {
    if (!picker) return [];
    const all = pelayanForService(picker.stId);
    if (!pickerQuery) return all;
    const lc = pickerQuery.toLowerCase();
    return all.filter((p) => p.nama_lengkap.toLowerCase().includes(lc));
  });

  const pickerService = $derived.by(() => {
    const p = picker;
    if (!p) return null;
    return ($stQ.data?.data ?? []).find((s) => s.id === p.stId) ?? null;
  });
  const pickerKebaktian = $derived.by(() => {
    const p = picker;
    if (!p) return null;
    return upcoming.find((k) => k.id === p.kebId) ?? null;
  });
  const pickerCurrent = $derived.by(() => {
    const p = picker;
    if (!p) return null;
    return edits[p.kebId]?.[p.stId] ?? null;
  });
</script>

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <DesktopLayout
        title="Jadwal Pelayanan"
        subtitle={`${upcoming.length} kebaktian × ${total} jenis pelayanan · ${totalEmpty} slot belum terisi`}
      >
        {#snippet actions()}
          <button class="dt-btn dt-btn-outline" type="button">
            <Icon name="doc" size={16} /> Cetak / PDF
          </button>
          <button
            class="dt-btn dt-btn-primary"
            type="button"
            disabled={$saveAllMut.isPending}
            onclick={() => $saveAllMut.mutate()}
          >
            {$saveAllMut.isPending ? 'Menyimpan…' : 'Simpan semua'}
          </button>
        {/snippet}

        <div
          style="font-size: 12px; color: var(--ink-3); margin-bottom: 12px;
                 display: flex; align-items: center; gap: 6px;"
        >
          <span
            style="width: 16px; height: 16px; border-radius: 999px; background: var(--surface-2);
                   color: var(--ink-2); font-weight: 700; display: inline-flex; align-items: center;
                   justify-content: center; font-size: 10px;"
          >
            i
          </span>
          Klik sel apapun untuk mengisi atau mengganti. Hanya pelayan dengan jenis pelayanan yang sesuai akan ditampilkan.
        </div>

        {#if upcoming.length === 0 || ($stQ.data?.data?.length ?? 0) === 0}
          <div class="dt-card">
            <div class="dt-card-pad" style="text-align: center; color: var(--ink-3);">
              {upcoming.length === 0
                ? 'Belum ada kebaktian mendatang.'
                : 'Belum ada jenis pelayanan. Atur dulu di sidebar.'}
            </div>
          </div>
        {:else}
          <div
            class="dt-jadwal-grid"
            style="grid-template-columns: 220px repeat({upcoming.length}, minmax(160px, 1fr));"
          >
            <div class="dt-jadwal-corner">Jenis pelayanan</div>

            {#each upcoming as k (k.id)}
              {@const dm = fmtDayMonth(k.waktu_mulai)}
              {@const filled = ($stQ.data?.data ?? []).filter(
                (st) => edits[k.id]?.[st.id] !== null && edits[k.id]?.[st.id] !== undefined,
              ).length}
              <div class="dt-jadwal-col-head">
                <span class="dt-jadwal-col-date">{dm.day} {dm.month}</span>
                <span class="dt-jadwal-col-name">{k.nama}</span>
                <span class="dt-jadwal-col-meta">
                  {k.pengkhotbah || k.lokasi || ''}{k.pengkhotbah && k.lokasi ? ' · ' : ''}
                  <span
                    style="color: {filled === total
                      ? 'var(--ok)'
                      : filled === 0
                      ? 'oklch(0.55 0.13 70)'
                      : 'var(--accent)'}; font-weight: 600;"
                  >
                    {filled}/{total}
                  </span>
                </span>
              </div>
            {/each}

            {#each $stQ.data?.data ?? [] as st (st.id)}
              <div class="dt-jadwal-row-head">
                <div class="icon"><Icon name={iconForServiceType(st.nama)} size={14} /></div>
                <div>
                  <div style="font-size: 13px; font-weight: 700; color: var(--ink);">{st.nama}</div>
                  {#if st.deskripsi}
                    <div style="font-size: 11px; color: var(--ink-3); font-weight: 500;">{st.deskripsi}</div>
                  {/if}
                </div>
              </div>
              {#each upcoming as k (k.id)}
                {@const pid = edits[k.id]?.[st.id]}
                {@const pelayan = pelayanById(pid)}
                <button
                  type="button"
                  class="dt-jadwal-cell {pelayan ? '' : 'empty'}"
                  onclick={() => (picker = { kebId: k.id, stId: st.id })}
                  style="border: none; text-align: left; font-family: inherit;"
                >
                  {#if pelayan}
                    <Avatar name={pelayan.nama_lengkap} size="xs" />
                    <span class="dt-jadwal-cell-name">{pelayan.nama_lengkap}</span>
                  {:else}
                    <span style="display: flex; align-items: center; gap: 6px;">
                      <span
                        style="width: 24px; height: 24px; border-radius: 7px; background: #fff;
                               display: inline-flex; align-items: center; justify-content: center;"
                      >
                        <Icon name="plus" size={14} />
                      </span>
                      Belum terisi
                    </span>
                  {/if}
                </button>
              {/each}
            {/each}
          </div>

          <div style="margin-top: 20px; display: flex; gap: 16px; font-size: 12px; color: var(--ink-3);">
            <span style="display: inline-flex; align-items: center; gap: 6px;">
              <span style="width: 12px; height: 12px; border-radius: 3px; background: var(--surface); border: 1px solid var(--line);"></span>
              Terisi
            </span>
            <span style="display: inline-flex; align-items: center; gap: 6px;">
              <span
                style="width: 12px; height: 12px; border-radius: 3px;
                       background: color-mix(in oklab, oklch(0.7 0.13 70) 14%, transparent);"
              ></span>
              Belum terisi
            </span>
          </div>
        {/if}
      </DesktopLayout>

      {#if picker}
        <div
          class="dt-dialog-backdrop"
          role="button"
          tabindex="-1"
          onclick={() => { picker = null; pickerQuery = ''; }}
          onkeydown={(e) => e.key === 'Escape' && (picker = null)}
          aria-label="Tutup"
        >
          <div
            class="dt-dialog"
            style="width: 460px;"
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
          >
            <div class="dt-dialog-head">
              <div class="dt-title-block">
                <div class="dt-dialog-title">{pickerService?.nama ?? ''}</div>
                {#if pickerKebaktian}
                  <div class="dt-title-sub" style="font-size: 12px;">
                    {pickerKebaktian.nama} · {fmtMediumID(pickerKebaktian.waktu_mulai)}
                  </div>
                {/if}
              </div>
              <button class="icon-btn" type="button" onclick={() => { picker = null; pickerQuery = ''; }} aria-label="Tutup">
                <Icon name="close" />
              </button>
            </div>
            <div class="dt-dialog-body">
              <div class="dt-search" style="max-width: none; margin-bottom: 12px;">
                <span class="dt-search-icon"><Icon name="search" /></span>
                <input placeholder={`Cari pelayan ${pickerService?.nama ?? ''}…`} bind:value={pickerQuery} />
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                {#if pickerCandidates.length === 0}
                  <div style="padding: 32px; text-align: center; color: var(--ink-3); font-size: 13px;">
                    Tidak ada pelayan yang cocok.
                  </div>
                {/if}
                {#each pickerCandidates as p (p.id)}
                  {@const selected = pickerCurrent === p.id}
                  <button
                    type="button"
                    onclick={() => {
                      setCell(picker!.kebId, picker!.stId, p.id);
                      picker = null;
                      pickerQuery = '';
                    }}
                    style="display: flex; align-items: center; gap: 12px; padding: 10px;
                           background: {selected ? 'var(--accent-soft)' : 'transparent'};
                           border-radius: 9px; text-align: left;"
                  >
                    <Avatar name={p.nama_lengkap} size="sm" />
                    <div style="flex: 1;">
                      <div style="font-size: 13.5px; font-weight: 600; color: var(--ink);">{p.nama_lengkap}</div>
                      <div style="font-size: 11px; color: var(--ink-3);">
                        {(p.service_type_ids ?? []).length} jenis pelayanan
                      </div>
                    </div>
                    {#if selected}<Icon name="check" size={16} />{/if}
                  </button>
                {/each}
              </div>
            </div>
            <div class="dt-dialog-foot">
              {#if pickerCurrent}
                <button
                  class="dt-btn dt-btn-ghost"
                  type="button"
                  onclick={() => {
                    setCell(picker!.kebId, picker!.stId, null);
                    picker = null;
                    pickerQuery = '';
                  }}
                  style="color: var(--danger); margin-right: auto;"
                >
                  <Icon name="cross" size={14} /> Kosongkan slot
                </button>
              {/if}
              <button class="dt-btn dt-btn-ghost" type="button" onclick={() => { picker = null; pickerQuery = ''; }}>
                Batal
              </button>
            </div>
          </div>
        </div>
      {/if}
    {:else}
      <!-- ════════ MOBILE FALLBACK ════════ -->
      <div class="app">
        <TopBar title="Jadwal Master" large />

        <div class="app-scroll" style="padding-bottom: 80px;">
          <div class="empty" style="margin-top: 40px;">
            <div class="empty-icon"><Icon name="grid" /></div>
            <div class="empty-title">Tampilan jadwal master untuk layar besar</div>
            <div class="empty-sub">
              Layar mobile sebaiknya menggunakan halaman <em>Kebaktian</em> dan mengatur slot per kebaktian.
            </div>
            <button class="btn btn-primary" type="button" style="margin-top: 16px;" onclick={() => push('/kebaktian')}>
              Buka Kebaktian
            </button>
          </div>
        </div>

        <BottomNav />
      </div>
    {/if}
  {/snippet}
</ProtectedRoute>
