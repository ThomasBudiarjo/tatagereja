import { Show, For } from "solid-js";
import { A, useParams, useNavigate } from "@solidjs/router";
import { usePelayan, useDeletePelayan } from "../../lib/pelayan";
import { FullSpinner, ErrorState, PrimaryButton, EmptyState } from "../../components/ui";
import { IconArrowLeft, IconPencil, IconTrash } from "../../components/icons";

export default function PelayanDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const id = () => Number(params.id);
  const query = usePelayan(id);
  const del = useDeletePelayan();

  const remove = () => {
    const p = query.data?.pelayan;
    if (p && confirm(`Hapus pelayan ${p.jemaat_nama}?`)) {
      del.mutate(p.id, { onSuccess: () => navigate("/pelayan", { replace: true }) });
    }
  };

  return (
    <div class="mx-auto max-w-2xl">
      <A href="/pelayan" class="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <IconArrowLeft class="h-4 w-4" />
        Kembali
      </A>

      <Show when={!query.isError} fallback={<ErrorState message="Data pelayan tidak ditemukan." />}>
        <Show when={query.data} fallback={<FullSpinner />}>
          {(data) => (
            <div class="rounded-2xl border border-line bg-surface-raised p-6">
              <div class="mb-4 flex items-start justify-between gap-3">
                <h1 class="text-xl font-semibold tracking-tight text-ink">{data().pelayan.jemaat_nama}</h1>
                <div class="flex gap-2">
                  <A href={`/pelayan/${id()}/edit`}>
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

              <h2 class="mb-2 text-xs font-semibold text-ink-soft">Jenis Pelayanan</h2>
              <Show
                when={data().pelayan.service_types.length > 0}
                fallback={<EmptyState message="Belum ada jenis pelayanan." />}
              >
                <div class="flex flex-wrap gap-1.5">
                  <For each={data().pelayan.service_types}>
                    {(name) => (
                      <span class="rounded-full bg-sage-50 px-2.5 py-1 text-xs font-medium text-sage-800">
                        {name}
                      </span>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={data().pelayan.catatan}>
                <h2 class="mb-1 mt-4 text-xs font-semibold text-ink-soft">Catatan</h2>
                <p class="text-sm text-ink">{data().pelayan.catatan}</p>
              </Show>
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}
