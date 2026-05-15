<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import Textarea from '$lib/components/ui/Textarea.svelte';
  import type { CreateKeluargaInput, Keluarga } from '$lib/types';
  import { keluargaSchema } from '$lib/schemas/keluarga';
  import { t } from '$lib/i18n';

  interface Props {
    initial?: Partial<Keluarga>;
    submitting?: boolean;
    submitLabel?: string;
    onSubmit: (data: CreateKeluargaInput) => void;
    onCancel?: () => void;
  }

  const {
    initial = {},
    submitting = false,
    submitLabel,
    onSubmit,
    onCancel,
  }: Props = $props();

  let nama_keluarga = $state(initial.nama_keluarga ?? '');
  let alamat = $state(initial.alamat ?? '');
  let catatan = $state(initial.catatan ?? '');
  let error = $state<string | null>(null);

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    const parsed = keluargaSchema.safeParse({ nama_keluarga, alamat, catatan });
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Validasi gagal';
      return;
    }
    onSubmit(parsed.data as CreateKeluargaInput);
  }
</script>

<form class="space-y-4" onsubmit={handleSubmit}>
  {#if error}
    <p class="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  {/if}
  <div class="space-y-1.5">
    <Label for="kel_nama">{t('keluarga.nama', 'Nama keluarga')} *</Label>
    <Input id="kel_nama" required bind:value={nama_keluarga} />
  </div>
  <div class="space-y-1.5">
    <Label for="kel_alamat">{t('keluarga.alamat', 'Alamat')}</Label>
    <Textarea id="kel_alamat" rows={2} bind:value={alamat} />
  </div>
  <div class="space-y-1.5">
    <Label for="kel_catatan">{t('keluarga.catatan', 'Catatan')}</Label>
    <Textarea id="kel_catatan" rows={2} bind:value={catatan} />
  </div>

  <div class="flex flex-col-reverse items-stretch justify-end gap-2 pt-2 sm:flex-row sm:items-center">
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
