<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { keluargaApi } from '$lib/api/keluarga';
  import { push } from 'svelte-spa-router';
  import { ageFromIso, genderLabel } from '$lib/utils/format';
  import { viewport } from '$lib/stores/viewport.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';

  let { params } = $props<{ params: { id: string } }>();
  const id = $derived(Number(params.id));

  const q = createQuery(
    toStore(() => ({
      queryKey: ['keluarga', id],
      queryFn: () => keluargaApi.get(id),
    })),
  );

  function back() {
    history.length > 1 ? history.back() : push('/keluarga');
  }
</script>

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <DesktopLayout
        title={$q.data?.keluarga.nama_keluarga ?? 'Keluarga'}
        subtitle={$q.data?.keluarga.alamat ?? ''}
      >
        {#snippet actions()}
          <button class="dt-btn dt-btn-outline" type="button" onclick={() => push('/keluarga')}>
            <Icon name="back" size={16} /> Ke daftar
          </button>
        {/snippet}

        <div style="max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px;">
          {#if $q.isLoading}
            <div class="dt-card dt-card-pad" style="color: var(--ink-3);">Memuat…</div>
          {:else if !$q.data}
            <div class="dt-card dt-card-pad" style="color: var(--ink-3);">Keluarga tidak ditemukan.</div>
          {:else}
            {@const k = $q.data.keluarga}
            {@const members = $q.data.members}

            <div class="dt-card">
              <div class="dt-card-head">
                <span class="dt-card-title">Anggota · {members.length}</span>
              </div>
              {#if members.length === 0}
                <div class="dt-card-pad" style="color: var(--ink-3);">Belum ada anggota.</div>
              {:else}
                {#each members as m (m.id)}
                  {@const age = ageFromIso(m.tanggal_lahir)}
                  <button
                    class="dt-pagerow hover"
                    type="button"
                    onclick={() => push(`/jemaat/${m.id}`)}
                    style="background: none; border: none; text-align: left; width: 100%;"
                  >
                    <Avatar name={m.nama_lengkap} size="sm" />
                    <div style="flex: 1;">
                      <div style="font-size: 14px; font-weight: 600; color: var(--ink);">{m.nama_lengkap}</div>
                      <div style="font-size: 12px; color: var(--ink-3);">
                        {age != null ? `${age} thn · ` : ''}{genderLabel(m.jenis_kelamin)}
                      </div>
                    </div>
                    <Icon name="chevron" />
                  </button>
                {/each}
              {/if}
            </div>

            {#if k.catatan}
              <div class="dt-card">
                <div class="dt-card-head"><span class="dt-card-title">Catatan</span></div>
                <div class="dt-card-pad" style="font-size: 13px; color: var(--ink-2); white-space: pre-wrap;">
                  {k.catatan}
                </div>
              </div>
            {/if}
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
          {/snippet}
        </TopBar>

        <div class="app-scroll">
          {#if $q.isLoading}
            <div class="empty"><div class="empty-title">Memuat…</div></div>
          {:else if !$q.data}
            <div class="empty">
              <div class="empty-icon"><Icon name="home2" /></div>
              <div class="empty-title">Keluarga tidak ditemukan</div>
            </div>
          {:else}
            {@const k = $q.data.keluarga}
            {@const members = $q.data.members}

            <div style="padding: 0 20px 16px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <div
                style="width: 64px; height: 64px; border-radius: 18px;
                       background: var(--accent-soft); color: var(--accent-ink);
                       display: flex; align-items: center; justify-content: center;"
              >
                <Icon name="home2" size={28} />
              </div>
              <div style="text-align: center;">
                <div style="font-size: 22px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em;">
                  {k.nama_keluarga}
                </div>
                {#if k.alamat}
                  <div style="font-size: 13px; color: var(--ink-3); margin-top: 2px;">{k.alamat}</div>
                {/if}
              </div>
            </div>

            <div class="section-h">
              <span class="t">Anggota · {members.length}</span>
            </div>
            <div class="list">
              {#if members.length === 0}
                <div class="empty">
                  <div class="empty-icon"><Icon name="users" /></div>
                  <div class="empty-title">Belum ada anggota</div>
                  <div class="empty-sub">Hubungkan jemaat ke keluarga ini dari halaman jemaat.</div>
                </div>
              {:else}
                {#each members as m (m.id)}
                  {@const age = ageFromIso(m.tanggal_lahir)}
                  <button class="row row-tap" type="button" onclick={() => push(`/jemaat/${m.id}`)}>
                    <Avatar name={m.nama_lengkap} />
                    <div class="row-body">
                      <div class="row-title">{m.nama_lengkap}</div>
                      <div class="row-sub">
                        {age != null ? `${age} thn · ` : ''}{genderLabel(m.jenis_kelamin)}
                      </div>
                    </div>
                    <Icon name="chevron" />
                  </button>
                {/each}
              {/if}
            </div>

            {#if k.catatan}
              <div class="section-h"><span class="t">Catatan</span></div>
              <div style="padding: 0 16px 24px;">
                <div class="card" style="padding: 14px; font-size: 14px; color: var(--ink-2); white-space: pre-wrap;">
                  {k.catatan}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  {/snippet}
</ProtectedRoute>
