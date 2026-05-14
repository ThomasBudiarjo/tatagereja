<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import Textarea from '$lib/components/ui/Textarea.svelte';
  import type { CreateKebaktianInput, Kebaktian } from '$lib/types';
  import { kebaktianSchema } from '$lib/schemas/kebaktian';
  import { t } from '$lib/i18n';

  interface Props {
    initial?: Partial<Kebaktian>;
    submitting?: boolean;
    submitLabel?: string;
    onSubmit: (data: CreateKebaktianInput) => void;
    onCancel?: () => void;
  }

  const {
    initial = {},
    submitting = false,
    submitLabel,
    onSubmit,
    onCancel,
  }: Props = $props();

  let nama = $state(initial.nama ?? 'Kebaktian Minggu Pagi');
  let tanggal = $state(initial.tanggal ?? '');
  let waktu_mulai = $state(initial.waktu_mulai ?? '09:00');
  let lokasi = $state(initial.lokasi ?? '');
  let tema = $state(initial.tema ?? '');
  let pengkhotbah = $state(initial.pengkhotbah ?? '');
  let catatan = $state(initial.catatan ?? '');
  let error = $state<string | null>(null);

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    const parsed = kebaktianSchema.safeParse({
      nama, tanggal, waktu_mulai, lokasi, tema, pengkhotbah, catatan,
    });
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Validasi gagal';
      return;
    }
    onSubmit(parsed.data as CreateKebaktianInput);
  }
</script>

<form class="space-y-4" onsubmit={handleSubmit}>
  {#if error}
    <p class="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  {/if}

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="space-y-1.5 sm:col-span-2">
      <Label for="keb_nama">{t('kebaktian.nama', 'Nama')} *</Label>
      <Input id="keb_nama" required bind:value={nama} />
    </div>
    <div class="space-y-1.5">
      <Label for="keb_tanggal">{t('kebaktian.tanggal', 'Tanggal')} *</Label>
      <Input id="keb_tanggal" type="date" required bind:value={tanggal} />
    </div>
    <div class="space-y-1.5">
      <Label for="keb_waktu">{t('kebaktian.waktu_mulai', 'Waktu mulai')} *</Label>
      <Input id="keb_waktu" type="time" required bind:value={waktu_mulai} />
    </div>
    <div class="space-y-1.5">
      <Label for="keb_lokasi">{t('kebaktian.lokasi', 'Lokasi')}</Label>
      <Input id="keb_lokasi" bind:value={lokasi} />
    </div>
    <div class="space-y-1.5">
      <Label for="keb_pengkhotbah">{t('kebaktian.pengkhotbah', 'Pengkhotbah')}</Label>
      <Input id="keb_pengkhotbah" bind:value={pengkhotbah} />
    </div>
    <div class="space-y-1.5 sm:col-span-2">
      <Label for="keb_tema">{t('kebaktian.tema', 'Tema')}</Label>
      <Input id="keb_tema" bind:value={tema} />
    </div>
    <div class="space-y-1.5 sm:col-span-2">
      <Label for="keb_catatan">{t('kebaktian.catatan', 'Catatan')}</Label>
      <Textarea id="keb_catatan" rows={2} bind:value={catatan} />
    </div>
  </div>

  <div class="flex items-center justify-end gap-2 pt-2">
    {#if onCancel}
      <Button type="button" variant="outline" onclick={onCancel} disabled={submitting}>
        {t('common.cancel', 'Batal')}
      </Button>
    {/if}
    <Button type="submit" disabled={submitting}>
      {submitLabel ?? t('common.save', 'Simpan')}
    </Button>
  </div>
</form>
