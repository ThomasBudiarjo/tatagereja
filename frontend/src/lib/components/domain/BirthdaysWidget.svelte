<script lang="ts">
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { dashboardBirthdaysQuery } from '$lib/api/dashboard';
  import { t, formatDate } from '$lib/i18n';
  import { Cake } from 'lucide-svelte';

  const query = dashboardBirthdaysQuery(() => 30);

  function dayLabel(days: number): string {
    if (days === 0) return 'Hari ini!';
    if (days === 1) return 'Besok';
    return `${days} hari lagi`;
  }
</script>

<section class="rounded-lg border bg-card p-5">
  <header class="mb-3 flex items-center gap-2">
    <Cake class="h-5 w-5 text-primary" />
    <h2 class="text-base font-semibold">{t('dashboard.birthdays', 'Ulang tahun (30 hari)')}</h2>
  </header>

  {#if $query.isLoading}
    <div class="space-y-2">
      {#each Array(3) as _, i (i)}
        <Skeleton class="h-10 w-full" />
      {/each}
    </div>
  {:else if $query.isError}
    <p class="text-sm text-destructive">{$query.error.message}</p>
  {:else if !$query.data || $query.data.data.length === 0}
    <EmptyState
      title={t('dashboard.birthdays_empty', 'Tidak ada ulang tahun dalam 30 hari.')}
    />
  {:else}
    <ul class="divide-y">
      {#each $query.data.data.slice(0, 8) as entry (entry.jemaat_id)}
        <li class="flex items-center justify-between gap-3 py-2 text-sm">
          <a href={`#/jemaat/${entry.jemaat_id}`} class="font-medium hover:underline">
            {entry.nama_lengkap}
            {#if entry.nama_panggilan}
              <span class="ml-1 text-xs text-muted-foreground">({entry.nama_panggilan})</span>
            {/if}
          </a>
          <div class="text-right">
            <p class="text-xs text-muted-foreground">{formatDate(entry.next_birthday)}</p>
            <p class="text-xs font-medium">
              {dayLabel(entry.days_until)} · {entry.age_turning} thn
            </p>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>
