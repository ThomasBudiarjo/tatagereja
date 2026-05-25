import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { useQueryClient } from "@tanstack/solid-query";
import { api } from "../../api/client";
import type { Jemaat } from "../../api/types";
import { useJemaatList, useDeleteJemaat } from "../../lib/jemaat";
import { PageHeader, PrimaryButton, Spinner, EmptyState, ErrorState } from "../../components/ui";
import { IconSearch, IconPlus, IconTrash, IconChevronLeft, IconChevronRight } from "../../components/icons";

const LIMIT = 50;

export default function JemaatList() {
  const qc = useQueryClient();
  const [input, setInput] = createSignal("");
  const [q, setQ] = createSignal("");
  const [offset, setOffset] = createSignal(0);

  // Debounce the search so typing doesn't fire a request per keystroke.
  createEffect(() => {
    const value = input();
    const t = setTimeout(() => {
      setQ(value);
      setOffset(0);
    }, 250);
    onCleanup(() => clearTimeout(t));
  });

  const list = useJemaatList(() => ({ q: q(), limit: LIMIT, offset: offset() }));
  const del = useDeleteJemaat();

  const prefetch = (id: number) =>
    qc.prefetchQuery({
      queryKey: ["jemaat", "detail", id],
      queryFn: () => api.get<{ jemaat: Jemaat }>(`/jemaat/${id}`),
    });

  const remove = (e: MouseEvent, item: Jemaat) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Hapus ${item.nama_lengkap}?`)) del.mutate(item.id);
  };

  const total = () => list.data?.total ?? 0;
  const hasPrev = () => offset() > 0;
  const hasNext = () => offset() + LIMIT < total();

  return (
    <div>
      <PageHeader
        title="Jemaat"
        actions={
          <A href="/jemaat/new">
            <PrimaryButton type="button">
              <IconPlus class="h-4 w-4" />
              Tambah
            </PrimaryButton>
          </A>
        }
      />

      <div class="mb-4 flex items-center gap-2">
        <div class="relative flex-1">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft">
            <IconSearch class="h-4 w-4" />
          </span>
          <input
            type="search"
            placeholder="Cari nama..."
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            class="w-full rounded-lg border border-line bg-surface-raised py-2 pl-9 pr-3 text-md text-ink outline-none focus:border-sage-600 focus:ring-2 focus:ring-sage-100"
          />
        </div>
        <A href="/jemaat/new" class="md:hidden">
          <PrimaryButton type="button">
            <IconPlus class="h-4 w-4" />
          </PrimaryButton>
        </A>
        <Show when={list.isFetching}>
          <Spinner class="h-4 w-4 animate-spin text-ink-soft" />
        </Show>
      </div>

      <Show when={!list.isError} fallback={<ErrorState message="Gagal memuat data jemaat." />}>
        <Show
          when={list.data}
          fallback={
            <div class="space-y-2">
              <For each={Array(6).fill(0)}>
                {() => <div class="h-14 animate-pulse rounded-xl bg-surface-muted" />}
              </For>
            </div>
          }
        >
          <Show when={list.data!.items.length > 0} fallback={<EmptyState message="Belum ada data jemaat." />}>
            <ul class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-raised">
              <For each={list.data!.items}>
                {(item) => (
                  <li>
                    <A
                      href={`/jemaat/${item.id}`}
                      onMouseEnter={() => prefetch(item.id)}
                      class="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-ink">{item.nama_lengkap}</p>
                        <Show when={item.nomor_telepon}>
                          <p class="truncate text-xs text-ink-soft font-num">{item.nomor_telepon}</p>
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

            <div class="mt-4 flex items-center justify-between text-sm text-ink-soft">
              <span class="font-num">
                {offset() + 1}-{Math.min(offset() + LIMIT, total())} dari {total()}
              </span>
              <div class="flex gap-2">
                <button
                  type="button"
                  disabled={!hasPrev()}
                  onClick={() => setOffset(Math.max(0, offset() - LIMIT))}
                  class="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
                >
                  <IconChevronLeft class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={!hasNext()}
                  onClick={() => setOffset(offset() + LIMIT)}
                  class="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
                >
                  <IconChevronRight class="h-4 w-4" />
                </button>
              </div>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
