import { createResource, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { api } from "../lib/api";
import { SERVICE_TYPES, type Service } from "../lib/types";
import { formatDateTime } from "../lib/format";
import { PageHeader, Card, Modal, Field, ErrorNote, EmptyState, inputCls, btnPrimary } from "../components/ui";

export default function ServicesPage() {
  const [services, { refetch }] = createResource(() => api.get<Service[]>("/services"));
  const [showCreate, setShowCreate] = createSignal(false);
  const [error, setError] = createSignal("");

  const create = async (e: Event) => {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await api.post<Service>("/services", {
        title: fd.get("title"),
        service_type: fd.get("service_type"),
        start_time: fd.get("start_time"),
        end_time: fd.get("end_time"),
        location: fd.get("location"),
        notes: fd.get("notes"),
      });
      setShowCreate(false);
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create service");
    }
  };

  return (
    <div>
      <PageHeader title="Services" subtitle="Ibadah — service schedule and details">
        <button class={btnPrimary} onClick={() => setShowCreate(true)}>
          + Add service
        </button>
      </PageHeader>

      <Card>
        <Show when={services()} fallback={<p class="text-slate-400">Loading…</p>}>
          {(list) => (
            <Show when={list().length > 0} fallback={<EmptyState message="No services yet. Schedule your first service." />}>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th class="py-2 pr-4">Service</th>
                      <th class="py-2 pr-4">Type</th>
                      <th class="py-2 pr-4">When</th>
                      <th class="py-2 pr-4">Location</th>
                      <th class="py-2 pr-4">Roles</th>
                      <th class="py-2 pr-4">Attendance</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <For each={list()}>
                      {(s) => (
                        <tr class="hover:bg-slate-50">
                          <td class="py-2 pr-4">
                            <A href={`/services/${s.id}`} class="font-medium text-indigo-600 hover:underline">
                              {s.title}
                            </A>
                          </td>
                          <td class="py-2 pr-4 text-slate-600">{s.service_type}</td>
                          <td class="py-2 pr-4 text-slate-600">{formatDateTime(s.start_time)}</td>
                          <td class="py-2 pr-4 text-slate-600">{s.location || "—"}</td>
                          <td class="py-2 pr-4 text-slate-600">{s.role_count}</td>
                          <td class="py-2 pr-4 text-slate-600">{s.attendance_count}</td>
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

      <Modal open={showCreate()} title="Add service" onClose={() => setShowCreate(false)}>
        <form class="space-y-3" onSubmit={create}>
          <ErrorNote message={error()} />
          <Field label="Service name *">
            <input class={inputCls} name="title" required placeholder="Sunday Service" />
          </Field>
          <div class="grid grid-cols-2 gap-3">
            <Field label="Type *">
              <select class={inputCls} name="service_type">
                <For each={SERVICE_TYPES}>{(t) => <option value={t}>{t}</option>}</For>
              </select>
            </Field>
            <Field label="Location">
              <input class={inputCls} name="location" />
            </Field>
            <Field label="Start *">
              <input class={inputCls} name="start_time" type="datetime-local" required />
            </Field>
            <Field label="End">
              <input class={inputCls} name="end_time" type="datetime-local" />
            </Field>
          </div>
          <Field label="Notes">
            <textarea class={inputCls} name="notes" rows={2} />
          </Field>
          <button class={`${btnPrimary} w-full justify-center`} type="submit">
            Save service
          </button>
        </form>
      </Modal>
    </div>
  );
}
