<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import type {
    JadwalSlot,
    JadwalSlotInput,
    Pelayan,
    ServiceType,
  } from '$lib/types';
  import { t } from '$lib/i18n';

  interface Props {
    serviceTypes: ServiceType[];
    pelayan: Pelayan[];
    slots: JadwalSlot[];
    submitting?: boolean;
    onSubmit: (slots: JadwalSlotInput[]) => void;
  }

  const { serviceTypes, pelayan, slots, submitting = false, onSubmit }: Props = $props();

  interface Row {
    service_type_id: number;
    service_type_name: string;
    service_type_warna: string | null;
    pelayan_id: number | '';
    catatan: string;
  }

  function initialRows(): Row[] {
    const byST = new Map<number, JadwalSlot>();
    for (const slot of slots) byST.set(slot.service_type_id, slot);
    return serviceTypes.map((st) => {
      const existing = byST.get(st.id);
      return {
        service_type_id: st.id,
        service_type_name: st.nama,
        service_type_warna: st.warna,
        pelayan_id: existing?.pelayan_id ?? '',
        catatan: existing?.catatan ?? '',
      };
    });
  }

  let rows = $state<Row[]>(initialRows());

  function eligiblePelayan(stID: number): Pelayan[] {
    return pelayan.filter((p) => p.service_types.some((s) => s.id === stID));
  }

  function handleSave() {
    const payload: JadwalSlotInput[] = rows.map((r) => ({
      service_type_id: r.service_type_id,
      pelayan_id: r.pelayan_id === '' ? null : Number(r.pelayan_id),
      catatan: r.catatan.trim() === '' ? null : r.catatan,
    }));
    onSubmit(payload);
  }
</script>

<div class="space-y-3">
  {#if rows.length === 0}
    <p class="text-sm text-muted-foreground">
      Tambahkan jenis pelayanan dulu untuk membuat jadwal.
    </p>
  {:else}
    <div class="overflow-hidden rounded-lg border bg-card">
      <table class="w-full text-sm">
        <thead class="bg-muted/40 text-left">
          <tr>
            <th class="px-3 py-2 font-medium">{t('jadwal.service_type', 'Jenis pelayanan')}</th>
            <th class="px-3 py-2 font-medium">{t('jadwal.pelayan', 'Pelayan')}</th>
            <th class="px-3 py-2 font-medium">{t('jadwal.catatan', 'Catatan')}</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          {#each rows as row, idx (row.service_type_id)}
            <tr>
              <td class="px-3 py-2">
                <Badge color={row.service_type_warna}>{row.service_type_name}</Badge>
              </td>
              <td class="px-3 py-2">
                <Select bind:value={rows[idx].pelayan_id}>
                  <option value="">— Belum terisi —</option>
                  {#each eligiblePelayan(row.service_type_id) as p (p.id)}
                    <option value={p.id}>{p.nama_lengkap}</option>
                  {/each}
                </Select>
              </td>
              <td class="px-3 py-2">
                <Input bind:value={rows[idx].catatan} placeholder="—" />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="flex items-center justify-end">
      <Button onclick={handleSave} disabled={submitting}>
        {submitting ? t('common.saving', 'Menyimpan…') : t('jadwal.save', 'Simpan jadwal')}
      </Button>
    </div>
  {/if}
</div>
