<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { kebaktianApi, type JadwalSlotWrite } from '$lib/api/kebaktian';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { pelayanApi } from '$lib/api/pelayan';
  import { ApiError } from '$lib/api/client';
  import { push } from 'svelte-spa-router';
  import { fmtFullID } from '$lib/utils/idDate';
  import { toast } from '$lib/stores/toast.svelte';
  import { viewport } from '$lib/stores/viewport.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';

  let { params } = $props<{ params: { id: string } }>();
  const kebaktianID = $derived(Number(params.id));
  const qc = useQueryClient();

  const kebaktianQ = createQuery(
    toStore(() => ({
      queryKey: ['kebaktian', kebaktianID],
      queryFn: () => kebaktianApi.get(kebaktianID),
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
  const jadwalQ = createQuery(
    toStore(() => ({
      queryKey: ['jadwal', kebaktianID],
      queryFn: () => kebaktianApi.getJadwal(kebaktianID),
    })),
  );

  let slots = $state<Record<number, number | null>>({});

  $effect(() => {
    const sts = $stQ.data?.data ?? [];
    const existing = $jadwalQ.data?.data ?? [];
    if (sts.length === 0) return;
    const next: Record<number, number | null> = {};
    for (const st of sts) {
      const ex = existing.find((j) => j.service_type_id === st.id);
      next[st.id] = ex?.pelayan_id ?? null;
    }
    slots = next;
  });

  let picking = $state<number | null>(null);
  let pickerQuery = $state('');

  function pelayanForService(stId: number) {
    return ($pelayanQ.data?.data ?? []).filter((p) => p.service_type_ids?.includes(stId));
  }

  function pelayanById(id: number | null) {
    if (!id) return null;
    return ($pelayanQ.data?.data ?? []).find((p) => p.id === id) ?? null;
  }

  const total = $derived($stQ.data?.data?.length ?? 0);
  const filled = $derived(Object.values(slots).filter((v) => v !== null && v !== undefined).length);

  const saveMut = createMutation({
    mutationFn: () => {
      const payload: JadwalSlotWrite[] = Object.entries(slots).map(([stID, pid]) => ({
        service_type_id: Number(stID),
        pelayan_id: pid,
        catatan: null,
      }));
      return kebaktianApi.replaceJadwal(kebaktianID, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jadwal', kebaktianID] });
      qc.invalidateQueries({ queryKey: ['kebaktian', 'jadwal-counts'] });
      toast.show('Jadwal tersimpan');
      setTimeout(() => history.length > 1 ? history.back() : push(`/kebaktian/${kebaktianID}`), 400);
    },
    onError: (e) => {
      toast.show(e instanceof ApiError ? e.message : 'Gagal menyimpan');
    },
  });

  function setSlot(stId: number, pId: number) {
    slots = { ...slots, [stId]: pId };
    picking = null;
    pickerQuery = '';
    toast.show('Slot diperbarui');
  }

  function clearSlot(stId: number) {
    slots = { ...slots, [stId]: null };
    picking = null;
    pickerQuery = '';
    toast.show('Slot dikosongkan');
  }

  function back() {
    history.length > 1 ? history.back() : push(`/kebaktian/${kebaktianID}`);
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

  const pickerCandidates = $derived.by(() => {
    if (picking === null) return [];
    const all = pelayanForService(picking);
    if (!pickerQuery) return all;
    const lc = pickerQuery.toLowerCase();
    return all.filter((p) => p.nama_lengkap.toLowerCase().includes(lc));
  });

  const pickerServiceType = $derived(
    picking === null ? null : ($stQ.data?.data ?? []).find((s) => s.id === picking) ?? null,
  );
</script>

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <DesktopLayout
        title="Atur jadwal pelayanan"
        subtitle={$kebaktianQ.data ? `${$kebaktianQ.data.nama} · ${fmtFullID($kebaktianQ.data.waktu_mulai)}` : ''}
      >
        {#snippet actions()}
          <button class="dt-btn dt-btn-ghost" type="button" onclick={back}>
            <Icon name="close" size={16} /> Tutup
          </button>
          <button
            class="dt-btn dt-btn-primary"
            type="button"
            disabled={$saveMut.isPending}
            onclick={() => $saveMut.mutate()}
          >
            {$saveMut.isPending ? 'Menyimpan…' : 'Simpan jadwal'}
          </button>
        {/snippet}

        <div style="max-width: 760px; margin: 0 auto;">
          <div class="dt-card" style="margin-bottom: 18px;">
            <div class="dt-card-pad" style="display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-3); font-weight: 600;">
                <span>Slot terisi</span>
                <span><span style="color: var(--ink); font-weight: 700;">{filled}</span> / {total}</span>
              </div>
              <div style="height: 8px; background: var(--surface-2); border-radius: 4px; overflow: hidden;">
                <div
                  style="height: 100%; width: {total === 0 ? 0 : (filled / total) * 100}%;
                         background: {filled === total && total > 0 ? 'var(--ok)' : 'var(--accent)'};
                         transition: width .25s;"
                ></div>
              </div>
            </div>
          </div>

          <div class="dt-card">
            {#if !$stQ.data || $stQ.data.data.length === 0}
              <div class="dt-card-pad" style="text-align: center; color: var(--ink-3);">
                Belum ada jenis pelayanan.
              </div>
            {:else}
              {#each $stQ.data.data as st (st.id)}
                {@const pid = slots[st.id]}
                {@const pelayan = pelayanById(pid ?? null)}
                {@const eligible = pelayanForService(st.id).length}
                <button
                  class="dt-pagerow hover"
                  type="button"
                  onclick={() => (picking = st.id)}
                  style="background: {pelayan ? 'none' : 'color-mix(in oklab, oklch(0.7 0.13 70) 7%, transparent)'};
                         border: none; width: 100%; text-align: left;"
                >
                  <div
                    style="width: 38px; height: 38px; border-radius: 11px;
                           background: {pelayan ? 'var(--accent-soft)' : '#fff'};
                           color: {pelayan ? 'var(--accent-ink)' : 'oklch(0.55 0.13 70)'};
                           display: flex; align-items: center; justify-content: center; flex-shrink: 0;"
                  >
                    <Icon name={iconForServiceType(st.nama)} size={18} />
                  </div>
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 12px; color: var(--ink-3); font-weight: 600;">{st.nama}</div>
                    {#if pelayan}
                      <div style="font-size: 14px; font-weight: 600; color: var(--ink); display: flex; align-items: center; gap: 8px;">
                        <Avatar name={pelayan.nama_lengkap} size="xs" />
                        {pelayan.nama_lengkap}
                      </div>
                    {:else}
                      <div style="font-size: 13px; color: oklch(0.45 0.1 70); font-weight: 500;">
                        Belum terisi · {eligible} pelayan tersedia
                      </div>
                    {/if}
                  </div>
                  <Icon name="chevron" />
                </button>
              {/each}
            {/if}
          </div>
        </div>
      </DesktopLayout>

      {#if picking !== null}
        <div
          class="dt-dialog-backdrop"
          role="button"
          tabindex="-1"
          onclick={() => { picking = null; pickerQuery = ''; }}
          onkeydown={(e) => e.key === 'Escape' && (picking = null)}
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
                <div class="dt-dialog-title">{pickerServiceType?.nama ?? ''}</div>
                {#if $kebaktianQ.data}
                  <div class="dt-title-sub" style="font-size: 12px;">
                    {$kebaktianQ.data.nama} · {fmtFullID($kebaktianQ.data.waktu_mulai)}
                  </div>
                {/if}
              </div>
              <button class="icon-btn" type="button" onclick={() => { picking = null; pickerQuery = ''; }} aria-label="Tutup">
                <Icon name="close" />
              </button>
            </div>
            <div class="dt-dialog-body">
              <div class="dt-search" style="max-width: none; margin-bottom: 12px;">
                <span class="dt-search-icon"><Icon name="search" /></span>
                <input placeholder={`Cari pelayan ${pickerServiceType?.nama ?? ''}…`} bind:value={pickerQuery} />
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                {#if pickerCandidates.length === 0}
                  <div style="padding: 32px; text-align: center; color: var(--ink-3); font-size: 13px;">
                    Tidak ada pelayan yang cocok.
                  </div>
                {/if}
                {#each pickerCandidates as p (p.id)}
                  {@const selected = picking !== null && slots[picking] === p.id}
                  <button
                    type="button"
                    onclick={() => setSlot(picking!, p.id)}
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
              {#if picking !== null && slots[picking] !== null && slots[picking] !== undefined}
                <button
                  class="dt-btn dt-btn-ghost"
                  type="button"
                  onclick={() => clearSlot(picking!)}
                  style="color: var(--danger); margin-right: auto;"
                >
                  <Icon name="cross" size={14} /> Kosongkan slot
                </button>
              {/if}
              <button class="dt-btn dt-btn-ghost" type="button" onclick={() => { picking = null; pickerQuery = ''; }}>
                Batal
              </button>
            </div>
          </div>
        </div>
      {/if}
    {:else}
    <div class="app">
      <TopBar title="Atur jadwal">
        {#snippet leading()}
          <button class="icon-btn" type="button" onclick={back} aria-label="Tutup"><Icon name="close" /></button>
        {/snippet}
        {#snippet trailing()}
          <button
            class="btn btn-xs btn-primary"
            type="button"
            style="margin-right: 6px;"
            disabled={$saveMut.isPending}
            onclick={() => $saveMut.mutate()}
          >
            {$saveMut.isPending ? '…' : 'Simpan'}
          </button>
        {/snippet}
      </TopBar>

      <div class="app-scroll">
        {#if $kebaktianQ.data}
          <div style="padding: 0 18px 12px;">
            <div style="font-size: 13px; color: var(--ink-3);">
              {fmtFullID($kebaktianQ.data.waktu_mulai)}
            </div>
            <div style="font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); margin-top: 2px;">
              {$kebaktianQ.data.nama}
            </div>

            <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-3); font-weight: 600;">
                <span>Slot terisi</span>
                <span><span style="color: var(--ink); font-weight: 700;">{filled}</span> / {total}</span>
              </div>
              <div style="height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden;">
                <div
                  style="height: 100%; width: {total === 0 ? 0 : (filled / total) * 100}%;
                         background: {filled === total && total > 0 ? 'var(--ok)' : 'var(--accent)'};
                         transition: width .25s;"
                ></div>
              </div>
            </div>
          </div>
        {/if}

        <div class="list">
          {#if !$stQ.data || $stQ.data.data.length === 0}
            <div class="empty">
              <div class="empty-icon"><Icon name="tag" /></div>
              <div class="empty-title">Belum ada jenis pelayanan</div>
              <div class="empty-sub">Atur dulu di Lainnya → Jenis pelayanan.</div>
            </div>
          {:else}
            {#each $stQ.data.data as st (st.id)}
              {@const pid = slots[st.id]}
              {@const pelayan = pelayanById(pid ?? null)}
              {@const eligible = pelayanForService(st.id).length}
              <button
                class="row row-tap"
                type="button"
                onclick={() => (picking = st.id)}
                style="align-items: center; min-height: 64px;
                       background: {pelayan ? 'var(--surface)' : 'var(--warn-soft)'};
                       border-color: {pelayan ? 'var(--line)' : 'transparent'};"
              >
                <div
                  style="width: 38px; height: 38px; border-radius: 11px;
                         background: {pelayan ? 'var(--accent-soft)' : '#fff'};
                         color: {pelayan ? 'var(--accent-ink)' : 'oklch(0.55 0.13 70)'};
                         display: flex; align-items: center; justify-content: center;"
                >
                  <Icon name={iconForServiceType(st.nama)} size={18} />
                </div>
                <div class="row-body">
                  <div style="font-size: 12px; color: var(--ink-3); font-weight: 600;">{st.nama}</div>
                  {#if pelayan}
                    <div style="font-size: 15px; font-weight: 600; color: var(--ink); display: flex; align-items: center; gap: 8px;">
                      <Avatar name={pelayan.nama_lengkap} size="xs" />
                      {pelayan.nama_lengkap}
                    </div>
                  {:else}
                    <div style="font-size: 14px; color: oklch(0.45 0.1 70); font-weight: 500;">
                      Belum terisi · {eligible} pelayan tersedia
                    </div>
                  {/if}
                </div>
                <Icon name="chevron" />
              </button>
            {/each}
          {/if}
        </div>

        <div
          style="padding: 0 18px 24px; font-size: 12px; color: var(--ink-3);
                 display: flex; align-items: flex-start; gap: 8px;"
        >
          <span
            style="display: inline-flex; align-items: center; justify-content: center;
                   width: 16px; height: 16px; border-radius: 999px; background: var(--surface-2);
                   color: var(--ink-2); font-weight: 700; flex-shrink: 0;"
          >
            i
          </span>
          Hanya menampilkan pelayan dengan jenis pelayanan yang sesuai. Tekan slot untuk ganti atau kosongkan.
        </div>
      </div>

      <Sheet
        open={picking !== null}
        onClose={() => {
          picking = null;
          pickerQuery = '';
        }}
        title={pickerServiceType ? `Pilih: ${pickerServiceType.nama}` : 'Pilih pelayan'}
      >
        <input class="input" placeholder="Cari pelayan…" bind:value={pickerQuery} style="margin-bottom: 12px;" />
        <div style="display: flex; flex-direction: column; gap: 6px;">
          {#if pickerCandidates.length === 0}
            <div class="empty" style="padding: 32px;">
              <div class="empty-icon"><Icon name="person" /></div>
              <div class="empty-title">Tidak ada pelayan</div>
              <div class="empty-sub">
                Belum ada jemaat yang melayani sebagai {pickerServiceType?.nama ?? ''}.
              </div>
            </div>
          {:else}
            {#each pickerCandidates as p (p.id)}
              {@const selected = picking !== null && slots[picking] === p.id}
              <button
                type="button"
                onclick={() => setSlot(picking!, p.id)}
                style="display: flex; align-items: center; gap: 12px; padding: 12px;
                       background: {selected ? 'var(--accent-soft)' : 'var(--surface)'};
                       border: 1px solid {selected ? 'transparent' : 'var(--line)'};
                       border-radius: 12px; text-align: left;"
              >
                <Avatar name={p.nama_lengkap} size="sm" />
                <div style="flex: 1;">
                  <div style="font-size: 14px; font-weight: 600; color: var(--ink);">{p.nama_lengkap}</div>
                  <div style="font-size: 12px; color: var(--ink-3);">
                    {(p.service_type_ids ?? []).length} jenis pelayanan
                  </div>
                </div>
                {#if selected}<Icon name="check" size={20} />{/if}
              </button>
            {/each}
          {/if}
        </div>

        {#snippet footer()}
          {#if picking !== null && slots[picking] !== null && slots[picking] !== undefined}
            <button class="btn btn-danger btn-block" type="button" onclick={() => clearSlot(picking!)}>
              <Icon name="cross" size={16} /> Kosongkan slot
            </button>
          {:else}
            <button class="btn btn-ghost btn-block" type="button" onclick={() => { picking = null; pickerQuery = ''; }}>
              Batal
            </button>
          {/if}
        {/snippet}
      </Sheet>
    </div>
    {/if}
  {/snippet}
</ProtectedRoute>
