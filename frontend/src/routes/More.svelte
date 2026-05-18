<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { keluargaApi } from '$lib/api/keluarga';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { auth } from '$lib/stores/auth.svelte';
  import { viewport } from '$lib/stores/viewport.svelte';
  import { push } from 'svelte-spa-router';
  import TopBar from '$lib/components/TopBar.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';

  const keluargaQ = createQuery(
    toStore(() => ({
      queryKey: ['keluarga', 'count'],
      queryFn: () => keluargaApi.list({ limit: 1, offset: 0 }),
    })),
  );
  const stQ = createQuery(
    toStore(() => ({
      queryKey: ['service-types'],
      queryFn: () => serviceTypesApi.list(),
    })),
  );

  async function logout() {
    await auth.logout();
  }
</script>

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <DesktopLayout title="Profil & Pengaturan" subtitle={auth.user?.email ?? ''}>
        <div style="max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px;">
          <div class="dt-card">
            <div class="dt-card-pad" style="display: flex; align-items: center; gap: 14px;">
              <Avatar name={auth.user?.display_name ?? 'Pengguna'} size="lg" />
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 16px; font-weight: 700; color: var(--ink);">{auth.user?.display_name ?? 'Pengguna'}</div>
                <div style="font-size: 13px; color: var(--ink-3);">{auth.user?.church_name ?? ''} · admin</div>
                <div style="font-size: 12px; color: var(--ink-3); margin-top: 2px;">
                  {auth.user?.timezone ?? 'Asia/Jakarta'} · {auth.user?.email ?? ''}
                </div>
              </div>
            </div>
          </div>
          <div class="dt-card">
            <div class="dt-card-head"><span class="dt-card-title">Pengaturan</span></div>
            <button class="dt-pagerow hover" type="button" onclick={() => push('/service-types')} style="background: none; border: none; text-align: left; width: 100%;">
              <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--surface-2); display: flex; align-items: center; justify-content: center; color: var(--ink-2);">
                <Icon name="tag" />
              </div>
              <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--ink);">Jenis pelayanan</div>
                <div style="font-size: 12px; color: var(--ink-3);">{$stQ.data?.data?.length ?? 0} jenis</div>
              </div>
              <Icon name="chevron" />
            </button>
            <button class="dt-pagerow hover" type="button" onclick={() => push('/keluarga')} style="background: none; border: none; text-align: left; width: 100%;">
              <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--surface-2); display: flex; align-items: center; justify-content: center; color: var(--ink-2);">
                <Icon name="home2" />
              </div>
              <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--ink);">Keluarga</div>
                <div style="font-size: 12px; color: var(--ink-3);">{$keluargaQ.data?.total ?? 0} keluarga terdaftar</div>
              </div>
              <Icon name="chevron" />
            </button>
          </div>
          <div style="padding: 0 0 32px;">
            <button class="dt-btn dt-btn-ghost" type="button" onclick={logout} style="color: var(--danger);">
              <Icon name="logout" size={16} /> Keluar
            </button>
          </div>
        </div>
      </DesktopLayout>
    {:else}
    <div class="app">
      <TopBar title="Lainnya" large />

      <div class="app-scroll" style="padding-bottom: 24px;">
        <!-- Profile card -->
        <div style="padding: 0 16px;">
          <div class="card" style="padding: 14px; display: flex; align-items: center; gap: 12px;">
            <Avatar name={auth.user?.display_name ?? 'Pengguna'} size="lg" />
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 16px; font-weight: 700; color: var(--ink);">
                {auth.user?.display_name ?? 'Pengguna'}
              </div>
              <div style="font-size: 13px; color: var(--ink-3);">
                {auth.user?.church_name ?? ''} · admin
              </div>
              <div style="font-size: 12px; color: var(--ink-3); margin-top: 2px;">
                {auth.user?.timezone ?? 'Asia/Jakarta'} · {auth.user?.email ?? ''}
              </div>
            </div>
          </div>
        </div>

        <div class="section-h"><span class="t">Pengaturan</span></div>
        <div class="list">
          <button class="row row-tap" type="button" onclick={() => push('/service-types')}>
            <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--surface-2);
                        display: flex; align-items: center; justify-content: center; color: var(--ink-2);">
              <Icon name="tag" />
            </div>
            <div class="row-body">
              <div class="row-title">Jenis pelayanan</div>
              <div class="row-sub">{$stQ.data?.data?.length ?? 0} jenis</div>
            </div>
            <Icon name="chevron" />
          </button>
          <button class="row row-tap" type="button" onclick={() => push('/keluarga')}>
            <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--surface-2);
                        display: flex; align-items: center; justify-content: center; color: var(--ink-2);">
              <Icon name="home2" />
            </div>
            <div class="row-body">
              <div class="row-title">Keluarga</div>
              <div class="row-sub">{$keluargaQ.data?.total ?? 0} keluarga terdaftar</div>
            </div>
            <Icon name="chevron" />
          </button>
          <button class="row row-tap" type="button">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--surface-2);
                        display: flex; align-items: center; justify-content: center; color: var(--ink-2);">
              <Icon name="settings" />
            </div>
            <div class="row-body">
              <div class="row-title">Profil gereja</div>
              <div class="row-sub">Nama, zona waktu, kontak</div>
            </div>
            <Icon name="chevron" />
          </button>
          <button class="row row-tap" type="button">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--surface-2);
                        display: flex; align-items: center; justify-content: center; color: var(--ink-2);">
              <Icon name="help" />
            </div>
            <div class="row-body">
              <div class="row-title">Bantuan &amp; tentang</div>
              <div class="row-sub">Proyek hobi · MIT License</div>
            </div>
            <Icon name="chevron" />
          </button>
        </div>

        <div style="padding: 12px 16px 32px;">
          <button
            class="btn btn-ghost btn-block"
            type="button"
            onclick={logout}
            style="color: var(--danger); justify-content: flex-start; padding-left: 16px;"
          >
            <Icon name="logout" /> Keluar
          </button>
        </div>

        <div style="padding: 0 24px 32px; text-align: center; color: var(--ink-4); font-size: 11px;">
          Tata Gereja · proyek hobi · tanpa SLA
        </div>
      </div>

      <BottomNav />
    </div>
    {/if}
  {/snippet}
</ProtectedRoute>
