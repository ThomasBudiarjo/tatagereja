<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { jemaatApi } from '$lib/api/jemaat';
  import { keluargaApi } from '$lib/api/keluarga';
  import { pelayanApi } from '$lib/api/pelayan';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { push } from 'svelte-spa-router';
  import { formatDateID, ageFromIso, maritalStatusLabel, genderLabel } from '$lib/utils/format';
  import { toast } from '$lib/stores/toast.svelte';
  import { viewport } from '$lib/stores/viewport.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';

  let { params } = $props<{ params: { id: string } }>();
  const id = $derived(Number(params.id));

  const q = createQuery(
    toStore(() => ({
      queryKey: ['jemaat', id],
      queryFn: () => jemaatApi.get(id),
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

  const pelayanRecord = $derived(($pelayanQ.data?.data ?? []).find((p) => p.jemaat_id === id) ?? null);
  const isPelayan = $derived(pelayanRecord !== null);
  const keluarga = $derived.by(() => {
    const kid = $q.data?.keluarga_id;
    if (!kid) return null;
    return $keluargaQ.data?.data.find((k) => k.id === kid) ?? null;
  });
  const services = $derived.by(() => {
    if (!pelayanRecord) return [] as Array<{ id: number; nama: string }>;
    const all = $stQ.data?.data ?? [];
    return (pelayanRecord.service_type_ids ?? [])
      .map((sid) => all.find((s) => s.id === sid))
      .filter((x): x is { id: number; nama: string; deskripsi: string | null; urutan: number; created_at: string; updated_at: string; user_id: number } => !!x);
  });

  function back() {
    history.length > 1 ? history.back() : push('/jemaat');
  }
</script>

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <DesktopLayout title={$q.data?.nama_lengkap ?? 'Profil jemaat'} subtitle={$q.data?.nama_panggilan ? `Panggilan: ${$q.data.nama_panggilan}` : ''}>
        {#snippet actions()}
          <button class="dt-btn dt-btn-outline" type="button" onclick={() => push('/jemaat')}>
            <Icon name="back" size={16} /> Ke daftar
          </button>
        {/snippet}
        <div style="max-width: 760px; margin: 0 auto;">
          <div class="dt-card">
            {#if $q.isLoading}
              <div class="dt-card-pad" style="color: var(--ink-3);">Memuat…</div>
            {:else if !$q.data}
              <div class="dt-card-pad" style="color: var(--ink-3);">Jemaat tidak ditemukan.</div>
            {:else}
              {@const j = $q.data}
              {@const age = ageFromIso(j.tanggal_lahir)}
              <div class="dt-detail-head">
                <Avatar name={j.nama_lengkap} size="lg" />
                <div>
                  <div style="font-size: 20px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em;">
                    {j.nama_lengkap}
                  </div>
                  {#if j.nama_panggilan}
                    <div style="font-size: 13px; color: var(--ink-3);">Panggilan: {j.nama_panggilan}</div>
                  {/if}
                </div>
                <div class="hstack" style="flex-wrap: wrap; justify-content: center;">
                  {#if isPelayan}<span class="chip chip-accent dt-chip-sm">Pelayan</span>{/if}
                  {#if j.jenis_kelamin}<span class="chip dt-chip-sm">{genderLabel(j.jenis_kelamin)}</span>{/if}
                  {#if age != null}<span class="chip dt-chip-sm">{age} tahun</span>{/if}
                  {#if j.status_pernikahan}<span class="chip dt-chip-sm">{maritalStatusLabel(j.status_pernikahan)}</span>{/if}
                </div>
              </div>

              <div class="dt-detail-body">
                <div class="dt-detail-section">
                  <div class="t">Kontak</div>
                  <div class="dt-detail-row"><span class="lab">Telepon</span><span class="val mono">{j.nomor_telepon || '—'}</span></div>
                  <div class="dt-detail-row"><span class="lab">Email</span><span class="val">{j.email || '—'}</span></div>
                  <div class="dt-detail-row"><span class="lab">Alamat</span><span class="val">{j.alamat || '—'}</span></div>
                </div>
                <div class="dt-detail-section">
                  <div class="t">Rohani</div>
                  <div class="dt-detail-row"><span class="lab">Lahir</span><span class="val">{formatDateID(j.tanggal_lahir)}</span></div>
                  <div class="dt-detail-row"><span class="lab">Baptis</span><span class="val">{formatDateID(j.tanggal_baptis)}</span></div>
                  <div class="dt-detail-row"><span class="lab">Sidi</span><span class="val">{formatDateID(j.tanggal_sidi)}</span></div>
                </div>
                {#if keluarga}
                  <div class="dt-detail-section">
                    <div class="t">Keluarga</div>
                    <button
                      class="dt-pagerow hover"
                      type="button"
                      onclick={() => push(`/keluarga/${keluarga.id}`)}
                      style="background: none; border: none; text-align: left; width: 100%;"
                    >
                      <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--accent-soft); color: var(--accent-ink); display: flex; align-items: center; justify-content: center;">
                        <Icon name="home2" size={18} />
                      </div>
                      <div style="flex: 1;">
                        <div style="font-weight: 700; color: var(--ink);">{keluarga.nama_keluarga}</div>
                        <div style="font-size: 12px; color: var(--ink-3);">{keluarga.alamat ?? ''}</div>
                      </div>
                      <Icon name="chevron" />
                    </button>
                  </div>
                {/if}
                {#if isPelayan && services.length > 0}
                  <div class="dt-detail-section">
                    <div class="t">Pelayanan</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                      {#each services as st (st.id)}
                        <span class="chip chip-accent dt-chip-sm">{st.nama}</span>
                      {/each}
                    </div>
                  </div>
                {/if}
                {#if j.catatan}
                  <div class="dt-detail-section">
                    <div class="t">Catatan</div>
                    <div style="font-size: 13px; color: var(--ink-2); white-space: pre-wrap;">{j.catatan}</div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </DesktopLayout>
    {:else}
    <div class="app">
      <TopBar scrolled>
        {#snippet leading()}
          <button class="icon-btn" type="button" onclick={back} aria-label="Kembali"><Icon name="back" /></button>
        {/snippet}
        {#snippet trailing()}
          <button class="icon-btn" type="button" aria-label="Ubah"><Icon name="edit" /></button>
          <button class="icon-btn" type="button" aria-label="Lainnya"><Icon name="more" /></button>
        {/snippet}
      </TopBar>

      <div class="app-scroll">
        {#if $q.isLoading}
          <div class="empty"><div class="empty-title">Memuat…</div></div>
        {:else if $q.error || !$q.data}
          <div class="empty">
            <div class="empty-icon"><Icon name="person" /></div>
            <div class="empty-title">Tidak dapat memuat jemaat</div>
          </div>
        {:else}
          {@const j = $q.data}
          {@const age = ageFromIso(j.tanggal_lahir)}
          <div style="padding: 8px 20px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
            <Avatar name={j.nama_lengkap} size="lg" />
            <div style="text-align: center;">
              <div style="font-size: 22px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em;">
                {j.nama_lengkap}
              </div>
              {#if j.nama_panggilan}
                <div style="font-size: 13px; color: var(--ink-3); margin-top: 2px;">
                  Panggilan: {j.nama_panggilan}
                </div>
              {/if}
            </div>
            <div class="hstack" style="flex-wrap: wrap; justify-content: center;">
              {#if isPelayan}<span class="chip chip-accent">Pelayan</span>{/if}
              {#if j.jenis_kelamin}<span class="chip">{genderLabel(j.jenis_kelamin)}</span>{/if}
              {#if age != null}<span class="chip">{age} tahun</span>{/if}
              {#if j.status_pernikahan}<span class="chip">{maritalStatusLabel(j.status_pernikahan)}</span>{/if}
            </div>
          </div>

          <!-- Quick contact actions -->
          <div style="padding: 0 16px 8px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
            <button
              class="card-tap"
              type="button"
              style="padding: 12px 8px; background: var(--surface); border-radius: 14px; border: 1px solid var(--line);
                     display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--ink-2);"
              onclick={() => {
                if (j.nomor_telepon) location.href = `tel:${j.nomor_telepon}`;
                else toast.show('Nomor telepon belum diisi');
              }}
            >
              <Icon name="phone" size={20} />
              <span style="font-size: 12px; font-weight: 600;">Telepon</span>
            </button>
            <button
              class="card-tap"
              type="button"
              style="padding: 12px 8px; background: var(--surface); border-radius: 14px; border: 1px solid var(--line);
                     display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--ink-2);"
              onclick={() => {
                if (j.nomor_telepon) {
                  const cleaned = j.nomor_telepon.replace(/\D/g, '').replace(/^0/, '62');
                  window.open(`https://wa.me/${cleaned}`, '_blank');
                } else toast.show('Nomor WhatsApp belum diisi');
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.4 3.3 1.2 4.7L2 22l5.5-1.2c1.4.7 3 1.2 4.5 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z" fill-opacity="0.2" />
                <path d="M16.8 14.5c-.3-.1-1.5-.7-1.8-.8-.2-.1-.4-.1-.5.1-.2.2-.6.7-.7.9-.1.1-.3.2-.5.1-.3-.1-1-.4-2-1.2-.7-.7-1.2-1.5-1.3-1.7-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.2-.4 0-.2 0-.3-.1-.4l-.6-1.5c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4 0-.7.3-.2.3-.9.9-.9 2.1 0 1.2.9 2.4 1 2.6.1.2 1.7 2.7 4.2 3.7.6.3 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3z" fill-opacity="0.7" />
              </svg>
              <span style="font-size: 12px; font-weight: 600;">WhatsApp</span>
            </button>
            <button
              class="card-tap"
              type="button"
              style="padding: 12px 8px; background: var(--surface); border-radius: 14px; border: 1px solid var(--line);
                     display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--ink-2);"
              onclick={() => {
                if (j.email) location.href = `mailto:${j.email}`;
                else toast.show('Email belum diisi');
              }}
            >
              <Icon name="mail" size={20} />
              <span style="font-size: 12px; font-weight: 600;">Email</span>
            </button>
          </div>

          <div class="section-h"><span class="t">Kontak</span></div>
          <div style="padding: 0 16px;">
            <div class="card" style="padding: 4px 0;">
              <div style="display: flex; gap: 12px; padding: 12px 14px; align-items: center;">
                <div style="color: var(--ink-3); width: 18px; display: flex; justify-content: center;"><Icon name="phone" size={16} /></div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 12px; color: var(--ink-3); font-weight: 500;">Telepon</div>
                  <div class="mono" style="font-size: 14px; color: var(--ink); font-weight: 500;">{j.nomor_telepon || '—'}</div>
                </div>
              </div>
              <div style="height: 1px; background: var(--line); margin-left: 44px;"></div>
              <div style="display: flex; gap: 12px; padding: 12px 14px; align-items: center;">
                <div style="color: var(--ink-3); width: 18px; display: flex; justify-content: center;"><Icon name="mail" size={16} /></div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 12px; color: var(--ink-3); font-weight: 500;">Email</div>
                  <div style="font-size: 14px; color: var(--ink); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    {j.email || '—'}
                  </div>
                </div>
              </div>
              <div style="height: 1px; background: var(--line); margin-left: 44px;"></div>
              <div style="display: flex; gap: 12px; padding: 12px 14px; align-items: flex-start;">
                <div style="color: var(--ink-3); width: 18px; display: flex; justify-content: center; margin-top: 2px;"><Icon name="map" size={16} /></div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 12px; color: var(--ink-3); font-weight: 500;">Alamat</div>
                  <div style="font-size: 14px; color: var(--ink); font-weight: 500; white-space: normal;">
                    {j.alamat || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="section-h"><span class="t">Rohani</span></div>
          <div style="padding: 0 16px;">
            <div class="card" style="padding: 4px 0;">
              <div style="display: flex; gap: 12px; padding: 12px 14px; align-items: center;">
                <div style="color: var(--ink-3); width: 18px; display: flex; justify-content: center;"><Icon name="cake" size={16} /></div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 12px; color: var(--ink-3); font-weight: 500;">Tanggal lahir</div>
                  <div style="font-size: 14px; color: var(--ink); font-weight: 500;">{formatDateID(j.tanggal_lahir)}</div>
                </div>
              </div>
              <div style="height: 1px; background: var(--line); margin-left: 44px;"></div>
              <div style="display: flex; gap: 12px; padding: 12px 14px; align-items: center;">
                <div style="color: var(--ink-3); width: 18px; display: flex; justify-content: center;"><Icon name="sparkle" size={16} /></div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 12px; color: var(--ink-3); font-weight: 500;">Baptis</div>
                  <div style="font-size: 14px; color: var(--ink); font-weight: 500;">{formatDateID(j.tanggal_baptis)}</div>
                </div>
              </div>
              <div style="height: 1px; background: var(--line); margin-left: 44px;"></div>
              <div style="display: flex; gap: 12px; padding: 12px 14px; align-items: center;">
                <div style="color: var(--ink-3); width: 18px; display: flex; justify-content: center;"><Icon name="sparkle" size={16} /></div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 12px; color: var(--ink-3); font-weight: 500;">Sidi</div>
                  <div style="font-size: 14px; color: var(--ink); font-weight: 500;">{formatDateID(j.tanggal_sidi)}</div>
                </div>
              </div>
            </div>
          </div>

          {#if keluarga}
            <div class="section-h"><span class="t">Keluarga</span></div>
            <div style="padding: 0 16px;">
              <button class="row row-tap" type="button" onclick={() => push(`/keluarga/${keluarga.id}`)}>
                <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--accent-soft); color: var(--accent-ink); display: flex; align-items: center; justify-content: center;">
                  <Icon name="home2" size={18} />
                </div>
                <div class="row-body">
                  <div class="row-title">{keluarga.nama_keluarga}</div>
                  <div class="row-sub">{keluarga.alamat ?? ''}</div>
                </div>
                <Icon name="chevron" />
              </button>
            </div>
          {/if}

          {#if isPelayan}
            <div class="section-h"><span class="t">Pelayanan</span></div>
            <div style="padding: 0 16px;">
              <div class="card" style="padding: 14px; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                  {#each services as st (st.id)}
                    <span class="chip chip-accent">{st.nama}</span>
                  {/each}
                </div>
                {#if pelayanRecord?.catatan}
                  <div style="font-size: 13px; color: var(--ink-3); border-top: 1px solid var(--line); padding-top: 10px;">
                    {pelayanRecord.catatan}
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          {#if j.catatan}
            <div class="section-h"><span class="t">Catatan</span></div>
            <div style="padding: 0 16px 24px;">
              <div class="card" style="padding: 14px; font-size: 14px; color: var(--ink-2); white-space: pre-wrap;">
                {j.catatan}
              </div>
            </div>
          {/if}

          <div style="height: 24px;"></div>
        {/if}
      </div>
    </div>
    {/if}
  {/snippet}
</ProtectedRoute>
