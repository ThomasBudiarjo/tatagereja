import { createResource, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { api } from "../lib/api";
import { MEMBER_STATUSES, type Member } from "../lib/types";
import { PageHeader, Card, Modal, Field, ErrorNote, EmptyState, StatusBadge, inputCls, btnPrimary } from "../components/ui";

export default function MembersPage() {
  const [q, setQ] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [members, { refetch }] = createResource(
    () => ({ q: q(), status: status() }),
    (f) => api.get<Member[]>(`/members?q=${encodeURIComponent(f.q)}&status=${encodeURIComponent(f.status)}`),
  );

  const [showCreate, setShowCreate] = createSignal(false);
  const [error, setError] = createSignal("");
  const [form, setForm] = createSignal({
    full_name: "",
    phone: "",
    email: "",
    address: "",
    birth_date: "",
    gender: "",
    status: "active",
    notes: "",
  });
  const set = (key: string, value: string) => setForm({ ...form(), [key]: value });

  const create = async (e: Event) => {
    e.preventDefault();
    setError("");
    try {
      await api.post<Member>("/members", form());
      setShowCreate(false);
      setForm({ full_name: "", phone: "", email: "", address: "", birth_date: "", gender: "", status: "active", notes: "" });
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create member");
    }
  };

  return (
    <div>
      <PageHeader title="Members" subtitle="Jemaat — your church member records">
        <button class={btnPrimary} onClick={() => setShowCreate(true)}>
          + Add member
        </button>
      </PageHeader>

      <Card>
        <div class="mb-4 flex flex-wrap gap-3">
          <input
            class={`${inputCls} max-w-xs`}
            placeholder="Search by name…"
            value={q()}
            onInput={(e) => setQ(e.currentTarget.value)}
          />
          <select class={`${inputCls} max-w-40`} value={status()} onChange={(e) => setStatus(e.currentTarget.value)}>
            <option value="">All statuses</option>
            <For each={MEMBER_STATUSES}>{(s) => <option value={s}>{s}</option>}</For>
          </select>
        </div>

        <Show when={members()} fallback={<p class="text-slate-400">Loading…</p>}>
          {(list) => (
            <Show when={list().length > 0} fallback={<EmptyState message="No members found. Add your first member to get started." />}>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th class="py-2 pr-4">Name</th>
                      <th class="py-2 pr-4">Phone</th>
                      <th class="py-2 pr-4">Email</th>
                      <th class="py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <For each={list()}>
                      {(m) => (
                        <tr class="hover:bg-slate-50">
                          <td class="py-2 pr-4">
                            <A href={`/members/${m.id}`} class="font-medium text-indigo-600 hover:underline">
                              {m.full_name}
                            </A>
                          </td>
                          <td class="py-2 pr-4 text-slate-600">{m.phone || "—"}</td>
                          <td class="py-2 pr-4 text-slate-600">{m.email || "—"}</td>
                          <td class="py-2 pr-4">
                            <StatusBadge status={m.status} />
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          )}
        </Show>
      </Card>

      <Modal open={showCreate()} title="Add member" onClose={() => setShowCreate(false)}>
        <form class="space-y-3" onSubmit={create}>
          <ErrorNote message={error()} />
          <Field label="Full name *">
            <input class={inputCls} value={form().full_name} onInput={(e) => set("full_name", e.currentTarget.value)} required />
          </Field>
          <div class="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input class={inputCls} value={form().phone} onInput={(e) => set("phone", e.currentTarget.value)} />
            </Field>
            <Field label="Email">
              <input class={inputCls} type="email" value={form().email} onInput={(e) => set("email", e.currentTarget.value)} />
            </Field>
            <Field label="Date of birth">
              <input class={inputCls} type="date" value={form().birth_date} onInput={(e) => set("birth_date", e.currentTarget.value)} />
            </Field>
            <Field label="Gender">
              <select class={inputCls} value={form().gender} onChange={(e) => set("gender", e.currentTarget.value)}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
          </div>
          <Field label="Address">
            <input class={inputCls} value={form().address} onInput={(e) => set("address", e.currentTarget.value)} />
          </Field>
          <Field label="Status">
            <select class={inputCls} value={form().status} onChange={(e) => set("status", e.currentTarget.value)}>
              <For each={MEMBER_STATUSES}>{(s) => <option value={s}>{s}</option>}</For>
            </select>
          </Field>
          <Field label="Notes">
            <textarea class={inputCls} rows={2} value={form().notes} onInput={(e) => set("notes", e.currentTarget.value)} />
          </Field>
          <button class={`${btnPrimary} w-full justify-center`} type="submit">
            Save member
          </button>
        </form>
      </Modal>
    </div>
  );
}
