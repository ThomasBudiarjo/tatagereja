import { createSignal, createEffect, Show, For } from "solid-js";
import { createStore } from "solid-js/store";
import { A, useParams, useNavigate } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { api, ApiError } from "../../api/client";
import type { Jemaat, JemaatReq } from "../../api/types";
import { useCreateJemaat, useUpdateJemaat } from "../../lib/jemaat";
import { useKeluargaOptions } from "../../lib/keluarga";
import { TextField, TextArea, SelectField, PrimaryButton, ErrorState } from "../../components/ui";
import { IconArrowLeft } from "../../components/icons";

const empty: JemaatReq = {
  nama_lengkap: "",
  nama_panggilan: "",
  jenis_kelamin: "",
  tanggal_lahir: "",
  tempat_lahir: "",
  alamat: "",
  nomor_telepon: "",
  email: "",
  status_pernikahan: "",
  tanggal_baptis: "",
  tanggal_sidi: "",
  keluarga_id: null,
  catatan: "",
};

export default function JemaatForm() {
  const params = useParams();
  const navigate = useNavigate();
  const isEdit = () => params.id !== undefined;

  const [form, setForm] = createStore<JemaatReq>({ ...empty });
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [formError, setFormError] = createSignal("");

  const detail = useQuery(() => ({
    queryKey: ["jemaat", "detail", Number(params.id)],
    queryFn: () => api.get<{ jemaat: Jemaat }>(`/jemaat/${params.id}`),
    enabled: isEdit(),
  }));

  createEffect(() => {
    const j = detail.data?.jemaat;
    if (!j) return;
    setForm({
      nama_lengkap: j.nama_lengkap,
      nama_panggilan: j.nama_panggilan ?? "",
      jenis_kelamin: j.jenis_kelamin ?? "",
      tanggal_lahir: j.tanggal_lahir ?? "",
      tempat_lahir: j.tempat_lahir ?? "",
      alamat: j.alamat ?? "",
      nomor_telepon: j.nomor_telepon ?? "",
      email: j.email ?? "",
      status_pernikahan: j.status_pernikahan ?? "",
      tanggal_baptis: j.tanggal_baptis ?? "",
      tanggal_sidi: j.tanggal_sidi ?? "",
      keluarga_id: j.keluarga_id,
      catatan: j.catatan ?? "",
    });
  });

  const options = useKeluargaOptions();
  const create = useCreateJemaat();
  const update = useUpdateJemaat();
  const pending = () => create.isPending || update.isPending;

  const onError = (err: unknown) => {
    if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
    else setFormError(err instanceof Error ? err.message : "Gagal menyimpan");
  };

  const submit = (e: Event) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    const body: JemaatReq = { ...form };
    if (isEdit()) {
      update.mutate(
        { id: Number(params.id), body },
        { onSuccess: (d) => navigate(`/jemaat/${d.jemaat.id}`, { replace: true }), onError },
      );
    } else {
      create.mutate(body, {
        onSuccess: (d) => navigate(`/jemaat/${d.jemaat.id}`, { replace: true }),
        onError,
      });
    }
  };

  return (
    <div class="mx-auto max-w-2xl">
      <A
        href={isEdit() ? `/jemaat/${params.id}` : "/jemaat"}
        class="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <IconArrowLeft class="h-4 w-4" />
        Kembali
      </A>
      <h1 class="mb-5 text-2xl font-semibold tracking-tight text-ink">
        {isEdit() ? "Edit Jemaat" : "Tambah Jemaat"}
      </h1>

      <form onSubmit={submit} class="space-y-4 rounded-2xl border border-line bg-surface-raised p-6">
        <Show when={formError()}>
          <ErrorState message={formError()} />
        </Show>

        <TextField
          label="Nama Lengkap"
          value={form.nama_lengkap}
          onInput={(e) => setForm("nama_lengkap", e.currentTarget.value)}
          error={errors().NamaLengkap}
          required
        />
        <TextField
          label="Nama Panggilan"
          value={form.nama_panggilan}
          onInput={(e) => setForm("nama_panggilan", e.currentTarget.value)}
          error={errors().NamaPanggilan}
        />
        <div class="grid grid-cols-2 gap-4">
          <SelectField
            label="Jenis Kelamin"
            value={form.jenis_kelamin}
            onChange={(e) => setForm("jenis_kelamin", e.currentTarget.value)}
            error={errors().JenisKelamin}
          >
            <option value="">-</option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </SelectField>
          <SelectField
            label="Status Pernikahan"
            value={form.status_pernikahan}
            onChange={(e) => setForm("status_pernikahan", e.currentTarget.value)}
            error={errors().StatusPernikahan}
          >
            <option value="">-</option>
            <option value="belum_menikah">Belum menikah</option>
            <option value="menikah">Menikah</option>
            <option value="cerai">Cerai</option>
            <option value="duda">Duda</option>
            <option value="janda">Janda</option>
          </SelectField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <TextField
            label="Tanggal Lahir"
            type="date"
            value={form.tanggal_lahir}
            onInput={(e) => setForm("tanggal_lahir", e.currentTarget.value)}
            error={errors().TanggalLahir}
          />
          <TextField
            label="Tempat Lahir"
            value={form.tempat_lahir}
            onInput={(e) => setForm("tempat_lahir", e.currentTarget.value)}
            error={errors().TempatLahir}
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <TextField
            label="Tanggal Baptis"
            type="date"
            value={form.tanggal_baptis}
            onInput={(e) => setForm("tanggal_baptis", e.currentTarget.value)}
            error={errors().TanggalBaptis}
          />
          <TextField
            label="Tanggal Sidi"
            type="date"
            value={form.tanggal_sidi}
            onInput={(e) => setForm("tanggal_sidi", e.currentTarget.value)}
            error={errors().TanggalSidi}
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <TextField
            label="Nomor Telepon"
            value={form.nomor_telepon}
            onInput={(e) => setForm("nomor_telepon", e.currentTarget.value)}
            error={errors().NomorTelepon}
          />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onInput={(e) => setForm("email", e.currentTarget.value)}
            error={errors().Email}
          />
        </div>
        <SelectField
          label="Keluarga"
          value={form.keluarga_id === null ? "" : String(form.keluarga_id)}
          onChange={(e) => setForm("keluarga_id", e.currentTarget.value ? Number(e.currentTarget.value) : null)}
          error={errors().KeluargaID}
        >
          <option value="">-</option>
          <For each={options.data?.items ?? []}>
            {(k) => <option value={String(k.id)}>{k.nama_keluarga}</option>}
          </For>
        </SelectField>
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
