import { createResource, createSignal, For, Show } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";
import { api } from "../lib/api";
import { SERVICE_TYPES, SERVICE_ROLES, type Service, type ServiceRole, type Member } from "../lib/types";
import { PageHeader, Card, Field, ErrorNote, EmptyState, inputCls, btnPrimary, btnDanger, btnSecondary } from "../components/ui";

export default function ServiceDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [service, { refetch: refetchService }] = createResource(() => params.id, (id) => api.get<Service>(`/services/${id}`));
  const [roles, { mutate: setRoles }] = createResource(() => params.id, (id) => api.get<ServiceRole[]>(`/services/${id}/roles`));
  const [members] = createResource(() => api.get<Member[]>("/members?status=active"));

  const [error, setError] = createSignal("");
  const [roleName, setRoleName] = createSignal<string>("Preacher");
  const [roleMember, setRoleMember] = createSignal("");

  const saveService = async (e: Event) => {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await api.patch<Service>(`/services/${params.id}`, {
        title: fd.get("title"),
        service_type: fd.get("service_type"),
        start_time: fd.get("start_time"),
        end_time: fd.get("end_time"),
        location: fd.get("location"),
        notes: fd.get("notes"),
      });
      refetchService();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save service");
    }
  };

  const addRole = async (e: Event) => {
    e.preventDefault();
    if (!roleMember()) return;
    setError("");
    try {
      const updated = await api.post<ServiceRole[]>(`/services/${params.id}/roles`, {
        role_name: roleName(),
        member_id: roleMember(),
        notes: "",
      });
      setRoles(updated);
      setRoleMember("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign role");
    }
  };

  const removeRole = async (roleID: string) => {
    setError("");
    try {
      setRoles(await api.delete<ServiceRole[]>(`/services/${params.id}/roles/${roleID}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove role");
    }
  };

  const removeService = async () => {
    if (!confirm("Delete this service? Its role assignments and attendance records are removed too.")) return;
    try {
      await api.delete(`/services/${params.id}`);
      navigate("/services");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete service");
    }
  };

  return (
    <div>
      <PageHeader title="Service detail" subtitle={service()?.title}>
        <A href={`/attendance/${params.id}`} class={btnSecondary}>
          Record attendance
        </A>
        <A href="/services" class={btnSecondary}>
          ← Back to services
        </A>
      </PageHeader>

      <ErrorNote message={error()} />

      <div class="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Show when={service()}>
          {(s) => (
            <Card title="Service info">
              <form class="space-y-3" onSubmit={saveService}>
                <Field label="Service name *">
                  <input class={inputCls} name="title" value={s().title} required />
                </Field>
                <div class="grid grid-cols-2 gap-3">
                  <Field label="Type *">
                    <select class={inputCls} name="service_type" value={s().service_type}>
                      <For each={SERVICE_TYPES}>{(t) => <option value={t}>{t}</option>}</For>
                    </select>
                  </Field>
                  <Field label="Location">
                    <input class={inputCls} name="location" value={s().location} />
                  </Field>
                  <Field label="Start *">
                    <input class={inputCls} name="start_time" type="datetime-local" value={s().start_time} required />
                  </Field>
                  <Field label="End">
                    <input class={inputCls} name="end_time" type="datetime-local" value={s().end_time} />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea class={inputCls} name="notes" rows={2} value={s().notes} />
                </Field>
                <div class="flex justify-between pt-2">
                  <button class={btnPrimary} type="submit">
                    Save changes
                  </button>
                  <button class={btnDanger} type="button" onClick={removeService}>
                    Delete service
                  </button>
                </div>
              </form>
            </Card>
          )}
        </Show>

        <Card title="Service roles (Pelayanan)">
          <Show when={(roles() ?? []).length > 0} fallback={<EmptyState message="No volunteers assigned yet." />}>
            <ul class="mb-4 divide-y divide-slate-100">
              <For each={roles()}>
                {(role) => (
                  <li class="flex items-center justify-between py-2 text-sm">
                    <span>
                      <span class="font-medium">{role.full_name}</span>
                      <span class="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{role.role_name}</span>
                    </span>
                    <button class="text-xs text-red-500 hover:underline" onClick={() => removeRole(role.id)}>
                      Remove
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>

          <form class="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4" onSubmit={addRole}>
            <div class="w-40">
              <Field label="Role">
                <select class={inputCls} value={roleName()} onChange={(e) => setRoleName(e.currentTarget.value)}>
                  <For each={SERVICE_ROLES}>{(r) => <option value={r}>{r}</option>}</For>
                </select>
              </Field>
            </div>
            <div class="min-w-40 flex-1">
              <Field label="Member">
                <select class={inputCls} value={roleMember()} onChange={(e) => setRoleMember(e.currentTarget.value)} required>
                  <option value="">Select member…</option>
                  <For each={members() ?? []}>{(m) => <option value={m.id}>{m.full_name}</option>}</For>
                </select>
              </Field>
            </div>
            <button class={btnPrimary} type="submit">
              Assign
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
