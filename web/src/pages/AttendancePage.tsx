import { createResource, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { api } from "../lib/api";
import type { Service } from "../lib/types";
import { formatDateTime } from "../lib/format";
import { PageHeader, Card, EmptyState, btnSecondary } from "../components/ui";

export default function AttendancePage() {
  const [services] = createResource(() => api.get<Service[]>("/services"));

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Kehadiran — pick a service to record or review attendance" />

      <Card>
        <Show when={services()} fallback={<p class="text-slate-400">Loading…</p>}>
          {(list) => (
            <Show when={list().length > 0} fallback={<EmptyState message="No services yet. Create a service first." />}>
              <ul class="divide-y divide-slate-100">
                <For each={list()}>
                  {(s) => (
                    <li class="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <div class="font-medium text-slate-900">{s.title}</div>
                        <div class="text-sm text-slate-500">
                          {s.service_type} · {formatDateTime(s.start_time)}
                        </div>
                      </div>
                      <div class="flex items-center gap-3">
                        <span class="text-sm text-slate-500">{s.attendance_count} recorded</span>
                        <A href={`/attendance/${s.id}`} class={btnSecondary}>
                          {s.attendance_count > 0 ? "Edit attendance" : "Record attendance"}
                        </A>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          )}
        </Show>
      </Card>
    </div>
  );
}
