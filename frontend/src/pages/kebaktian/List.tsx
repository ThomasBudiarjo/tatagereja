import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import type { Kebaktian } from "../../api/types";
import { useKebaktianList, useDeleteKebaktian } from "../../lib/kebaktian";
import { PageHeader, PrimaryButton, EmptyState, ErrorState } from "../../components/ui";
import { IconPlus, IconTrash } from "../../components/icons";

export default function KebaktianList() {
  const list = useKebaktianList();
  const del = useDeleteKebaktian();

  const remove = (e: MouseEvent, k: Kebaktian) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Hapus ${k.nama}?`)) del.mutate(k.id);
  };

  return (
    <div>
      <PageHeader
        title="Kebaktian"
        actions={
          <A href="/kebaktian/new">
            <PrimaryButton type="button">
              <IconPlus class="h-4 w-4" />
              Tambah
            </PrimaryButton>
          </A>
        }
      />
      <div class="mb-4 flex justify-end md:hidden">
        <A href="/kebaktian/new">
          <PrimaryButton type="button">
            <IconPlus class="h-4 w-4" />
            Tambah
          </PrimaryButton>
        </A>
      </div>

      <Show when={!list.isError} fallback={<ErrorState message="Gagal memuat data kebaktian." />}>
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
          <Show when={list.data!.items.length > 0} fallback={<EmptyState message="Belum ada data kebaktian." />}>
            <ul class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-raised">
              <For each={list.data!.items}>
                {(k) => (
                  <li>
                    <A
                      href={`/kebaktian/${k.id}`}
                      class="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-ink">{k.nama}</p>
                        <p class="truncate text-xs text-ink-soft font-num">{k.waktu_mulai_text}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => remove(e, k)}
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
