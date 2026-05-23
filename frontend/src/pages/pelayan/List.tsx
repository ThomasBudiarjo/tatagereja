import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import type { Pelayan } from "../../api/types";
import { usePelayanList, useDeletePelayan } from "../../lib/pelayan";
import { PageHeader, PrimaryButton, EmptyState, ErrorState } from "../../components/ui";
import { IconPlus, IconTrash } from "../../components/icons";

export default function PelayanList() {
  const list = usePelayanList();
  const del = useDeletePelayan();

  const remove = (e: MouseEvent, p: Pelayan) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Hapus pelayan ${p.jemaat_nama}?`)) del.mutate(p.id);
  };

  return (
    <div>
      <PageHeader
        title="Pelayan"
        actions={
          <A href="/pelayan/new">
            <PrimaryButton type="button">
              <IconPlus class="h-4 w-4" />
              Tambah
            </PrimaryButton>
          </A>
        }
      />
      <div class="mb-4 flex justify-end md:hidden">
        <A href="/pelayan/new">
          <PrimaryButton type="button">
            <IconPlus class="h-4 w-4" />
            Tambah
          </PrimaryButton>
        </A>
      </div>

      <Show when={!list.isError} fallback={<ErrorState message="Gagal memuat data pelayan." />}>
        <Show
          when={list.data}
          fallback={
            <div class="space-y-2">
              <For each={Array(5).fill(0)}>
                {() => <div class="h-16 animate-pulse rounded-xl bg-surface-muted" />}
              </For>
            </div>
          }
        >
          <Show when={list.data!.items.length > 0} fallback={<EmptyState message="Belum ada data pelayan." />}>
            <ul class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-raised">
              <For each={list.data!.items}>
                {(p) => (
                  <li>
                    <A
                      href={`/pelayan/${p.id}`}
                      class="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-ink">{p.jemaat_nama}</p>
                        <Show when={p.service_types.length > 0}>
                          <div class="mt-1 flex flex-wrap gap-1">
                            <For each={p.service_types}>
                              {(name) => (
                                <span class="rounded-full bg-sage-50 px-2 py-0.5 text-2xs font-medium text-sage-800">
                                  {name}
                                </span>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => remove(e, p)}
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
