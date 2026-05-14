<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Textarea from '$lib/components/ui/Textarea.svelte';
  import type {
    CreatePelayanInput,
    Jemaat,
    Pelayan,
    ServiceType,
  } from '$lib/types';
  import { pelayanSchema } from '$lib/schemas/pelayan';
  import { t } from '$lib/i18n';

  interface Props {
    initial?: Partial<Pelayan>;
    jemaatList: Jemaat[];
    serviceTypes: ServiceType[];
    submitting?: boolean;
    submitLabel?: string;
    mode: 'create' | 'edit';
    onSubmit: (data: CreatePelayanInput) => void;
    onCancel?: () => void;
  }

  const {
    initial = {},
    jemaatList,
    serviceTypes,
    submitting = false,
    submitLabel,
    mode,
    onSubmit,
    onCancel,
  }: Props = $props();

  let jemaat_id = $state<number | ''>(initial.jemaat_id ?? '');
  let catatan = $state(initial.catatan ?? '');
  const initialIds = (initial.service_types ?? []).map((s) => s.id);
  let selected = $state<Set<number>>(new Set<number>(initialIds));
  let error = $state<string | null>(null);

  function toggle(id: number) {
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    selected = new Set(selected);
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = null;
    const raw = {
      jemaat_id: jemaat_id === '' ? 0 : jemaat_id,
      catatan,
      service_type_ids: Array.from(selected),
    };
    const parsed = pelayanSchema.safeParse(raw);
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Validasi gagal';
      return;
    }
    onSubmit(parsed.data as CreatePelayanInput);
  }
</script>

<form class="space-y-4" onsubmit={handleSubmit}>
  {#if error}
    <p class="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  {/if}

  <div class="space-y-1.5">
    <Label for="pelayan_jemaat">{t('pelayan.jemaat', 'Jemaat')} *</Label>
    <Select id="pelayan_jemaat" bind:value={jemaat_id} disabled={mode === 'edit'}>
      <option value="">— Pilih jemaat —</option>
      {#each jemaatList as j (j.id)}
        <option value={j.id}>{j.nama_lengkap}{j.nama_panggilan ? ` (${j.nama_panggilan})` : ''}</option>
      {/each}
    </Select>
  </div>

  <div class="space-y-1.5">
    <Label for="pelayan_catatan">{t('pelayan.catatan', 'Catatan')}</Label>
    <Textarea id="pelayan_catatan" rows={2} bind:value={catatan} />
  </div>

  <div class="space-y-1.5">
    <Label>{t('pelayan.service_types', 'Jenis pelayanan')}</Label>
    {#if serviceTypes.length === 0}
      <p class="text-sm text-muted-foreground">
        Belum ada jenis pelayanan. Tambahkan dulu di halaman Jenis Pelayanan.
      </p>
    {:else}
      <div class="grid grid-cols-2 gap-2">
        {#each serviceTypes as st (st.id)}
          <label class="flex items-center gap-2 rounded-md border p-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(st.id)}
              onchange={() => toggle(st.id)}
              class="h-4 w-4 rounded border-input"
            />
            <span>{st.nama}</span>
          </label>
        {/each}
      </div>
    {/if}
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
