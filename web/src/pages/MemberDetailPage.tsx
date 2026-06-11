import { createResource, createSignal, For, Show } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";
import { api } from "../lib/api";
import { MEMBER_STATUSES, type Member } from "../lib/types";
import { PageHeader, Card, Field, ErrorNote, inputCls, btnPrimary, btnDanger, btnSecondary } from "../components/ui";

export default function MemberDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [member] = createResource(() => params.id, (id) => api.get<Member>(`/members/${id}`));

  const [error, setError] = createSignal("");
  const [saved, setSaved] = createSignal(false);

  const save = async (e: Event) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await api.patch<Member>(`/members/${params.id}`, {
        full_name: fd.get("full_name"),
        phone: fd.get("phone"),
        email: fd.get("email"),
        address: fd.get("address"),
        birth_date: fd.get("birth_date"),
        gender: fd.get("gender"),
        status: fd.get("status"),
        notes: fd.get("notes"),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save member");
    }
  };

  const remove = async () => {
    if (!confirm("Delete this member? This also removes them from families, service roles, and attendance records.")) return;
    try {
      await api.delete(`/members/${params.id}`);
      navigate("/members");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete member");
    }
  };

  return (
    <div>
      <PageHeader title="Member detail" subtitle={member()?.full_name}>
        <A href="/members" class={btnSecondary}>
          ← Back to members
        </A>
      </PageHeader>

      <Show when={member()} fallback={<p class="text-slate-400">Loading…</p>}>
        {(m) => (
          <Card class="max-w-2xl">
            <form class="space-y-3" onSubmit={save}>
              <ErrorNote message={error()} />
              <Show when={saved()}>
                <div class="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 ring-1 ring-green-200">Saved.</div>
              </Show>
              <Field label="Full name *">
                <input class={inputCls} name="full_name" value={m().full_name} required />
              </Field>
              <div class="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input class={inputCls} name="phone" value={m().phone} />
                </Field>
                <Field label="Email">
                  <input class={inputCls} name="email" type="email" value={m().email} />
                </Field>
                <Field label="Date of birth">
                  <input class={inputCls} name="birth_date" type="date" value={m().birth_date} />
                </Field>
                <Field label="Gender">
                  <select class={inputCls} name="gender" value={m().gender}>
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </Field>
              </div>
              <Field label="Address">
                <input class={inputCls} name="address" value={m().address} />
              </Field>
              <Field label="Status">
                <select class={inputCls} name="status" value={m().status}>
                  <For each={MEMBER_STATUSES}>{(s) => <option value={s}>{s}</option>}</For>
                </select>
              </Field>
              <Field label="Notes">
                <textarea class={inputCls} name="notes" rows={3} value={m().notes} />
              </Field>
              <div class="flex justify-between pt-2">
                <button class={btnPrimary} type="submit">
                  Save changes
                </button>
                <button class={btnDanger} type="button" onClick={remove}>
                  Delete member
                </button>
              </div>
            </form>
          </Card>
        )}
      </Show>
    </div>
  );
}
