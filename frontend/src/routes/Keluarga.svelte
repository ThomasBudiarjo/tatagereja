<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toStore } from 'svelte/store';
  import { keluargaApi, type KeluargaWrite } from '$lib/api/keluarga';
  import { jemaatApi } from '$lib/api/jemaat';
  import { ApiError } from '$lib/api/client';
  import { push } from 'svelte-spa-router';
  import { emptyToNull } from '$lib/utils/format';
  import { toast } from '$lib/stores/toast.svelte';
  import { viewport } from '$lib/stores/viewport.svelte';
  import type { Keluarga } from '$lib/types';
  import TopBar from '$lib/components/TopBar.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/Field.svelte';
  import DesktopLayout from '$lib/components/DesktopLayout.svelte';
  import DesktopDialog from '$lib/components/DesktopDialog.svelte';

  const qc = useQueryClient();

  const listQ = createQuery(
    toStore(() => ({
      queryKey: ['keluarga', 'all'],
      queryFn: () => keluargaApi.list({ limit: 200, offset: 0 }),
    })),
  );
  const jemaatQ = createQuery(
    toStore(() => ({
      queryKey: ['jemaat', 'all-for-keluarga'],
      queryFn: () => jemaatApi.list({ limit: 500, offset: 0 }),
    })),
  );

  function membersOf(id: number) {
    return ($jemaatQ.data?.data ?? []).filter((j) => j.keluarga_id === id);
  }

  const totalAnggota = $derived(
    ($jemaatQ.data?.data ?? []).filter((j) => j.keluarga_id != null).length,
  );

  let showForm = $state(false);
  let editing = $state<Keluarga | null>(null);
  let form = $state<KeluargaWrite>({ nama_keluarga: '', alamat: null, catatan: null });
  let errors = $state<Record<string, string>>({});

  function openCreate() {
    editing = null;
    form = { nama_keluarga: '', alamat: null, catatan: null };
    errors = {};
    showForm = true;
  }

  function openEdit(k: Keluarga) {
    editing = k;
    form = { nama_keluarga: k.nama_keluarga, alamat: k.alamat, catatan: k.catatan };
    errors = {};
    showForm = true;
  }

  const saveMut = createMutation({
    mutationFn: async (input: KeluargaWrite) => {
      const payload = {
        nama_keluarga: input.nama_keluarga.trim(),
        alamat: emptyToNull(input.alamat ?? ''),
        catatan: emptyToNull(input.catatan ?? ''),
      };
      if (editing) return keluargaApi.update(editing.id, payload);
      return keluargaApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keluarga'] });
      toast.show(editing ? 'Keluarga diperbarui' : 'Keluarga ditambahkan');
      showForm = false;
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) errors = e.fields;
    },
  });

  function submit(e?: Event) {
    e?.preventDefault();
    errors = {};
    if (!form.nama_keluarga.trim()) {
      errors = { nama_keluarga: 'Wajib diisi' };
      return;
    }
    $saveMut.mutate(form);
  }

  function back() {
    history.length > 1 ? history.back() : push('/more');
  }
</script>

{#snippet keluargaForm()}
  <form onsubmit={submit} style="display: flex; flex-direction: column; gap: 14px;">
    <Field label="Nama keluarga" required error={errors.nama_keluarga}>
      <input class="input" bind:value={form.nama_keluarga} placeholder="contoh: Keluarga Santoso" />
    </Field>
    <Field label="Alamat">
      <input class="input" bind:value={form.alamat} />
    </Field>
    <Field label="Catatan">
      <textarea class="textarea" rows="3" bind:value={form.catatan}></textarea>
    </Field>
  </form>
{/snippet}

<ProtectedRoute>
  {#snippet children()}
    {#if viewport.isDesktop}
      <!-- ════════ DESKTOP ════════ -->
      <DesktopLayout
        title="Keluarga"
        subtitle={`${$listQ.data?.data?.length ?? 0} keluarga · ${totalAnggota} anggota terdaftar`}
      >
        {#snippet actions()}
          <button class="dt-btn dt-btn-primary" type="button" onclick={openCreate}>
            <Icon name="plus" size={16} /> Tambah keluarga
          </button>
        {/snippet}

        <div class="dt-table-wrap">
          <table class="dt-table">
            <thead>
              <tr>
                <th>Nama keluarga</th>
                <th>Alamat</th>
                <th>Anggota</th>
                <th>Catatan</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each $listQ.data?.data ?? [] as k (k.id)}
                {@const members = membersOf(k.id)}
                <tr onclick={() => push(`/keluarga/${k.id}`)}>
                  <td>
                    <div class="dt-cell-primary">
                      <div
                        style="width: 32px; height: 32px; border-radius: 9px;
                               background: var(--accent-soft); color: var(--accent-ink);
                               display: flex; align-items: center; justify-content: center;"
                      >
                        <Icon name="home2" size={16} />
                      </div>
                      {k.nama_keluarga}
                    </div>
                  </td>
                  <td style="color: var(--ink-2);">{k.alamat ?? '—'}</td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div style="display: flex;">
                        {#each members.slice(0, 4) as m, i (m.id)}
                          <div
                            style="margin-left: {i === 0
                              ? 0
                              : -8}px; border: 2px solid var(--surface); border-radius: 999px;"
                          >
                            <Avatar name={m.nama_lengkap} size="sm" />
                          </div>
                        {/each}
                      </div>
                      <span style="font-size: 12px; color: var(--ink-3);">{members.length} orang</span>
                    </div>
                  </td>
                  <td style="color: var(--ink-3); font-size: 12px;">{k.catatan || '—'}</td>
                  <td style="width: 40px;">
                    <button
                      class="icon-btn"
                      type="button"
                      style="width: 28px; height: 28px;"
                      onclick={(e) => {
                        e.stopPropagation();
                        openEdit(k);
                      }}
                      aria-label="Ubah"
                    >
                      <Icon name="more" size={16} />
                    </button>
                  </td>
                </tr>
              {/each}
              {#if ($listQ.data?.data ?? []).length === 0}
                <tr>
                  <td colspan="5" style="padding: 32px; text-align: center; color: var(--ink-3);">
                    {$listQ.isLoading ? 'Memuat…' : 'Belum ada keluarga.'}
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </DesktopLayout>

      <DesktopDialog
        open={showForm}
        title={editing ? 'Edit keluarga' : 'Tambah keluarga baru'}
        width={480}
        onClose={() => (showForm = false)}
      >
        {@render keluargaForm()}
        {#snippet footer()}
          <button class="dt-btn dt-btn-ghost" type="button" onclick={() => (showForm = false)}>
            Batal
          </button>
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
        <TopBar title="Keluarga">
          {#snippet leading()}
            <button class="icon-btn" type="button" onclick={back} aria-label="Kembali"><Icon name="back" /></button>
          {/snippet}
        </TopBar>

        <div class="app-scroll" style="padding-bottom: 80px;">
          <div style="padding: 8px 18px 4px; font-size: 13px; color: var(--ink-3);">
            {$listQ.data?.data?.length ?? 0} keluarga terdaftar
          </div>
          <div class="list">
            {#if $listQ.isLoading}
              <div class="row" style="justify-content: center; color: var(--ink-3);">Memuat…</div>
            {:else if !$listQ.data || $listQ.data.data.length === 0}
              <div class="empty">
                <div class="empty-icon"><Icon name="home2" /></div>
                <div class="empty-title">Belum ada keluarga</div>
                <div class="empty-sub">Tambahkan keluarga untuk mengelompokkan jemaat dalam satu unit.</div>
              </div>
            {:else}
              {#each $listQ.data.data as k (k.id)}
                {@const members = membersOf(k.id)}
                <button class="row row-tap" type="button" onclick={() => push(`/keluarga/${k.id}`)}>
                  <div
                    style="width: 44px; height: 44px; border-radius: 12px;
                           background: var(--accent-soft); color: var(--accent-ink);
                           display: flex; align-items: center; justify-content: center;"
                  >
                    <Icon name="home2" size={20} />
                  </div>
                  <div class="row-body">
                    <div class="row-title">{k.nama_keluarga}</div>
                    <div class="row-sub">
                      {members.length} anggota{k.alamat ? ` · ${k.alamat}` : ''}
                    </div>
                  </div>
                  <div style="display: flex; margin-right: 4px;">
                    {#each members.slice(0, 3) as m, i (m.id)}
                      <div style="margin-left: {i === 0 ? 0 : -8}px;">
                        <Avatar name={m.nama_lengkap} size="sm" />
                      </div>
                    {/each}
                  </div>
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <button class="fab with-label" type="button" onclick={openCreate}>
          <Icon name="plus" /> Tambah
        </button>

        <Sheet open={showForm} onClose={() => (showForm = false)} title={editing ? 'Edit keluarga' : 'Tambah keluarga'}>
          {@render keluargaForm()}

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
