import { createSignal, createEffect, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { A, useParams, useNavigate } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { api, ApiError } from "../../api/client";
import type { Kebaktian, KebaktianReq } from "../../api/types";
import { useCreateKebaktian, useUpdateKebaktian } from "../../lib/kebaktian";
import { TextField, TextArea, PrimaryButton, ErrorState } from "../../components/ui";
import { IconArrowLeft } from "../../components/icons";

const empty: KebaktianReq = {
  nama: "",
  waktu_mulai_local: "",
  lokasi: "",
  tema: "",
  pengkhotbah: "",
  catatan: "",
};

export default function KebaktianForm() {
  const params = useParams();
  const navigate = useNavigate();
  const isEdit = () => params.id !== undefined;

  const [form, setForm] = createStore<KebaktianReq>({ ...empty });
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [formError, setFormError] = createSignal("");

  const detail = useQuery(() => ({
    queryKey: ["kebaktian", "detail", Number(params.id)],
    queryFn: () => api.get<{ kebaktian: Kebaktian }>(`/kebaktian/${params.id}`),
    enabled: isEdit(),
  }));

  createEffect(() => {
    const k = detail.data?.kebaktian;
    if (!k) return;
    setForm({
      nama: k.nama,
      waktu_mulai_local: k.waktu_mulai_local,
      lokasi: k.lokasi ?? "",
      tema: k.tema ?? "",
      pengkhotbah: k.pengkhotbah ?? "",
      catatan: k.catatan ?? "",
    });
  });

  const create = useCreateKebaktian();
  const update = useUpdateKebaktian();
  const pending = () => create.isPending || update.isPending;

  const onError = (err: unknown) => {
    if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
    else setFormError(err instanceof Error ? err.message : "Gagal menyimpan");
  };

  const submit = (e: Event) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    const body: KebaktianReq = { ...form };
    if (isEdit()) {
      const id = Number(params.id);
      update.mutate({ id, body }, { onSuccess: () => navigate(`/kebaktian/${id}`, { replace: true }), onError });
    } else {
      create.mutate(body, {
        onSuccess: (d) => navigate(`/kebaktian/${d.kebaktian.id}`, { replace: true }),
        onError,
      });
    }
  };

  return (
    <div class="mx-auto max-w-2xl">
      <A
        href={isEdit() ? `/kebaktian/${params.id}` : "/kebaktian"}
        class="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <IconArrowLeft class="h-4 w-4" />
        Kembali
      </A>
      <h1 class="mb-5 text-2xl font-semibold tracking-tight text-ink">
        {isEdit() ? "Edit Kebaktian" : "Tambah Kebaktian"}
      </h1>

      <form onSubmit={submit} class="space-y-4 rounded-2xl border border-line bg-surface-raised p-6">
        <Show when={formError()}>
          <ErrorState message={formError()} />
        </Show>
        <TextField
          label="Nama"
          value={form.nama}
          onInput={(e) => setForm("nama", e.currentTarget.value)}
          error={errors().Nama}
          required
        />
        <TextField
          label="Waktu Mulai"
          type="datetime-local"
          value={form.waktu_mulai_local}
          onInput={(e) => setForm("waktu_mulai_local", e.currentTarget.value)}
          error={errors().WaktuMulai}
          required
        />
        <div class="grid grid-cols-2 gap-4">
          <TextField
            label="Lokasi"
            value={form.lokasi}
            onInput={(e) => setForm("lokasi", e.currentTarget.value)}
            error={errors().Lokasi}
          />
          <TextField
            label="Pengkhotbah"
            value={form.pengkhotbah}
            onInput={(e) => setForm("pengkhotbah", e.currentTarget.value)}
            error={errors().Pengkhotbah}
          />
        </div>
        <TextField
          label="Tema"
          value={form.tema}
          onInput={(e) => setForm("tema", e.currentTarget.value)}
          error={errors().Tema}
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
