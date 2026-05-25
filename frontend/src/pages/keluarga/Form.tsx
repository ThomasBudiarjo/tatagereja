import { createSignal, createEffect, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { A, useParams, useNavigate } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { api, ApiError } from "../../api/client";
import type { Keluarga, KeluargaReq } from "../../api/types";
import { useCreateKeluarga, useUpdateKeluarga } from "../../lib/keluarga";
import { TextField, TextArea, PrimaryButton, ErrorState } from "../../components/ui";
import { IconArrowLeft } from "../../components/icons";

export default function KeluargaForm() {
  const params = useParams();
  const navigate = useNavigate();
  const isEdit = () => params.id !== undefined;

  const [form, setForm] = createStore<KeluargaReq>({ nama_keluarga: "", alamat: "", catatan: "" });
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [formError, setFormError] = createSignal("");

  const detail = useQuery(() => ({
    queryKey: ["keluarga", "detail", Number(params.id)],
    queryFn: () => api.get<{ keluarga: Keluarga }>(`/keluarga/${params.id}`),
    enabled: isEdit(),
  }));

  createEffect(() => {
    const k = detail.data?.keluarga;
    if (!k) return;
    setForm({ nama_keluarga: k.nama_keluarga, alamat: k.alamat ?? "", catatan: k.catatan ?? "" });
  });

  const create = useCreateKeluarga();
  const update = useUpdateKeluarga();
  const pending = () => create.isPending || update.isPending;

  const onError = (err: unknown) => {
    if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
    else setFormError(err instanceof Error ? err.message : "Gagal menyimpan");
  };

  const submit = (e: Event) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    const body: KeluargaReq = { ...form };
    if (isEdit()) {
      const id = Number(params.id);
      update.mutate(
        { id, body },
        { onSuccess: () => navigate(`/keluarga/${id}`, { replace: true }), onError },
      );
    } else {
      create.mutate(body, {
        onSuccess: (d) => navigate(`/keluarga/${d.keluarga.id}`, { replace: true }),
        onError,
      });
    }
  };

  return (
    <div class="mx-auto max-w-2xl">
      <A
        href={isEdit() ? `/keluarga/${params.id}` : "/keluarga"}
        class="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <IconArrowLeft class="h-4 w-4" />
        Kembali
      </A>
      <h1 class="mb-5 text-2xl font-semibold tracking-tight text-ink">
        {isEdit() ? "Edit Keluarga" : "Tambah Keluarga"}
      </h1>

      <form onSubmit={submit} class="space-y-4 rounded-2xl border border-line bg-surface-raised p-6">
        <Show when={formError()}>
          <ErrorState message={formError()} />
        </Show>
        <TextField
          label="Nama Keluarga"
          value={form.nama_keluarga}
          onInput={(e) => setForm("nama_keluarga", e.currentTarget.value)}
          error={errors().NamaKeluarga}
          required
        />
        <TextArea
          label="Alamat"
          value={form.alamat}
          onInput={(e) => setForm("alamat", e.currentTarget.value)}
          error={errors().Alamat}
        />
        <TextArea
          label="Catatan"
          value={form.catatan}
          onInput={(e) => setForm("catatan", e.currentTarget.value)}
          error={errors().Catatan}
        />
        <div class="flex justify-end gap-2 pt-2">
          <PrimaryButton type="submit" loading={pending()}>
            Simpan
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
