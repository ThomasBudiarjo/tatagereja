<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Textarea from '$lib/components/ui/Textarea.svelte';
  import type { CreateJemaatInput, Jemaat } from '$lib/types';
  import { jemaatSchema } from '$lib/schemas/jemaat';
  import { t } from '$lib/i18n';

  interface Props {
    initial?: Partial<Jemaat>;
    submitting?: boolean;
    submitLabel?: string;
    onSubmit: (data: CreateJemaatInput) => void;
    onCancel?: () => void;
  }

  const {
    initial = {},
    submitting = false,
    submitLabel,
    onSubmit,
    onCancel,
  }: Props = $props();

  let nama_lengkap = $state(initial.nama_lengkap ?? '');
  let nama_panggilan = $state(initial.nama_panggilan ?? '');
  let jenis_kelamin = $state<string>(initial.jenis_kelamin ?? '');
  let tanggal_lahir = $state(initial.tanggal_lahir ?? '');
  let tempat_lahir = $state(initial.tempat_lahir ?? '');
  let alamat = $state(initial.alamat ?? '');
  let nomor_telepon = $state(initial.nomor_telepon ?? '');
  let email = $state(initial.email ?? '');
  let status_pernikahan = $state<string>(initial.status_pernikahan ?? '');
  let tanggal_baptis = $state(initial.tanggal_baptis ?? '');
  let tanggal_sidi = $state(initial.tanggal_sidi ?? '');
  let catatan = $state(initial.catatan ?? '');
  let error = $state<string | null>(null);

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    const raw = {
      nama_lengkap,
      nama_panggilan,
      jenis_kelamin: jenis_kelamin || undefined,
      tanggal_lahir,
      tempat_lahir,
      alamat,
      nomor_telepon,
      email,
      status_pernikahan: status_pernikahan || undefined,
      tanggal_baptis,
      tanggal_sidi,
      catatan,
    };
    const parsed = jemaatSchema.safeParse(raw);
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Validasi gagal';
      return;
    }
    onSubmit(parsed.data as CreateJemaatInput);
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
      <Label for="nama_lengkap">{t('jemaat.nama_lengkap', 'Nama lengkap')} *</Label>
      <Input id="nama_lengkap" required bind:value={nama_lengkap} />
    </div>
    <div class="space-y-1.5">
      <Label for="nama_panggilan">{t('jemaat.nama_panggilan', 'Nama panggilan')}</Label>
      <Input id="nama_panggilan" bind:value={nama_panggilan} />
    </div>
    <div class="space-y-1.5">
      <Label for="jenis_kelamin">{t('jemaat.jenis_kelamin', 'Jenis kelamin')}</Label>
      <Select id="jenis_kelamin" bind:value={jenis_kelamin}>
        <option value="">—</option>
        <option value="L">Laki-laki</option>
        <option value="P">Perempuan</option>
      </Select>
    </div>
    <div class="space-y-1.5">
      <Label for="tanggal_lahir">{t('jemaat.tanggal_lahir', 'Tanggal lahir')}</Label>
      <Input id="tanggal_lahir" type="date" bind:value={tanggal_lahir} />
    </div>
    <div class="space-y-1.5">
      <Label for="tempat_lahir">{t('jemaat.tempat_lahir', 'Tempat lahir')}</Label>
      <Input id="tempat_lahir" bind:value={tempat_lahir} />
    </div>
    <div class="space-y-1.5 sm:col-span-2">
      <Label for="alamat">{t('jemaat.alamat', 'Alamat')}</Label>
      <Textarea id="alamat" rows={2} bind:value={alamat} />
    </div>
    <div class="space-y-1.5">
      <Label for="nomor_telepon">{t('jemaat.nomor_telepon', 'Nomor telepon')}</Label>
      <Input id="nomor_telepon" bind:value={nomor_telepon} />
    </div>
    <div class="space-y-1.5">
      <Label for="email">{t('jemaat.email', 'Email')}</Label>
      <Input id="email" type="email" bind:value={email} />
    </div>
    <div class="space-y-1.5">
      <Label for="status_pernikahan">{t('jemaat.status_pernikahan', 'Status pernikahan')}</Label>
      <Select id="status_pernikahan" bind:value={status_pernikahan}>
        <option value="">—</option>
        <option value="belum_menikah">Belum menikah</option>
        <option value="menikah">Menikah</option>
        <option value="cerai">Cerai</option>
        <option value="duda">Duda</option>
        <option value="janda">Janda</option>
      </Select>
    </div>
    <div class="space-y-1.5">
      <Label for="tanggal_baptis">{t('jemaat.tanggal_baptis', 'Tanggal baptis')}</Label>
      <Input id="tanggal_baptis" type="date" bind:value={tanggal_baptis} />
    </div>
    <div class="space-y-1.5">
      <Label for="tanggal_sidi">{t('jemaat.tanggal_sidi', 'Tanggal sidi')}</Label>
      <Input id="tanggal_sidi" type="date" bind:value={tanggal_sidi} />
    </div>
    <div class="space-y-1.5 sm:col-span-2">
      <Label for="catatan">{t('jemaat.catatan', 'Catatan')}</Label>
      <Textarea id="catatan" rows={3} bind:value={catatan} />
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
