<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import Textarea from '$lib/components/ui/Textarea.svelte';
  import type { CreateServiceTypeInput, ServiceType } from '$lib/types';
  import { serviceTypeSchema } from '$lib/schemas/service-type';
  import { t } from '$lib/i18n';

  interface Props {
    initial?: Partial<ServiceType>;
    submitting?: boolean;
    submitLabel?: string;
    onSubmit: (data: CreateServiceTypeInput) => void;
    onCancel?: () => void;
  }

  const {
    initial = {},
    submitting = false,
    submitLabel,
    onSubmit,
    onCancel,
  }: Props = $props();

  let nama = $state(initial.nama ?? '');
  let deskripsi = $state(initial.deskripsi ?? '');
  let warna = $state(initial.warna ?? '#3b82f6');
  let urutan = $state<number>(initial.urutan ?? 0);
  let error = $state<string | null>(null);

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    const parsed = serviceTypeSchema.safeParse({ nama, deskripsi, warna, urutan });
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Validasi gagal';
      return;
    }
    onSubmit(parsed.data as CreateServiceTypeInput);
  }
</script>

<form class="space-y-4" onsubmit={handleSubmit}>
  {#if error}
    <p class="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  {/if}

  <div class="space-y-1.5">
    <Label for="st_nama">{t('service_type.nama', 'Nama')} *</Label>
    <Input id="st_nama" required bind:value={nama} />
  </div>
  <div class="space-y-1.5">
    <Label for="st_deskripsi">{t('service_type.deskripsi', 'Deskripsi')}</Label>
    <Textarea id="st_deskripsi" rows={2} bind:value={deskripsi} />
  </div>
  <div class="grid grid-cols-2 gap-3">
    <div class="space-y-1.5">
      <Label for="st_warna">{t('service_type.warna', 'Warna')}</Label>
      <Input id="st_warna" type="color" bind:value={warna} />
    </div>
    <div class="space-y-1.5">
      <Label for="st_urutan">{t('service_type.urutan', 'Urutan')}</Label>
      <Input id="st_urutan" type="number" bind:value={urutan} />
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
