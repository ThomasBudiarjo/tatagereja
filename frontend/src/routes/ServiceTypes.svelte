<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { serviceTypesApi, type ServiceTypeWrite } from '$lib/api/service-types';
  import { pelayanApi } from '$lib/api/pelayan';
  import { ApiError } from '$lib/api/client';
  import { push } from 'svelte-spa-router';
  import { emptyToNull } from '$lib/utils/format';
  import { toast } from '$lib/stores/toast.svelte';
  import { viewport } from '$lib/stores/viewport.svelte';
  import type { ServiceType } from '$lib/types';
  import TopBar from '$lib/components/TopBar.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/Field.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';
  import DesktopDialog from '$lib/components/DesktopDialog.svelte';

  const qc = useQueryClient();

  const listQ = createQuery(
    toStore(() => ({
      queryKey: ['service-types'],
      queryFn: () => serviceTypesApi.list(),
    })),
  );
  const pelayanQ = createQuery(
    toStore(() => ({
      queryKey: ['pelayan', 'all'],
      queryFn: () => pelayanApi.list({ limit: 500, offset: 0 }),
    })),
  );

  function pelayanCountForServiceType(stId: number): number {
    return ($pelayanQ.data?.data ?? []).filter((p) => (p.service_type_ids ?? []).includes(stId)).length;
  }

  let showForm = $state(false);
  let editing = $state<ServiceType | null>(null);
  let form = $state<ServiceTypeWrite>({ nama: '', deskripsi: null, urutan: 0 });
  let errors = $state<Record<string, string>>({});

  function openCreate() {
    editing = null;
    form = { nama: '', deskripsi: null, urutan: ($listQ.data?.data?.length ?? 0) + 1 };
    errors = {};
    showForm = true;
  }
  function openEdit(s: ServiceType) {
    editing = s;
    form = { nama: s.nama, deskripsi: s.deskripsi, urutan: s.urutan };
    errors = {};
    showForm = true;
  }

  const saveMut = createMutation({
    mutationFn: async (input: ServiceTypeWrite) => {
      const payload: ServiceTypeWrite = {
        nama: input.nama.trim(),
        deskripsi: emptyToNull(input.deskripsi ?? ''),
        urutan: Number(input.urutan ?? 0),
      };
      if (editing) return serviceTypesApi.update(editing.id, payload);
      return serviceTypesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-types'] });
      toast.show(editing ? 'Jenis pelayanan diperbarui' : 'Jenis pelayanan ditambahkan');
      showForm = false;
    },
    onError: (e) => {
      if (e instanceof ApiError) errors = e.fields ?? { nama: e.message };
    },
  });

  const deleteMut = createMutation({
    mutationFn: (id: number) => serviceTypesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-types'] }),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        toast.show('Tidak dapat hapus: masih dipakai pada jadwal.');
      } else {
        toast.show('Gagal menghapus.');
      }
    },
  });

  function submit(e?: Event) {
    e?.preventDefault();
    errors = {};
    if (!form.nama.trim()) {
      errors = { nama: 'Wajib diisi' };
      return;
    }
    $saveMut.mutate(form);
  }

  function iconForName(name: string): 'mic' | 'music' | 'doc' | 'person' | 'sparkle' | 'tag' {
    const n = name.toLowerCase();
    if (n.includes('pujian') || n.includes('worship') || n.includes('pemimpin')) return 'mic';
    if (n.includes('singer') || n.includes('musisi') || n.includes('music')) return 'music';
    if (n.includes('multimedia') || n.includes('slide') || n.includes('sound')) return 'doc';
    if (n.includes('usher') || n.includes('penyambut')) return 'person';
    if (n.includes('doa')) return 'sparkle';
    return 'tag';
  }

  function back() {
    history.length > 1 ? history.back() : push('/more');
  }
</script>

{#snippet stForm()}
  <form onsubmit={submit} style="display: flex; flex-direction: column; gap: 14px;">
    <Field label="Nama" required error={errors.nama}>
      <input class="input" bind:value={form.nama} placeholder="contoh: Worship Leader" />
    </Field>
    <Field label="Deskripsi">
      <input class="input" bind:value={form.deskripsi} />
    </Field>
    <Field label="Urutan" hint="Menentukan urutan tampil di jadwal">
      <input class="input" type="number" bind:value={form.urutan} />
    </Field>
  </form>
{/snippet}

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <!-- ════════ DESKTOP ════════ -->
      <DesktopLayout title="Jenis Pelayanan" subtitle="Atur jenis pelayanan yang dipakai di kebaktian">
        {#snippet actions()}
          <button class="dt-btn dt-btn-primary" type="button" onclick={openCreate}>
            <Icon name="plus" size={16} /> Tambah jenis
          </button>
        {/snippet}

        <div class="dt-table-wrap" style="max-width: 720px;">
          <table class="dt-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Deskripsi</th>
                <th class="num-r">Urutan</th>
                <th class="num-r">Pelayan</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each $listQ.data?.data ?? [] as st (st.id)}
                <tr onclick={() => openEdit(st)}>
                  <td>
                    <div class="dt-cell-primary">
                      <div
                        style="width: 28px; height: 28px; border-radius: 7px;
                               background: var(--surface-2); color: var(--ink-2);
                               display: flex; align-items: center; justify-content: center;"
                      >
                        <Icon name={iconForName(st.nama)} size={14} />
                      </div>
                      {st.nama}
                    </div>
                  </td>
                  <td style="color: var(--ink-2);">{st.deskripsi ?? '—'}</td>
                  <td class="num-r num">{st.urutan}</td>
                  <td class="num-r num">{pelayanCountForServiceType(st.id)}</td>
                  <td style="width: 80px; text-align: right;">
                    <button
                      class="icon-btn"
                      type="button"
                      style="width: 28px; height: 28px;"
                      onclick={(e) => {
                        e.stopPropagation();
                        openEdit(st);
                      }}
                      aria-label="Ubah"
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      class="icon-btn"
                      type="button"
                      style="width: 28px; height: 28px; color: var(--danger);"
                      onclick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Hapus "${st.nama}"?`)) $deleteMut.mutate(st.id);
                      }}
                      aria-label="Hapus"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              {/each}
              {#if ($listQ.data?.data ?? []).length === 0}
                <tr>
                  <td colspan="5" style="padding: 32px; text-align: center; color: var(--ink-3);">
                    {$listQ.isLoading ? 'Memuat…' : 'Belum ada jenis pelayanan.'}
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </DesktopLayout>

      <DesktopDialog
        open={showForm}
        title={editing ? 'Ubah jenis pelayanan' : 'Tambah jenis pelayanan'}
        width={480}
        onClose={() => (showForm = false)}
      >
        {@render stForm()}
        {#snippet footer()}
          <button class="dt-btn dt-btn-ghost" type="button" onclick={() => (showForm = false)}>Batal</button>
          <button
            class="dt-btn dt-btn-primary"
            type="button"
            disabled={$saveMut.isPending}
            onclick={() => submit()}
          >
            {$saveMut.isPending ? 'Menyimpan…' : editing ? 'Simpan' : 'Tambah'}
          </button>
        {/snippet}
      </DesktopDialog>
    {:else}
      <!-- ════════ MOBILE (unchanged) ════════ -->
      <div class="app">
        <TopBar title="Jenis pelayanan">
          {#snippet leading()}
            <button class="icon-btn" type="button" onclick={back} aria-label="Kembali"><Icon name="back" /></button>
          {/snippet}
        </TopBar>

        <div class="app-scroll" style="padding-bottom: 80px;">
          <div style="padding: 8px 18px 4px; font-size: 13px; color: var(--ink-3);">
            Atur jenis pelayanan yang ada di gereja Anda.
          </div>
          <div class="list">
            {#if $listQ.isLoading}
              <div class="row" style="justify-content: center; color: var(--ink-3);">Memuat…</div>
            {:else if !$listQ.data || $listQ.data.data.length === 0}
              <div class="empty">
                <div class="empty-icon"><Icon name="tag" /></div>
                <div class="empty-title">Belum ada jenis pelayanan</div>
                <div class="empty-sub">Contoh: Worship Leader, Singer, Musisi, Multimedia.</div>
              </div>
            {:else}
              {#each $listQ.data.data as st (st.id)}
                <div class="row">
                  <div
                    style="width: 36px; height: 36px; border-radius: 10px;
                           background: var(--surface-2); color: var(--ink-2);
                           display: flex; align-items: center; justify-content: center;"
                  >
                    <Icon name={iconForName(st.nama)} size={18} />
                  </div>
                  <div class="row-body">
                    <div class="row-title">{st.nama}</div>
                    {#if st.deskripsi}<div class="row-sub">{st.deskripsi}</div>{/if}
                  </div>
                  <button class="icon-btn" type="button" onclick={() => openEdit(st)} aria-label="Ubah">
                    <Icon name="edit" />
                  </button>
                  <button
                    class="icon-btn"
                    type="button"
                    style="color: var(--danger);"
                    onclick={() => {
                      if (confirm(`Hapus "${st.nama}"?`)) $deleteMut.mutate(st.id);
                    }}
                    aria-label="Hapus"
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <button class="fab with-label" type="button" onclick={openCreate}>
          <Icon name="plus" /> Tambah
        </button>

        <Sheet open={showForm} onClose={() => (showForm = false)} title={editing ? 'Ubah jenis pelayanan' : 'Tambah jenis pelayanan'}>
          {@render stForm()}

          {#snippet footer()}
            <button class="btn btn-ghost" type="button" style="flex: 1;" onclick={() => (showForm = false)}>
              Batal
            </button>
            <button
              class="btn btn-primary"
              type="button"
              style="flex: 2;"
              disabled={$saveMut.isPending}
              onclick={() => submit()}
            >
              {$saveMut.isPending ? 'Menyimpan…' : editing ? 'Simpan' : 'Tambah'}
            </button>
          {/snippet}
        </Sheet>
      </div>
    {/if}
  {/snippet}
</ProtectedRoute>
