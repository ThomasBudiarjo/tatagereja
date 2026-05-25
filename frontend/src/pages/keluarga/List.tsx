import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { useQueryClient } from "@tanstack/solid-query";
import { api } from "../../api/client";
import type { Keluarga } from "../../api/types";
import { useKeluargaList, useDeleteKeluarga } from "../../lib/keluarga";
import { PageHeader, PrimaryButton, EmptyState, ErrorState } from "../../components/ui";
import { IconPlus, IconTrash } from "../../components/icons";

export default function KeluargaList() {
  const qc = useQueryClient();
  const list = useKeluargaList();
  const del = useDeleteKeluarga();

  const prefetch = (id: number) =>
    qc.prefetchQuery({
      queryKey: ["keluarga", "detail", id],
      queryFn: () => api.get(`/keluarga/${id}`),
    });

  const remove = (e: MouseEvent, item: Keluarga) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Hapus keluarga ${item.nama_keluarga}?`)) del.mutate(item.id);
  };

  return (
    <div>
      <PageHeader
        title="Keluarga"
        actions={
          <A href="/keluarga/new">
            <PrimaryButton type="button">
              <IconPlus class="h-4 w-4" />
              Tambah
            </PrimaryButton>
          </A>
        }
      />
      <div class="mb-4 flex justify-end md:hidden">
        <A href="/keluarga/new">
          <PrimaryButton type="button">
            <IconPlus class="h-4 w-4" />
            Tambah
          </PrimaryButton>
        </A>
      </div>

      <Show when={!list.isError} fallback={<ErrorState message="Gagal memuat data keluarga." />}>
        <Show
          when={list.data}
          fallback={
            <div class="space-y-2">
              <For each={Array(5).fill(0)}>
                {() => <div class="h-14 animate-pulse rounded-xl bg-surface-muted" />}
              </For>
            </div>
          }
        >
          <Show when={list.data!.items.length > 0} fallback={<EmptyState message="Belum ada data keluarga." />}>
            <ul class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-raised">
              <For each={list.data!.items}>
                {(item) => (
                  <li>
                    <A
                      href={`/keluarga/${item.id}`}
                      onMouseEnter={() => prefetch(item.id)}
                      class="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-ink">{item.nama_keluarga}</p>
                        <Show when={item.alamat}>
                          <p class="truncate text-xs text-ink-soft">{item.alamat}</p>
                        </Show>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => remove(e, item)}
                        class="shrink-0 rounded-lg p-2 text-ink-soft transition-colors hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Hapus"
                      >
                        <IconTrash class="h-4 w-4" />
                      </button>
                    </A>
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
