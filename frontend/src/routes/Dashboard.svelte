<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { jemaatApi } from '$lib/api/jemaat';
  import { keluargaApi } from '$lib/api/keluarga';
  import { pelayanApi } from '$lib/api/pelayan';
  import { kebaktianApi } from '$lib/api/kebaktian';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { auth } from '$lib/stores/auth.svelte';
  import { viewport } from '$lib/stores/viewport.svelte';
  import { link, push } from 'svelte-spa-router';
  import { fmtDayMonth, fmtTime, fmtRelativeID, fmtMediumID } from '$lib/utils/idDate';
  import { greeting, formatDateID, ageFromIso } from '$lib/utils/format';
  import TopBar from '$lib/components/TopBar.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';
  import type { Kebaktian, Paginated, ListWrap } from '$lib/types';

  const jemaatQ = createQuery(
    toStore(() => ({
      queryKey: ['jemaat', 'all-for-bday'],
      queryFn: () => jemaatApi.list({ limit: 200, offset: 0 }),
    })),
  );
  const keluargaQ = createQuery(
    toStore(() => ({
      queryKey: ['keluarga', 'count'],
      queryFn: () => keluargaApi.list({ limit: 1, offset: 0 }),
    })),
  );
  const pelayanQ = createQuery(
    toStore(() => ({
      queryKey: ['pelayan', 'count'],
      queryFn: () => pelayanApi.list({ limit: 1, offset: 0 }),
    })),
  );
  const kebaktianQ = createQuery(
    toStore(() => ({
      queryKey: ['kebaktian', 'upcoming'],
      queryFn: () => kebaktianApi.list({ limit: 5, offset: 0 }),
    })),
  );
  const stQ = createQuery(
    toStore(() => ({
      queryKey: ['service-types'],
      queryFn: () => serviceTypesApi.list(),
    })),
  );

  function upcomingList(d: Paginated<Kebaktian> | ListWrap<Kebaktian> | undefined): Kebaktian[] {
    if (!d) return [];
    return d.data ?? [];
  }

  // Fetch jadwal for upcoming kebaktian (for slot counts)
  const upcomingIds = $derived(upcomingList($kebaktianQ.data).slice(0, 4).map((k) => k.id));
  const jadwalCountsQ = createQuery(
    toStore(() => ({
      queryKey: ['kebaktian', 'jadwal-counts', upcomingIds.join(',')] as const,
      enabled: upcomingIds.length > 0,
      queryFn: async () => {
        const results = await Promise.all(
          upcomingIds.map((id) =>
            kebaktianApi
              .getJadwal(id)
              .then((r) => ({ id, filled: r.data.filter((s) => s.pelayan_id !== null).length }))
              .catch(() => ({ id, filled: 0 })),
          ),
        );
        const map: Record<number, number> = {};
        for (const r of results) map[r.id] = r.filled;
        return map;
      },
    })),
  );

  const dayMonth = fmtDayMonth;
  const timeOnly = fmtTime;
  const relativeLabel = fmtRelativeID;

  const total = $derived($stQ.data?.data?.length ?? 0);

  // Approximate "unfilled slots in next 7 days"
  const unfilled = $derived.by(() => {
    const counts = $jadwalCountsQ.data ?? {};
    const next7 = upcomingList($kebaktianQ.data)
      .filter((k) => {
        const dt = new Date(k.waktu_mulai).getTime();
        const dayDiff = (dt - Date.now()) / 86_400_000;
        return dayDiff >= -1 && dayDiff <= 7;
      })
      .map((k) => k.id);
    if (total === 0) return 0;
    return next7.reduce((acc, id) => acc + Math.max(0, total - (counts[id] ?? 0)), 0);
  });

  type BirthdayItem = { id: number; name: string; date: string; label: string; age: number };

  function nextBirthdayDate(ymd: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
    if (!m) return null;
    const now = new Date();
    let target = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[3]));
    if (target.getTime() < now.getTime() - 86_400_000) {
      target = new Date(now.getFullYear() + 1, Number(m[2]) - 1, Number(m[3]));
    }
    return target;
  }

  function birthdaysSoon(limit = 4): BirthdayItem[] {
    const all = $jemaatQ.data?.data ?? [];
    const now = new Date();
    const items: BirthdayItem[] = [];
    for (const j of all) {
      if (!j.tanggal_lahir) continue;
      const next = nextBirthdayDate(j.tanggal_lahir);
      if (!next) continue;
      const daysAway = Math.round((next.getTime() - now.getTime()) / 86_400_000);
      if (daysAway < -1 || daysAway > 30) continue;
      const age = (ageFromIso(j.tanggal_lahir) ?? 0) + (daysAway >= 0 ? 1 : 0);
      const label = daysAway <= 0 ? 'Hari ini' : daysAway === 1 ? 'Besok' : `${daysAway} hari lagi`;
      items.push({
        id: j.id,
        name: j.nama_lengkap,
        date: formatDateID(j.tanggal_lahir).split(' ').slice(0, 2).join(' '),
        label,
        age,
      });
    }
    items.sort((a, b) => a.label.localeCompare(b.label));
    return items.slice(0, limit);
  }

  function todayLabel(): string {
    const tz = auth.user?.timezone ?? 'Asia/Jakarta';
    try {
      const d = new Intl.DateTimeFormat('id-ID', {
        timeZone: tz,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
      return `${d} · ${tz}`;
    } catch {
      return tz;
    }
  }
</script>

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <!-- ════════ DESKTOP ════════ -->
      <DesktopLayout title={`${greeting()}, ${auth.user?.display_name ?? ''}`} subtitle={todayLabel()}>
        {#snippet actions()}
          <button class="dt-btn dt-btn-outline" type="button">
            <Icon name="bell" size={16} /> Notifikasi
          </button>
          <button class="dt-btn dt-btn-primary" type="button" onclick={() => push('/kebaktian')}>
            <Icon name="plus" size={16} /> Tambah kebaktian
          </button>
        {/snippet}

        <!-- KPI -->
        <div class="dt-grid-4" style="margin-bottom: 20px;">
          <button class="dt-kpi" type="button" onclick={() => push('/jemaat')}>
            <span class="dt-kpi-label">Jemaat aktif</span>
            <span class="dt-kpi-value">{$jemaatQ.data?.total ?? '—'}</span>
            <span class="dt-kpi-delta">{$keluargaQ.data?.total ?? '—'} keluarga</span>
          </button>
          <button class="dt-kpi" type="button" onclick={() => push('/keluarga')}>
            <span class="dt-kpi-label">Keluarga</span>
            <span class="dt-kpi-value">{$keluargaQ.data?.total ?? '—'}</span>
            <span class="dt-kpi-delta">Unit keluarga terdaftar</span>
          </button>
          <button class="dt-kpi" type="button" onclick={() => push('/pelayan')}>
            <span class="dt-kpi-label">Pelayan aktif</span>
            <span class="dt-kpi-value">{$pelayanQ.data?.total ?? '—'}</span>
            <span class="dt-kpi-delta">{$stQ.data?.data?.length ?? '—'} jenis pelayanan</span>
          </button>
          <button class="dt-kpi" type="button" onclick={() => push('/jadwal-master')}>
            <span class="dt-kpi-label">Slot belum terisi</span>
            <span
              class="dt-kpi-value"
              style="color: {unfilled > 0 ? 'oklch(0.55 0.13 70)' : 'var(--ok)'};"
            >
              {unfilled}
            </span>
            <span class="dt-kpi-delta">untuk 7 hari ke depan</span>
          </button>
        </div>

        <div class="dt-grid-3">
          <!-- Kebaktian mendatang -->
          <div class="dt-card">
            <div class="dt-card-head">
              <span class="dt-card-title">Kebaktian mendatang</span>
              <button class="dt-card-action" type="button" onclick={() => push('/kebaktian')}>
                Lihat semua →
              </button>
            </div>
            {#if upcomingList($kebaktianQ.data).length === 0}
              <div class="dt-card-pad" style="color: var(--ink-3); font-size: 13px;">
                Belum ada kebaktian.
              </div>
            {:else}
              {#each upcomingList($kebaktianQ.data).slice(0, 4) as k (k.id)}
                {@const dm = dayMonth(k.waktu_mulai)}
                {@const filled = ($jadwalCountsQ.data ?? {})[k.id] ?? 0}
                {@const chipCls = filled === total && total > 0
                  ? 'chip-ok'
                  : filled === 0
                  ? 'chip-warn'
                  : 'chip-accent'}
                <button
                  class="dt-pagerow hover"
                  type="button"
                  onclick={() => push(`/kebaktian/${k.id}`)}
                  style="background: none; border: none; text-align: left; width: 100%;"
                >
                  <div class="dt-date-tile">
                    <div class="m">{dm.month}</div>
                    <div class="d">{dm.day}</div>
                  </div>
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 14px; font-weight: 700; color: var(--ink);">{k.nama}</div>
                    <div style="font-size: 12px; color: var(--ink-3); margin-top: 2px;">
                      {fmtMediumID(k.waktu_mulai)}{k.lokasi ? ` · ${k.lokasi}` : ''}
                    </div>
                    {#if k.tema}
                      <div style="font-size: 12px; color: var(--ink-2); margin-top: 4px; font-style: italic;">
                        &ldquo;{k.tema}&rdquo;{#if k.pengkhotbah}<span
                          style="color: var(--ink-3); font-style: normal;"> · {k.pengkhotbah}</span
                          >{/if}
                      </div>
                    {/if}
                  </div>
                  <span class="chip {chipCls}">{filled}/{total} slot</span>
                </button>
              {/each}
            {/if}
          </div>

          <!-- Right column -->
          <div style="display: flex; flex-direction: column; gap: 20px;">
            {#if unfilled > 0}
              <div
                class="dt-card"
                style="background: var(--warn-soft); border-color: color-mix(in oklab, oklch(0.7 0.13 70) 22%, transparent);"
              >
                <div class="dt-card-pad" style="display: flex; gap: 12px;">
                  <div
                    style="width: 32px; height: 32px; border-radius: 8px;
                           background: #fff; color: oklch(0.55 0.15 70);
                           display: flex; align-items: center; justify-content: center; font-weight: 800;"
                  >
                    !
                  </div>
                  <div style="flex: 1;">
                    <div style="font-weight: 700; font-size: 13px; color: oklch(0.35 0.1 70);">
                      {unfilled} slot pelayanan belum terisi
                    </div>
                    <div style="font-size: 12px; color: oklch(0.45 0.07 70); margin-top: 2px; margin-bottom: 10px;">
                      Untuk kebaktian minggu ini.
                    </div>
                    <button
                      class="dt-btn dt-btn-sm"
                      type="button"
                      onclick={() => push('/jadwal-master')}
                      style="background: #fff; color: oklch(0.35 0.1 70);
                             border: 1px solid color-mix(in oklab, oklch(0.7 0.13 70) 22%, transparent);"
                    >
                      Atur sekarang →
                    </button>
                  </div>
                </div>
              </div>
            {/if}

            {#if birthdaysSoon().length > 0}
              <div class="dt-card">
                <div class="dt-card-head">
                  <span class="dt-card-title">Ulang tahun</span>
                  <span style="font-size: 11px; color: var(--ink-3);">
                    {birthdaysSoon().length} mendatang
                  </span>
                </div>
                {#each birthdaysSoon() as b (b.id)}
                  <a
                    href={`/jemaat/${b.id}`}
                    use:link
                    class="dt-mini-row"
                    style="text-decoration: none; color: inherit;"
                  >
                    <Avatar name={b.name} size="sm" />
                    <div class="t">
                      {b.name}
                      <div class="s">{b.date} · {b.age} tahun</div>
                    </div>
                    <span class="chip dt-chip-sm {b.label === 'Besok' || b.label === 'Hari ini' ? 'chip-accent' : ''}">
                      {b.label}
                    </span>
                  </a>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </DesktopLayout>
    {:else}
      <!-- ════════ MOBILE (unchanged) ════════ -->
      <div class="app">
        <TopBar title="">
          {#snippet leading()}
            <div
              style="width: 36px; height: 36px; border-radius: 12px; background: var(--accent);
                     color: #fff; display: flex; align-items: center; justify-content: center;
                     font-weight: 800; font-size: 14px; margin-left: 8px;"
            >
              tg
            </div>
          {/snippet}
          {#snippet trailing()}
            <button class="icon-btn" type="button" aria-label="Notifikasi"><Icon name="bell" /></button>
          {/snippet}
        </TopBar>

        <div class="app-scroll">
          <div style="padding: 4px 18px 8px;">
            <div style="font-size: 13px; color: var(--ink-3); font-weight: 500;">{greeting()},</div>
            <div style="font-size: 24px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink);">
              {auth.user?.display_name ?? 'Pengguna'}
            </div>
            <div style="font-size: 13px; color: var(--ink-3); margin-top: 2px;">
              {auth.user?.church_name ?? ''}
            </div>
          </div>

          <div style="padding: 12px 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <button class="stat card-tap" type="button" onclick={() => push('/jemaat')}>
              <span class="stat-label">Jemaat aktif</span>
              <span class="stat-value">{$jemaatQ.data?.total ?? '—'}</span>
              <span class="stat-delta">{$keluargaQ.data?.total ?? '—'} keluarga</span>
            </button>
            <button class="stat card-tap" type="button" onclick={() => push('/pelayan')}>
              <span class="stat-label">Pelayan</span>
              <span class="stat-value">{$pelayanQ.data?.total ?? '—'}</span>
              <span class="stat-delta">{$stQ.data?.data?.length ?? '—'} jenis pelayanan</span>
            </button>
          </div>

          <div class="section-h">
            <span class="t">Kebaktian mendatang</span>
            <button class="link" type="button" onclick={() => push('/kebaktian')}>Semua</button>
          </div>
          <div class="list">
            {#if $kebaktianQ.isLoading}
              <div class="row" style="justify-content: center; color: var(--ink-3);">Memuat…</div>
            {:else if upcomingList($kebaktianQ.data).length === 0}
              <div class="empty">
                <div class="empty-icon"><Icon name="calendar" /></div>
                <div class="empty-title">Belum ada kebaktian</div>
                <div class="empty-sub">Tambahkan kebaktian untuk mengatur jadwal pelayanan.</div>
              </div>
            {:else}
              {#each upcomingList($kebaktianQ.data).slice(0, 3) as k (k.id)}
                {@const dm = dayMonth(k.waktu_mulai)}
                <button class="row row-tap" type="button" onclick={() => push(`/kebaktian/${k.id}`)}>
                  <div
                    style="width: 44px; min-width: 44px; height: 52px; background: var(--accent-soft);
                           border-radius: 10px; display: flex; flex-direction: column;
                           align-items: center; justify-content: center; color: var(--accent-ink);"
                  >
                    <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.08em;">{dm.month}</div>
                    <div style="font-size: 18px; font-weight: 800; line-height: 1; letter-spacing: -0.02em;">
                      {dm.day}
                    </div>
                  </div>
                  <div class="row-body">
                    <div class="row-title">{k.nama}</div>
                    <div class="row-sub">{timeOnly(k.waktu_mulai)}{k.lokasi ? ` · ${k.lokasi}` : ''}</div>
                  </div>
                  <span class="chip chip-accent">{relativeLabel(k.waktu_mulai)}</span>
                </button>
              {/each}
            {/if}
          </div>

          {#if birthdaysSoon().length > 0}
            <div class="section-h">
              <span class="t">Ulang tahun</span>
              <button class="link" type="button" onclick={() => push('/jemaat')}>Lihat</button>
            </div>
            <div class="list">
              {#each birthdaysSoon() as b (b.id)}
                <a href={`/jemaat/${b.id}`} use:link class="row row-tap" style="text-decoration: none; color: inherit;">
                  <Avatar name={b.name} />
                  <div class="row-body">
                    <div class="row-title">{b.name}</div>
                    <div class="row-sub">{b.date} · {b.age} tahun</div>
                  </div>
                  <span class="chip {b.label === 'Hari ini' || b.label === 'Besok' ? 'chip-accent' : ''}">
                    {#if b.label === 'Hari ini' || b.label === 'Besok'}
                      <Icon name="cake" size={12} />
                    {/if}
                    {b.label}
                  </span>
                </a>
              {/each}
            </div>
          {/if}

          <div style="height: 24px;"></div>
        </div>

        <BottomNav />
      </div>
    {/if}
  {/snippet}
</ProtectedRoute>
