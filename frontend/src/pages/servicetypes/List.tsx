import { createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { ApiError } from "../../api/client";
import type { ServiceType, ServiceTypeReq } from "../../api/types";
import {
  useServiceTypes,
  useCreateServiceType,
  useUpdateServiceType,
  useDeleteServiceType,
} from "../../lib/servicetypes";
import {
  PageHeader,
  PrimaryButton,
  TextField,
  TextArea,
  EmptyState,
  ErrorState,
} from "../../components/ui";
import { IconPlus, IconTrash, IconPencil } from "../../components/icons";

const emptyForm: ServiceTypeReq = { nama: "", deskripsi: "", urutan: "" };

export default function ServiceTypeList() {
  const list = useServiceTypes();
  const create = useCreateServiceType();
  const update = useUpdateServiceType();
  const del = useDeleteServiceType();

  const [form, setForm] = createStore<ServiceTypeReq>({ ...emptyForm });
  const [errors, setErrors] = createSignal<Record<string, string>>({});

  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [editForm, setEditForm] = createStore<ServiceTypeReq>({ ...emptyForm });
  const [editErrors, setEditErrors] = createSignal<Record<string, string>>({});

  const fieldErr = (err: unknown, set: (e: Record<string, string>) => void) => {
    if (err instanceof ApiError && err.fieldErrors) set(err.fieldErrors);
  };

  const submitNew = (e: Event) => {
    e.preventDefault();
    setErrors({});
    create.mutate({ ...form }, {
      onSuccess: () => setForm({ ...emptyForm }),
      onError: (err) => fieldErr(err, setErrors),
    });
  };

  const startEdit = (s: ServiceType) => {
    setEditErrors({});
    setEditForm({ nama: s.nama, deskripsi: s.deskripsi ?? "", urutan: String(s.urutan) });
    setEditingId(s.id);
  };

  const submitEdit = (e: Event, id: number) => {
    e.preventDefault();
    setEditErrors({});
    update.mutate({ id, body: { ...editForm } }, {
      onSuccess: () => setEditingId(null),
      onError: (err) => fieldErr(err, setEditErrors),
    });
  };

  const remove = (s: ServiceType) => {
    if (!confirm(`Hapus ${s.nama}?`)) return;
    del.mutate(s.id, {
      onError: (err) =>
        alert(err instanceof ApiError ? err.message : "Gagal menghapus jenis pelayanan"),
    });
  };

  return (
    <div class="mx-auto max-w-2xl">
      <PageHeader title="Tipe Pelayanan" />

      <form onSubmit={submitNew} class="mb-5 space-y-3 rounded-2xl border border-line bg-surface-raised p-4">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <TextField
            label="Nama"
            placeholder="cth. Pemusik"
            value={form.nama}
            onInput={(e) => setForm("nama", e.currentTarget.value)}
            error={errors().Nama}
          />
          <TextField
            label="Urutan"
            type="number"
            value={form.urutan}
            onInput={(e) => setForm("urutan", e.currentTarget.value)}
            error={errors().Urutan}
            class="sm:w-24"
          />
        </div>
        <TextField
          label="Deskripsi"
          value={form.deskripsi}
          onInput={(e) => setForm("deskripsi", e.currentTarget.value)}
          error={errors().Deskripsi}
        />
        <div class="flex justify-end">
          <PrimaryButton type="submit" loading={create.isPending}>
            <IconPlus class="h-4 w-4" />
            Tambah
          </PrimaryButton>
        </div>
      </form>

      <Show when={!list.isError} fallback={<ErrorState message="Gagal memuat jenis pelayanan." />}>
        <Show
          when={list.data}
          fallback={<div class="h-24 animate-pulse rounded-xl bg-surface-muted" />}
        >
          <Show
            when={list.data!.items.length > 0}
            fallback={<EmptyState message="Belum ada jenis pelayanan." />}
          >
            <ul class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-raised">
              <For each={list.data!.items}>
                {(s) => (
                  <li class="px-4 py-3">
                    <Show
                      when={editingId() === s.id}
                      fallback={
                        <div class="flex items-center justify-between gap-3">
                          <div class="min-w-0">
                            <p class="truncate text-sm font-medium text-ink">
                              <span class="font-num mr-2 text-ink-soft">{s.urutan}.</span>
                              {s.nama}
                            </p>
                            <Show when={s.deskripsi}>
                              <p class="truncate text-xs text-ink-soft">{s.deskripsi}</p>
                            </Show>
                          </div>
                          <div class="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(s)}
                              class="rounded-lg p-2 text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
                              aria-label="Edit"
                            >
                              <IconPencil class="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(s)}
                              class="rounded-lg p-2 text-ink-soft transition-colors hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Hapus"
                            >
                              <IconTrash class="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      }
                    >
                      <form onSubmit={(e) => submitEdit(e, s.id)} class="space-y-3">
                        <div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                          <TextField
                            label="Nama"
                            value={editForm.nama}
                            onInput={(e) => setEditForm("nama", e.currentTarget.value)}
                            error={editErrors().Nama}
                          />
                          <TextField
                            label="Urutan"
                            type="number"
                            value={editForm.urutan}
                            onInput={(e) => setEditForm("urutan", e.currentTarget.value)}
                            error={editErrors().Urutan}
                            class="sm:w-24"
                          />
                        </div>
                        <TextArea
                          label="Deskripsi"
                          value={editForm.deskripsi}
                          onInput={(e) => setEditForm("deskripsi", e.currentTarget.value)}
                          error={editErrors().Deskripsi}
                        />
                        <div class="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            class="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-muted"
                          >
                            Batal
                          </button>
                          <PrimaryButton type="submit" loading={update.isPending}>
                            Simpan
                          </PrimaryButton>
                        </div>
                      </form>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
