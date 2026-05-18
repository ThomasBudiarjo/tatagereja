<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { kebaktianApi, type JadwalSlotWrite } from '$lib/api/kebaktian';
  import { serviceTypesApi } from '$lib/api/service-types';
  import { pelayanApi } from '$lib/api/pelayan';
  import { ApiError } from '$lib/api/client';
  import { link } from 'svelte-spa-router';
  import { ChevronLeft, Save } from 'lucide-svelte';
  import { formatDateTime } from '$lib/utils/date';
  import { emptyToNull } from '$lib/utils/format';

  let { params } = $props<{ params: { id: string } }>();
  const kebaktianID = $derived(Number(params.id));
  const qc = useQueryClient();

  const kebaktianQ = createQuery(toStore(() => ({
    queryKey: ['kebaktian', kebaktianID],
    queryFn: () => kebaktianApi.get(kebaktianID),
  })));
  const stQ = createQuery(toStore(() => ({
    queryKey: ['service-types'],
    queryFn: () => serviceTypesApi.list(),
  })));
  const pelayanQ = createQuery(toStore(() => ({
    queryKey: ['pelayan'],
    queryFn: () => pelayanApi.list({ limit: 200, offset: 0 }),
  })));
  const jadwalQ = createQuery(toStore(() => ({
    queryKey: ['jadwal', kebaktianID],
    queryFn: () => kebaktianApi.getJadwal(kebaktianID),
  })));

  // form: { [service_type_id]: { pelayan_id, catatan } }
  let slots = $state<Record<number, { pelayan_id: number | null; catatan: string }>>({});

  $effect(() => {
    const sts = $stQ.data?.data ?? [];
    const existing = $jadwalQ.data?.data ?? [];
    if (sts.length === 0) return;
    const next: typeof slots = {};
    for (const st of sts) {
      const ex = existing.find((j) => j.service_type_id === st.id);
      next[st.id] = {
        pelayan_id: ex?.pelayan_id ?? null,
        catatan: ex?.catatan ?? '',
      };
    }
    slots = next;
  });

  const saveMut = createMutation({
    mutationFn: () => {
      const payload: JadwalSlotWrite[] = Object.entries(slots).map(([stID, slot]) => ({
        service_type_id: Number(stID),
        pelayan_id: slot.pelayan_id,
        catatan: emptyToNull(slot.catatan),
      }));
      return kebaktianApi.replaceJadwal(kebaktianID, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jadwal', kebaktianID] });
      alert('Jadwal tersimpan.');
    },
    onError: (e) => {
      if (e instanceof ApiError) alert(e.message);
      else alert('Gagal menyimpan jadwal.');
    },
  });

  function pelayanForService(stID: number) {
    const all = $pelayanQ.data?.data ?? [];
    return all.filter((p) => p.service_type_ids?.includes(stID));
  }
</script>

<ProtectedRoute>
  {#snippet children()}
    <a href="/kebaktian" use:link class="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground">
      <ChevronLeft class="h-4 w-4" /> Kembali
    </a>

    {#if $kebaktianQ.data}
      <h1 class="mb-1 text-2xl font-bold">{$kebaktianQ.data.nama}</h1>
      <p class="mb-6 text-sm text-muted-foreground">{formatDateTime($kebaktianQ.data.waktu_mulai)}</p>
    {/if}

    {#if $stQ.isLoading || $pelayanQ.isLoading || $jadwalQ.isLoading}
      <p>Memuat…</p>
    {:else if !$stQ.data || $stQ.data.data.length === 0}
      <p class="text-sm text-muted-foreground">
        Belum ada Jenis Pelayanan. Tambahkan dulu di halaman <a href="/service-types" use:link class="underline">Jenis Pelayanan</a>.
      </p>
    {:else}
      <div class="space-y-2">
        {#each $stQ.data.data as st (st.id)}
          {@const candidates = pelayanForService(st.id)}
          <div class="card p-3">
            <div class="mb-2 flex items-center justify-between">
              <p class="font-medium">{st.nama}</p>
              {#if st.deskripsi}<p class="text-xs text-muted-foreground">{st.deskripsi}</p>{/if}
            </div>
            <div class="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr]">
              <select class="input" bind:value={slots[st.id].pelayan_id}>
                <option value={null}>-- kosong --</option>
                {#each candidates as p (p.id)}
                  <option value={p.id}>{p.nama_lengkap}</option>
                {/each}
              </select>
              <input
                class="input"
                placeholder="Catatan (opsional)"
                bind:value={slots[st.id].catatan}
                maxlength="500"
              />
            </div>
          </div>
        {/each}
      </div>

      <button class="btn-primary mt-4 w-full md:w-auto" onclick={() => $saveMut.mutate()} disabled={$saveMut.isPending}>
        <Save class="h-4 w-4" /> {$saveMut.isPending ? 'Menyimpan…' : 'Simpan Jadwal'}
      </button>
    {/if}
  {/snippet}
</ProtectedRoute>
