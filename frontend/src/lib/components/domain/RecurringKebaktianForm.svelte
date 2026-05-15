<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Textarea from '$lib/components/ui/Textarea.svelte';
  import type { CreateRecurringKebaktianInput } from '$lib/types';
  import { recurringKebaktianSchema } from '$lib/schemas/recurring-kebaktian';
  import { t } from '$lib/i18n';

  interface Props {
    submitting?: boolean;
    onSubmit: (data: CreateRecurringKebaktianInput) => void;
    onCancel?: () => void;
  }

  const { submitting = false, onSubmit, onCancel }: Props = $props();

  let nama = $state('Kebaktian Minggu Pagi');
  let waktu_mulai = $state('09:00');
  let lokasi = $state('');
  let tema = $state('');
  let pengkhotbah = $state('');
  let catatan = $state('');
  let start_date = $state(new Date().toISOString().slice(0, 10));
  let weekday = $state<number>(0);
  let week_count = $state<number>(4);
  let error = $state<string | null>(null);

  const weekdayOptions = [
    { value: 0, label: 'Minggu' },
    { value: 1, label: 'Senin' },
    { value: 2, label: 'Selasa' },
    { value: 3, label: 'Rabu' },
    { value: 4, label: 'Kamis' },
    { value: 5, label: 'Jumat' },
    { value: 6, label: 'Sabtu' },
  ];

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    const parsed = recurringKebaktianSchema.safeParse({
      template: { nama, waktu_mulai, lokasi, tema, pengkhotbah, catatan },
      start_date,
      weekday,
      week_count,
    });
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Validasi gagal';
      return;
    }
    onSubmit(parsed.data as CreateRecurringKebaktianInput);
  }
</script>

<form class="space-y-4" onsubmit={handleSubmit}>
  {#if error}
    <p class="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  {/if}

  <p class="text-sm text-muted-foreground">
    {t('recurring.help', 'Buat beberapa kebaktian mingguan sekaligus dari satu template.')}
  </p>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="space-y-1.5 sm:col-span-2">
      <Label for="rec_nama">{t('kebaktian.nama', 'Nama')} *</Label>
      <Input id="rec_nama" required bind:value={nama} />
    </div>
    <div class="space-y-1.5">
      <Label for="rec_start_date">{t('recurring.start_date', 'Mulai dari tanggal')} *</Label>
      <Input id="rec_start_date" type="date" required bind:value={start_date} />
    </div>
    <div class="space-y-1.5">
      <Label for="rec_weekday">{t('recurring.weekday', 'Hari dalam minggu')} *</Label>
      <Select id="rec_weekday" bind:value={weekday}>
        {#each weekdayOptions as o (o.value)}
          <option value={o.value}>{o.label}</option>
        {/each}
      </Select>
    </div>
    <div class="space-y-1.5">
      <Label for="rec_count">{t('recurring.week_count', 'Jumlah kebaktian')} *</Label>
      <Input id="rec_count" type="number" required bind:value={week_count} />
    </div>
    <div class="space-y-1.5">
      <Label for="rec_waktu">{t('kebaktian.waktu_mulai', 'Waktu mulai')} *</Label>
      <Input id="rec_waktu" type="time" required bind:value={waktu_mulai} />
    </div>
    <div class="space-y-1.5 sm:col-span-2">
      <Label for="rec_lokasi">{t('kebaktian.lokasi', 'Lokasi')}</Label>
      <Input id="rec_lokasi" bind:value={lokasi} />
    </div>
    <div class="space-y-1.5">
      <Label for="rec_tema">{t('kebaktian.tema', 'Tema')}</Label>
      <Input id="rec_tema" bind:value={tema} />
    </div>
    <div class="space-y-1.5">
      <Label for="rec_pengkhotbah">{t('kebaktian.pengkhotbah', 'Pengkhotbah')}</Label>
      <Input id="rec_pengkhotbah" bind:value={pengkhotbah} />
    </div>
    <div class="space-y-1.5 sm:col-span-2">
      <Label for="rec_catatan">{t('kebaktian.catatan', 'Catatan')}</Label>
      <Textarea id="rec_catatan" rows={2} bind:value={catatan} />
    </div>
  </div>

  <div class="flex flex-col-reverse items-stretch justify-end gap-2 pt-2 sm:flex-row sm:items-center">
    {#if onCancel}
      <Button type="button" variant="outline" onclick={onCancel} disabled={submitting}>
        {t('common.cancel', 'Batal')}
      </Button>
    {/if}
    <Button type="submit" disabled={submitting}>
      {submitting ? t('common.saving', 'Membuat…') : t('recurring.create', 'Buat kebaktian')}
    </Button>
  </div>
</form>
