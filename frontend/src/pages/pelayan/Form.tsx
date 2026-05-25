import { createSignal, createEffect, Show, For } from "solid-js";
import { createStore } from "solid-js/store";
import { A, useParams, useNavigate } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { api, ApiError } from "../../api/client";
import type { Pelayan, PelayanReq } from "../../api/types";
import {
  useJemaatOptions,
  useCreatePelayan,
  useUpdatePelayan,
} from "../../lib/pelayan";
import { useServiceTypes } from "../../lib/servicetypes";
import { SelectField, TextArea, PrimaryButton, ErrorState, FieldError } from "../../components/ui";
import { IconArrowLeft } from "../../components/icons";

export default function PelayanForm() {
  const params = useParams();
  const navigate = useNavigate();
  const isEdit = () => params.id !== undefined;

  const [form, setForm] = createStore<PelayanReq>({ jemaat_id: 0, catatan: "", service_type_ids: [] });
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [formError, setFormError] = createSignal("");

  const jemaatOptions = useJemaatOptions();
  const serviceTypes = useServiceTypes();

  const detail = useQuery(() => ({
    queryKey: ["pelayan", "detail", Number(params.id)],
    queryFn: () => api.get<{ pelayan: Pelayan }>(`/pelayan/${params.id}`),
    enabled: isEdit(),
  }));

  createEffect(() => {
    const p = detail.data?.pelayan;
    if (!p) return;
    setForm({ jemaat_id: p.jemaat_id, catatan: p.catatan ?? "", service_type_ids: p.service_type_ids ?? [] });
  });

  const create = useCreatePelayan();
  const update = useUpdatePelayan();
  const pending = () => create.isPending || update.isPending;

  const toggleType = (id: number, checked: boolean) => {
    const cur = form.service_type_ids;
    setForm("service_type_ids", checked ? [...cur, id] : cur.filter((x) => x !== id));
  };

  const onError = (err: unknown) => {
    if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
    else setFormError(err instanceof Error ? err.message : "Gagal menyimpan");
  };

  const submit = (e: Event) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    const body: PelayanReq = { ...form, service_type_ids: [...form.service_type_ids] };
    if (isEdit()) {
      const id = Number(params.id);
      update.mutate({ id, body }, { onSuccess: () => navigate(`/pelayan/${id}`, { replace: true }), onError });
    } else {
      create.mutate(body, {
        onSuccess: (d) => navigate(`/pelayan/${d.pelayan.id}`, { replace: true }),
        onError,
      });
    }
  };

  return (
    <div class="mx-auto max-w-2xl">
      <A
        href={isEdit() ? `/pelayan/${params.id}` : "/pelayan"}
        class="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <IconArrowLeft class="h-4 w-4" />
        Kembali
      </A>
      <h1 class="mb-5 text-2xl font-semibold tracking-tight text-ink">
        {isEdit() ? "Edit Pelayan" : "Tambah Pelayan"}
      </h1>

      <form onSubmit={submit} class="space-y-4 rounded-2xl border border-line bg-surface-raised p-6">
        <Show when={formError()}>
          <ErrorState message={formError()} />
        </Show>

        <SelectField
          label="Jemaat"
          value={form.jemaat_id === 0 ? "" : String(form.jemaat_id)}
          onChange={(e) => setForm("jemaat_id", e.currentTarget.value ? Number(e.currentTarget.value) : 0)}
          error={errors().JemaatID}
        >
          <option value="">Pilih jemaat...</option>
          <For each={jemaatOptions.data?.items ?? []}>
            {(j) => <option value={String(j.id)}>{j.nama_lengkap}</option>}
          </For>
        </SelectField>

        <div>
          <label class="mb-1.5 block text-xs font-semibold text-ink-muted">Jenis Pelayanan</label>
          <div class="space-y-1.5 rounded-lg border border-line p-3">
            <Show
              when={(serviceTypes.data?.items ?? []).length > 0}
              fallback={<p class="text-xs text-ink-soft">Belum ada jenis pelayanan. Tambahkan di menu Tipe Pelayanan.</p>}
            >
              <For each={serviceTypes.data!.items}>
                {(st) => (
                  <label class="flex items-center gap-2.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded border-line text-sage-600 focus:ring-sage-100"
                      checked={form.service_type_ids.includes(st.id)}
                      onChange={(e) => toggleType(st.id, e.currentTarget.checked)}
                    />
                    {st.nama}
                  </label>
                )}
              </For>
            </Show>
          </div>
          <FieldError msg={errors().ServiceTypeIDs} />
        </div>

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
