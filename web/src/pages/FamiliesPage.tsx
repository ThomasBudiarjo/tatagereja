import { createResource, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { api } from "../lib/api";
import type { Family, FamilyDetail } from "../lib/types";
import { PageHeader, Card, Modal, Field, ErrorNote, EmptyState, inputCls, btnPrimary } from "../components/ui";

export default function FamiliesPage() {
  const [families, { refetch }] = createResource(() => api.get<Family[]>("/families"));
  const [showCreate, setShowCreate] = createSignal(false);
  const [error, setError] = createSignal("");
  const [name, setName] = createSignal("");

  const create = async (e: Event) => {
    e.preventDefault();
    setError("");
    try {
      await api.post<FamilyDetail>("/families", { family_name: name(), head_member_id: "" });
      setShowCreate(false);
      setName("");
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create family");
    }
  };

  return (
    <div>
      <PageHeader title="Families" subtitle="Keluarga — family units and relationships">
        <button class={btnPrimary} onClick={() => setShowCreate(true)}>
          + Add family
        </button>
      </PageHeader>

      <Card>
        <Show when={families()} fallback={<p class="text-slate-400">Loading…</p>}>
          {(list) => (
            <Show when={list().length > 0} fallback={<EmptyState message="No families yet. Create one to group members." />}>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th class="py-2 pr-4">Family name</th>
                      <th class="py-2 pr-4">Head of family</th>
                      <th class="py-2 pr-4">Members</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <For each={list()}>
                      {(f) => (
                        <tr class="hover:bg-slate-50">
                          <td class="py-2 pr-4">
                            <A href={`/families/${f.id}`} class="font-medium text-indigo-600 hover:underline">
                              {f.family_name}
                            </A>
                          </td>
                          <td class="py-2 pr-4 text-slate-600">{f.head_name || "—"}</td>
                          <td class="py-2 pr-4 text-slate-600">{f.member_count}</td>
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

      <Modal open={showCreate()} title="Add family" onClose={() => setShowCreate(false)}>
        <form class="space-y-3" onSubmit={create}>
          <ErrorNote message={error()} />
          <Field label="Family name *">
            <input class={inputCls} value={name()} onInput={(e) => setName(e.currentTarget.value)} required placeholder="Keluarga Budiarjo" />
          </Field>
          <button class={`${btnPrimary} w-full justify-center`} type="submit">
            Create family
          </button>
        </form>
      </Modal>
    </div>
  );
}
