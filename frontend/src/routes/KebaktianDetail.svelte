<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { kebaktianApi } from '$lib/api/kebaktian';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { push } from 'svelte-spa-router';
  import { fmtFullID, fmtRelativeID } from '$lib/utils/idDate';
  import { viewport } from '$lib/stores/viewport.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';

  let { params } = $props<{ params: { id: string } }>();
  const id = $derived(Number(params.id));

  const kebaktianQ = createQuery(
    toStore(() => ({
      queryKey: ['kebaktian', id],
      queryFn: () => kebaktianApi.get(id),
    })),
  );
  const stQ = createQuery(
    toStore(() => ({
      queryKey: ['service-types'],
      queryFn: () => serviceTypesApi.list(),
    })),
  );
  const jadwalQ = createQuery(
    toStore(() => ({
      queryKey: ['jadwal', id],
      queryFn: () => kebaktianApi.getJadwal(id),
    })),
  );

  const total = $derived($stQ.data?.data?.length ?? 0);
  const filled = $derived(($jadwalQ.data?.data ?? []).filter((s) => s.pelayan_id !== null).length);

  function relativeLabel(utc: string | undefined): string {
    if (!utc) return '';
    return fmtRelativeID(utc);
  }

  function pelayanFor(stId: number) {
    return ($jadwalQ.data?.data ?? []).find((s) => s.service_type_id === stId) ?? null;
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

  function back() {
    history.length > 1 ? history.back() : push('/kebaktian');
  }
</script>

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <DesktopLayout
        title={$kebaktianQ.data?.nama ?? 'Kebaktian'}
        subtitle={$kebaktianQ.data ? fmtFullID($kebaktianQ.data.waktu_mulai) : ''}
      >
        {#snippet actions()}
          <button class="dt-btn dt-btn-outline" type="button" onclick={() => push('/kebaktian')}>
            <Icon name="back" size={16} /> Ke daftar
          </button>
          <button class="dt-btn dt-btn-primary" type="button" onclick={() => push(`/kebaktian/${id}/jadwal`)}>
            <Icon name="edit" size={16} /> Atur jadwal
          </button>
        {/snippet}

        <div style="max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px;">
          {#if $kebaktianQ.isLoading}
            <div class="dt-card dt-card-pad" style="color: var(--ink-3);">Memuat…</div>
          {:else if !$kebaktianQ.data}
            <div class="dt-card dt-card-pad" style="color: var(--ink-3);">Kebaktian tidak ditemukan.</div>
          {:else}
            {@const k = $kebaktianQ.data}
            <div class="dt-card">
              <div class="dt-card-pad" style="display: flex; flex-direction: column; gap: 4px;">
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: var(--accent-ink); text-transform: uppercase;">
                  {relativeLabel(k.waktu_mulai)}
                </div>
                <div style="font-size: 14px; color: var(--ink-2);">Lokasi: {k.lokasi || '—'}</div>
                {#if k.tema}
                  <div style="font-size: 14px; color: var(--ink-2); font-style: italic;">&ldquo;{k.tema}&rdquo;</div>
                {/if}
                {#if k.pengkhotbah}
                  <div style="font-size: 14px; color: var(--ink-2);">Pengkhotbah: {k.pengkhotbah}</div>
                {/if}
              </div>
            </div>

            <div class="dt-card">
              <div class="dt-card-head">
                <span class="dt-card-title">Jadwal pelayanan · {filled}/{total}</span>
                <button class="dt-card-action" type="button" onclick={() => push(`/kebaktian/${id}/jadwal`)}>
                  Edit →
                </button>
              </div>
              {#each $stQ.data?.data ?? [] as st (st.id)}
                {@const slot = pelayanFor(st.id)}
                <div class="dt-pagerow">
                  <div
                    style="width: 36px; height: 36px; border-radius: 10px;
                           background: {slot?.pelayan_id ? 'var(--accent-soft)' : 'var(--surface-2)'};
                           color: {slot?.pelayan_id ? 'var(--accent-ink)' : 'var(--ink-3)'};
                           display: flex; align-items: center; justify-content: center;"
                  >
                    <Icon name={iconForServiceType(st.nama)} size={16} />
                  </div>
                  <div style="flex: 1;">
                    <div style="font-size: 12px; color: var(--ink-3); font-weight: 600;">{st.nama}</div>
                    {#if slot?.pelayan_id && slot.pelayan_nama_lengkap}
                      <div style="font-size: 15px; font-weight: 600; color: var(--ink);">{slot.pelayan_nama_lengkap}</div>
                    {:else}
                      <div style="font-size: 14px; color: var(--ink-3); font-style: italic;">Belum terisi</div>
                    {/if}
                  </div>
                  {#if slot?.pelayan_nama_lengkap}
                    <Avatar name={slot.pelayan_nama_lengkap} size="sm" />
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </DesktopLayout>
    {:else}
    <div class="app">
      <TopBar>
        {#snippet leading()}
          <button class="icon-btn" type="button" onclick={back} aria-label="Kembali"><Icon name="back" /></button>
        {/snippet}
        {#snippet trailing()}
          <button class="icon-btn" type="button" aria-label="Ubah"><Icon name="edit" /></button>
          <button class="icon-btn" type="button" aria-label="Lainnya"><Icon name="more" /></button>
        {/snippet}
      </TopBar>

      <div class="app-scroll">
        {#if $kebaktianQ.isLoading}
          <div class="empty"><div class="empty-title">Memuat…</div></div>
        {:else if !$kebaktianQ.data}
          <div class="empty">
            <div class="empty-icon"><Icon name="calendar" /></div>
            <div class="empty-title">Tidak dapat memuat kebaktian</div>
          </div>
        {:else}
          {@const k = $kebaktianQ.data}
          <div style="padding: 0 20px 16px;">
            <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; color: var(--accent-ink); text-transform: uppercase;">
              {relativeLabel(k.waktu_mulai)}
            </div>
            <h1 style="margin: 4px 0 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: var(--ink);">
              {k.nama}
            </h1>
            <div style="font-size: 14px; color: var(--ink-2); margin-top: 6px;">
              {fmtFullID(k.waktu_mulai)}
            </div>
          </div>

          <div style="padding: 0 16px;">
            <div class="card" style="padding: 4px 0;">
              <div style="display: flex; gap: 12px; padding: 12px 14px; align-items: center;">
                <div style="color: var(--ink-3); width: 18px; display: flex; justify-content: center;"><Icon name="map" size={16} /></div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 12px; color: var(--ink-3); font-weight: 500;">Lokasi</div>
                  <div style="font-size: 14px; color: var(--ink); font-weight: 500;">{k.lokasi || '—'}</div>
                </div>
              </div>
              {#if k.tema}
                <div style="height: 1px; background: var(--line); margin-left: 44px;"></div>
                <div style="display: flex; gap: 12px; padding: 12px 14px; align-items: center;">
                  <div style="color: var(--ink-3); width: 18px; display: flex; justify-content: center;"><Icon name="sparkle" size={16} /></div>
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 12px; color: var(--ink-3); font-weight: 500;">Tema</div>
                    <div style="font-size: 14px; color: var(--ink); font-weight: 500;">{k.tema}</div>
                  </div>
                </div>
              {/if}
              {#if k.pengkhotbah}
                <div style="height: 1px; background: var(--line); margin-left: 44px;"></div>
                <div style="display: flex; gap: 12px; padding: 12px 14px; align-items: center;">
                  <div style="color: var(--ink-3); width: 18px; display: flex; justify-content: center;"><Icon name="mic" size={16} /></div>
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 12px; color: var(--ink-3); font-weight: 500;">Pengkhotbah</div>
                    <div style="font-size: 14px; color: var(--ink); font-weight: 500;">{k.pengkhotbah}</div>
                  </div>
                </div>
              {/if}
            </div>
          </div>

          <div class="section-h">
            <span class="t">Jadwal pelayanan · {filled}/{total}</span>
            <button class="link" type="button" onclick={() => push(`/kebaktian/${id}/jadwal`)}>Edit</button>
          </div>
          <div class="list">
            {#if $stQ.data?.data?.length === 0}
              <div class="empty">
                <div class="empty-icon"><Icon name="tag" /></div>
                <div class="empty-title">Belum ada jenis pelayanan</div>
                <div class="empty-sub">Atur dulu di Lainnya → Jenis pelayanan.</div>
              </div>
            {:else}
              {#each $stQ.data?.data ?? [] as st (st.id)}
                {@const slot = pelayanFor(st.id)}
                <div class="row" style="min-height: 56px;">
                  <div
                    style="width: 36px; height: 36px; border-radius: 10px;
                           background: {slot?.pelayan_id ? 'var(--accent-soft)' : 'var(--surface-2)'};
                           color: {slot?.pelayan_id ? 'var(--accent-ink)' : 'var(--ink-3)'};
                           display: flex; align-items: center; justify-content: center;"
                  >
                    <Icon name={iconForServiceType(st.nama)} size={16} />
                  </div>
                  <div class="row-body">
                    <div style="font-size: 12px; color: var(--ink-3); font-weight: 600;">{st.nama}</div>
                    {#if slot?.pelayan_id && slot.pelayan_nama_lengkap}
                      <div style="font-size: 15px; font-weight: 600; color: var(--ink);">
                        {slot.pelayan_nama_lengkap}
                      </div>
                    {:else}
                      <div style="font-size: 14px; color: var(--ink-3); font-style: italic;">
                        Belum terisi
                      </div>
                    {/if}
                  </div>
                  {#if slot?.pelayan_nama_lengkap}
                    <Avatar name={slot.pelayan_nama_lengkap} size="sm" />
                  {/if}
                </div>
              {/each}
            {/if}
          </div>

          <div style="padding: 12px 16px 24px;">
            <button class="btn btn-primary btn-block" type="button" onclick={() => push(`/kebaktian/${id}/jadwal`)}>
              <Icon name="edit" size={16} /> Edit jadwal
            </button>
          </div>
        {/if}
      </div>
    </div>
    {/if}
  {/snippet}
</ProtectedRoute>
