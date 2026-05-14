<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { t } from '$lib/i18n';
  import { jemaatListQuery } from '$lib/api/jemaat';
  import { pelayanListQuery } from '$lib/api/pelayan';
  import { serviceTypesListQuery } from '$lib/api/service-types';
  import { kebaktianListQuery } from '$lib/api/kebaktian';

  const jemaatQ = jemaatListQuery(() => ({ limit: 1 }));
  const pelayanQ = pelayanListQuery(() => ({ limit: 1 }));
  const stQ = serviceTypesListQuery();
  const kebaktianQ = kebaktianListQuery(() => ({ limit: 50 }));

  const cards = $derived([
    {
      label: t('dashboard.jemaat_count', 'Total Jemaat'),
      value: $jemaatQ.data?.total ?? '—',
      href: '#/jemaat',
    },
    {
      label: t('dashboard.pelayan_count', 'Total Pelayan'),
      value: $pelayanQ.data?.total ?? '—',
      href: '#/pelayan',
    },
    {
      label: t('dashboard.service_types_count', 'Jenis Pelayanan'),
      value: $stQ.data?.total ?? '—',
      href: '#/service-types',
    },
    {
      label: t('dashboard.kebaktian_count', 'Kebaktian (90 hari)'),
      value: $kebaktianQ.data?.total ?? '—',
      href: '#/kebaktian',
    },
  ]);
</script>

<AppShell>
  <header class="mb-6">
    <h1 class="text-2xl font-semibold">{t('dashboard.title', 'Dashboard')}</h1>
    {#if auth.user}
      <p class="text-sm text-muted-foreground">
        {t('dashboard.welcome', 'Selamat datang')}, {auth.user.display_name}.
      </p>
    {/if}
  </header>

  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each cards as card (card.label)}
      <a
        href={card.href}
        class="rounded-lg border bg-card p-5 transition-colors hover:bg-accent"
      >
        <p class="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
        <p class="mt-2 text-3xl font-semibold">{card.value}</p>
      </a>
    {/each}
  </div>

  <section class="mt-10 rounded-lg border bg-card p-6">
    <h2 class="mb-2 text-base font-semibold">
      {t('dashboard.disclaimer_title', 'Hobby project — tanpa SLA')}
    </h2>
    <p class="text-sm text-muted-foreground">
      Shepherd adalah aplikasi open source yang dihosting gratis. Tidak ada
      jaminan uptime atau garansi data. Untuk kebutuhan kritis silakan backup
      data secara berkala.
    </p>
  </section>
</AppShell>
