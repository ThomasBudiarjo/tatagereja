import { createSignal, createEffect, Show, For } from "solid-js";
import { createStore } from "solid-js/store";
import { A, useParams } from "@solidjs/router";
import { ApiError } from "../../api/client";
import type { JadwalSlot } from "../../api/types";
import { useJadwal, useSaveJadwal } from "../../lib/kebaktian";
import { FullSpinner, ErrorState, PrimaryButton, EmptyState } from "../../components/ui";
import { IconArrowLeft } from "../../components/icons";

type SlotState = { pelayan_id: number | null; catatan: string };

export default function JadwalEditor() {
  const params = useParams();
  const id = () => Number(params.id);
  const query = useJadwal(id);
  const save = useSaveJadwal(id);

  const [state, setState] = createStore<Record<number, SlotState>>({});
  const [formError, setFormError] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  let initialized = false;

  createEffect(() => {
    const data = query.data;
    if (!data || initialized) return;
    initialized = true;
    const byType = new Map<number, JadwalSlot>(data.slots.map((s) => [s.service_type_id, s]));
    for (const st of data.service_types) {
      const existing = byType.get(st.id);
      setState(st.id, {
        pelayan_id: existing?.pelayan_id ?? null,
        catatan: existing?.catatan ?? "",
      });
    }
  });

  const submit = (e: Event) => {
    e.preventDefault();
    setFormError("");
    setSaved(false);
    const slots: JadwalSlot[] = (query.data?.service_types ?? []).map((st) => ({
      service_type_id: st.id,
      pelayan_id: state[st.id]?.pelayan_id ?? null,
      catatan: state[st.id]?.catatan ?? "",
    }));
    save.mutate(slots, {
      onSuccess: () => setSaved(true),
      onError: (err) =>
        setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan jadwal"),
    });
  };

  return (
    <div class="mx-auto max-w-2xl">
      <A
        href={`/kebaktian/${id()}`}
        class="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <IconArrowLeft class="h-4 w-4" />
        Kembali
      </A>

      <Show when={!query.isError} fallback={<ErrorState message="Kebaktian tidak ditemukan." />}>
        <Show when={query.data} fallback={<FullSpinner />}>
          {(data) => (
            <div>
              <h1 class="text-2xl font-semibold tracking-tight text-ink">Jadwal Pelayanan</h1>
              <p class="mb-5 text-sm text-ink-soft font-num">
                {data().kebaktian.nama} — {data().kebaktian.waktu_mulai_text}
              </p>

              <Show
                when={data().service_types.length > 0}
                fallback={
                  <EmptyState message="Belum ada jenis pelayanan. Tambahkan dulu di menu Tipe Pelayanan." />
                }
              >
                <form onSubmit={submit} class="space-y-3">
                  <Show when={formError()}>
                    <ErrorState message={formError()} />
                  </Show>

                  <For each={data().service_types}>
                    {(st) => {
                      const options = () => data().pelayan_options[String(st.id)] ?? [];
                      return (
                        <div class="rounded-xl border border-line bg-surface-raised p-4">
                          <p class="mb-2 text-sm font-semibold text-ink">{st.nama}</p>
                          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <select
                              class="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-md text-ink outline-none focus:border-sage-600 focus:ring-2 focus:ring-sage-100"
                              value={state[st.id]?.pelayan_id === null || state[st.id]?.pelayan_id === undefined ? "" : String(state[st.id].pelayan_id)}
                              onChange={(e) =>
                                setState(st.id, "pelayan_id", e.currentTarget.value ? Number(e.currentTarget.value) : null)
                              }
                            >
                              <option value="">— Belum ditugaskan —</option>
                              <For each={options()}>
                                {(opt) => <option value={String(opt.id)}>{opt.jemaat_nama}</option>}
                              </For>
                            </select>
                            <input
                              type="text"
                              placeholder="Catatan (opsional)"
                              class="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-md text-ink outline-none focus:border-sage-600 focus:ring-2 focus:ring-sage-100"
                              value={state[st.id]?.catatan ?? ""}
                              onInput={(e) => setState(st.id, "catatan", e.currentTarget.value)}
                            />
                          </div>
                          <Show when={options().length === 0}>
                            <p class="mt-1.5 text-xs text-ink-soft">
                              Belum ada pelayan untuk jenis ini.
                            </p>
                          </Show>
                        </div>
                      );
                    }}
                  </For>

                  <div class="flex items-center justify-end gap-3 pt-2">
                    <Show when={saved()}>
                      <span class="text-sm text-sage-700">Tersimpan</span>
                    </Show>
                    <PrimaryButton type="submit" loading={save.isPending}>
                      Simpan Jadwal
                    </PrimaryButton>
                  </div>
                </form>
              </Show>
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}
