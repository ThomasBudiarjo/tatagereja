import { createResource, createSignal, createEffect, For, Show } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { api } from "../lib/api";
import type { Service, AttendanceRecord, Member } from "../lib/types";
import { formatDateTime } from "../lib/format";
import { PageHeader, Card, ErrorNote, EmptyState, inputCls, btnPrimary, btnSecondary } from "../components/ui";

export default function AttendanceDetailPage() {
  const params = useParams();
  const [service] = createResource(() => params.serviceId, (id) => api.get<Service>(`/services/${id}`));
  const [members] = createResource(() => api.get<Member[]>("/members"));
  const [records] = createResource(() => params.serviceId, (id) => api.get<AttendanceRecord[]>(`/services/${id}/attendance`));

  const [checked, setChecked] = createSignal<Set<string>>(new Set());
  const [guests, setGuests] = createSignal<string[]>([]);
  const [guestName, setGuestName] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [error, setError] = createSignal("");
  const [saved, setSaved] = createSignal(false);

  // Seed the checklist and guest list from previously saved attendance.
  createEffect(() => {
    const recs = records();
    if (!recs) return;
    setChecked(new Set(recs.filter((r) => !r.is_guest).map((r) => r.member_id)));
    setGuests(recs.filter((r) => r.is_guest).map((r) => r.guest_name));
  });

  const toggle = (memberID: string) => {
    const next = new Set(checked());
    next.has(memberID) ? next.delete(memberID) : next.add(memberID);
    setChecked(next);
  };

  const addGuest = (e: Event) => {
    e.preventDefault();
    const name = guestName().trim();
    if (!name) return;
    setGuests([...guests(), name]);
    setGuestName("");
  };

  const save = async () => {
    setError("");
    setSaved(false);
    try {
      await api.post(`/services/${params.serviceId}/attendance`, {
        member_ids: [...checked()],
        guests: guests(),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save attendance");
    }
  };

  const visibleMembers = () =>
    (members() ?? []).filter((m) => m.full_name.toLowerCase().includes(search().toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Record attendance"
        subtitle={service() ? `${service()!.title} · ${formatDateTime(service()!.start_time)}` : undefined}
      >
        <A href="/attendance" class={btnSecondary}>
          ← Back
        </A>
        <button class={btnPrimary} onClick={save}>
          Save attendance ({checked().size + guests().length})
        </button>
      </PageHeader>

      <ErrorNote message={error()} />
      <Show when={saved()}>
        <div class="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 ring-1 ring-green-200">Attendance saved.</div>
      </Show>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={`Members (${checked().size} checked)`}>
          <input
            class={`${inputCls} mb-3`}
            placeholder="Search members…"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <Show when={visibleMembers().length > 0} fallback={<EmptyState message="No members found." />}>
            <ul class="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              <For each={visibleMembers()}>
                {(m) => (
                  <li>
                    <label class="flex cursor-pointer items-center gap-3 py-2 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        class="h-4 w-4 rounded border-slate-300 text-indigo-600"
                        checked={checked().has(m.id)}
                        onChange={() => toggle(m.id)}
                      />
                      <span>{m.full_name}</span>
                      <span class="text-xs text-slate-400">{m.status}</span>
                    </label>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Card>

        <Card title={`Guests (${guests().length})`}>
          <form class="mb-3 flex gap-2" onSubmit={addGuest}>
            <input
              class={inputCls}
              placeholder="Guest name…"
              value={guestName()}
              onInput={(e) => setGuestName(e.currentTarget.value)}
            />
            <button class={btnSecondary} type="submit">
              Add
            </button>
          </form>
          <Show when={guests().length > 0} fallback={<EmptyState message="No guests added." />}>
            <ul class="divide-y divide-slate-100">
              <For each={guests()}>
                {(g, i) => (
                  <li class="flex items-center justify-between py-2 text-sm">
                    <span>{g}</span>
                    <button
                      class="text-xs text-red-500 hover:underline"
                      onClick={() => setGuests(guests().filter((_, idx) => idx !== i()))}
                    >
                      Remove
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Card>
      </div>
    </div>
  );
}
