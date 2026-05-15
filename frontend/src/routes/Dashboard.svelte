<script lang="ts">
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import BirthdaysWidget from '$lib/components/domain/BirthdaysWidget.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { t } from '$lib/i18n';
  import { jemaatListQuery } from '$lib/api/jemaat';
  import { pelayanListQuery } from '$lib/api/pelayan';
  import { serviceTypesListQuery } from '$lib/api/service-types';
  import { kebaktianListQuery } from '$lib/api/kebaktian';
  import { keluargaListQuery } from '$lib/api/keluarga';

  const jemaatQ = jemaatListQuery(() => ({ limit: 1 }));
  const pelayanQ = pelayanListQuery(() => ({ limit: 1 }));
  const stQ = serviceTypesListQuery();
  const kebaktianQ = kebaktianListQuery(() => ({ limit: 100 }));
  const keluargaQ = keluargaListQuery(() => ({ limit: 1 }));

  interface Card {
    label: string;
    value: number | null;
    loading: boolean;
    href: string;
  }

  const cards = $derived<Card[]>([
    {
      label: t('dashboard.jemaat_count', 'Total Jemaat'),
      value: $jemaatQ.data?.total ?? null,
      loading: $jemaatQ.isLoading,
      href: '#/jemaat',
    },
    {
      label: t('dashboard.keluarga_count', 'Total Keluarga'),
      value: $keluargaQ.data?.total ?? null,
      loading: $keluargaQ.isLoading,
      href: '#/keluarga',
    },
    {
      label: t('dashboard.pelayan_count', 'Total Pelayan'),
      value: $pelayanQ.data?.total ?? null,
      loading: $pelayanQ.isLoading,
      href: '#/pelayan',
    },
    {
      label: t('dashboard.service_types_count', 'Jenis Pelayanan'),
      value: $stQ.data?.total ?? null,
      loading: $stQ.isLoading,
      href: '#/service-types',
    },
    {
      label: t('dashboard.kebaktian_count', 'Kebaktian (90 hari)'),
      value: $kebaktianQ.data?.total ?? null,
      loading: $kebaktianQ.isLoading,
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

  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
    {#each cards as card (card.label)}
      <a
        href={card.href}
        class="rounded-lg border bg-card p-5 transition-colors hover:bg-accent"
      >
        <p class="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
        {#if card.loading}
          <Skeleton class="mt-2 h-8 w-16" />
        {:else}
          <p class="mt-2 text-3xl font-semibold">{card.value ?? '—'}</p>
        {/if}
      </a>
    {/each}
  </div>

  <div class="mt-10 grid gap-6 lg:grid-cols-2">
    <BirthdaysWidget />

    <section class="rounded-lg border bg-card p-6">
      <h2 class="mb-2 text-base font-semibold">
        {t('dashboard.disclaimer_title', 'Hobby project — tanpa SLA')}
      </h2>
      <p class="text-sm text-muted-foreground">
        Shepherd adalah aplikasi open source yang dihosting gratis. Tidak ada
        jaminan uptime atau garansi data. Untuk kebutuhan kritis silakan backup
        data secara berkala.
      </p>
    </section>
  </div>
</AppShell>
