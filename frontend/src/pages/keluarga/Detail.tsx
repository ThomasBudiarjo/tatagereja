import { Show, For } from "solid-js";
import { A, useParams, useNavigate } from "@solidjs/router";
import { useKeluarga, useDeleteKeluarga } from "../../lib/keluarga";
import { FullSpinner, ErrorState, PrimaryButton, EmptyState } from "../../components/ui";
import { IconArrowLeft, IconPencil, IconTrash } from "../../components/icons";

export default function KeluargaDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const id = () => Number(params.id);
  const query = useKeluarga(id);
  const del = useDeleteKeluarga();

  const remove = () => {
    const k = query.data?.keluarga;
    if (k && confirm(`Hapus keluarga ${k.nama_keluarga}?`)) {
      del.mutate(k.id, { onSuccess: () => navigate("/keluarga", { replace: true }) });
    }
  };

  return (
    <div class="mx-auto max-w-2xl">
      <A href="/keluarga" class="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <IconArrowLeft class="h-4 w-4" />
        Kembali
      </A>

      <Show when={!query.isError} fallback={<ErrorState message="Data keluarga tidak ditemukan." />}>
        <Show when={query.data} fallback={<FullSpinner />}>
          {(data) => (
            <div class="space-y-5">
              <div class="rounded-2xl border border-line bg-surface-raised p-6">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h1 class="text-xl font-semibold tracking-tight text-ink">
                      {data().keluarga.nama_keluarga}
                    </h1>
                    <Show when={data().keluarga.alamat}>
                      <p class="mt-1 text-sm text-ink-soft">{data().keluarga.alamat}</p>
                    </Show>
                    <Show when={data().keluarga.catatan}>
                      <p class="mt-2 text-sm text-ink">{data().keluarga.catatan}</p>
                    </Show>
                  </div>
                  <div class="flex gap-2">
                    <A href={`/keluarga/${id()}/edit`}>
                      <PrimaryButton type="button">
                        <IconPencil class="h-3.5 w-3.5" />
                        Edit
                      </PrimaryButton>
                    </A>
                    <button
                      type="button"
                      onClick={remove}
                      class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                    >
                      <IconTrash class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h2 class="mb-2 text-sm font-semibold text-ink-muted">
                  Anggota ({data().members.length})
                </h2>
                <Show
                  when={data().members.length > 0}
                  fallback={<EmptyState message="Belum ada anggota keluarga." />}
                >
                  <ul class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-raised">
                    <For each={data().members}>
                      {(m) => (
                        <li>
                          <A
                            href={`/jemaat/${m.id}`}
                            class="block px-4 py-3 text-sm text-ink transition-colors hover:bg-surface-muted"
                          >
                            {m.nama_lengkap}
                          </A>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}
