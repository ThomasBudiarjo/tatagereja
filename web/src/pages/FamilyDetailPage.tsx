import { createResource, createSignal, For, Show } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";
import { api } from "../lib/api";
import { RELATIONS, type FamilyDetail, type Member } from "../lib/types";
import { PageHeader, Card, Field, ErrorNote, EmptyState, inputCls, btnPrimary, btnDanger, btnSecondary } from "../components/ui";

export default function FamilyDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [detail, { refetch }] = createResource(() => params.id, (id) => api.get<FamilyDetail>(`/families/${id}`));
  const [allMembers] = createResource(() => api.get<Member[]>("/members"));

  const [error, setError] = createSignal("");
  const [newMemberID, setNewMemberID] = createSignal("");
  const [newRelation, setNewRelation] = createSignal<string>("child");

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const saveFamily = (e: Event) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    run(() =>
      api.patch(`/families/${params.id}`, {
        family_name: fd.get("family_name"),
        head_member_id: fd.get("head_member_id"),
      }),
    );
  };

  const addMember = (e: Event) => {
    e.preventDefault();
    if (!newMemberID()) return;
    run(() => api.post(`/families/${params.id}/members`, { member_id: newMemberID(), relation: newRelation() })).then(() =>
      setNewMemberID(""),
    );
  };

  const removeFamily = async () => {
    if (!confirm("Delete this family? Members themselves are not deleted.")) return;
    setError("");
    try {
      await api.delete(`/families/${params.id}`);
      navigate("/families");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete family");
    }
  };

  // Members not yet in this family, offered in the "add member" picker.
  const candidates = () => {
    const inFamily = new Set(detail()?.members.map((m) => m.member_id));
    return (allMembers() ?? []).filter((m) => !inFamily.has(m.id));
  };

  return (
    <div>
      <PageHeader title="Family detail" subtitle={detail()?.family.family_name}>
        <A href="/families" class={btnSecondary}>
          ← Back to families
        </A>
      </PageHeader>

      <ErrorNote message={error()} />

      <Show when={detail()} fallback={<p class="text-slate-400">Loading…</p>}>
        {(d) => (
          <div class="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Family info">
              <form class="space-y-3" onSubmit={saveFamily}>
                <Field label="Family name *">
                  <input class={inputCls} name="family_name" value={d().family.family_name} required />
                </Field>
                <Field label="Head of family">
                  <select class={inputCls} name="head_member_id" value={d().family.head_member_id}>
                    <option value="">—</option>
                    <For each={d().members}>
                      {(fm) => <option value={fm.member_id}>{fm.full_name}</option>}
                    </For>
                  </select>
                </Field>
                <div class="flex justify-between pt-2">
                  <button class={btnPrimary} type="submit">
                    Save
                  </button>
                  <button class={btnDanger} type="button" onClick={removeFamily}>
                    Delete family
                  </button>
                </div>
              </form>
            </Card>

            <Card title="Family members">
              <Show when={d().members.length > 0} fallback={<EmptyState message="No members in this family yet." />}>
                <ul class="mb-4 divide-y divide-slate-100">
                  <For each={d().members}>
                    {(fm) => (
                      <li class="flex items-center justify-between py-2 text-sm">
                        <span>
                          <A href={`/members/${fm.member_id}`} class="font-medium text-indigo-600 hover:underline">
                            {fm.full_name}
                          </A>
                          <span class="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{fm.relation}</span>
                          <Show when={fm.member_id === d().family.head_member_id}>
                            <span class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">head</span>
                          </Show>
                        </span>
                        <button
                          class="text-xs text-red-500 hover:underline"
                          onClick={() => run(() => api.delete(`/families/${params.id}/members/${fm.id}`))}
                        >
                          Remove
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>

              <form class="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4" onSubmit={addMember}>
                <div class="min-w-40 flex-1">
                  <Field label="Add member">
                    <select class={inputCls} value={newMemberID()} onChange={(e) => setNewMemberID(e.currentTarget.value)} required>
                      <option value="">Select member…</option>
                      <For each={candidates()}>{(m) => <option value={m.id}>{m.full_name}</option>}</For>
                    </select>
                  </Field>
                </div>
                <div class="w-32">
                  <Field label="Relation">
                    <select class={inputCls} value={newRelation()} onChange={(e) => setNewRelation(e.currentTarget.value)}>
                      <For each={RELATIONS}>{(rel) => <option value={rel}>{rel}</option>}</For>
                    </select>
                  </Field>
                </div>
                <button class={btnPrimary} type="submit">
                  Add
                </button>
              </form>
            </Card>
          </div>
        )}
      </Show>
    </div>
  );
}
