import { createResource, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { api } from "../lib/api";
import type { DashboardReport } from "../lib/types";
import { formatDateTime, formatDate } from "../lib/format";
import { PageHeader, Card, EmptyState } from "../components/ui";

export default function DashboardPage() {
  const [report] = createResource(() => api.get<DashboardReport>("/reports/dashboard"));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your church at a glance" />
      <Show when={report()} fallback={<p class="text-slate-400">Loading…</p>}>
        {(r) => (
          <div class="space-y-6">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <div class="text-3xl font-bold text-indigo-600">{r().total_active_members}</div>
                <div class="text-sm text-slate-500">Active members</div>
              </Card>
              <Card>
                <div class="text-3xl font-bold text-indigo-600">{r().total_members}</div>
                <div class="text-sm text-slate-500">Total members</div>
              </Card>
              <Card>
                <div class="text-3xl font-bold text-indigo-600">{r().total_families}</div>
                <div class="text-sm text-slate-500">Families</div>
              </Card>
            </div>

            <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card title="Upcoming services">
                <Show when={r().upcoming_services.length > 0} fallback={<EmptyState message="No upcoming services scheduled." />}>
                  <ul class="divide-y divide-slate-100">
                    <For each={r().upcoming_services}>
                      {(s) => (
                        <li class="py-2">
                          <A href={`/services/${s.id}`} class="font-medium text-indigo-600 hover:underline">
                            {s.title}
                          </A>
                          <div class="text-sm text-slate-500">
                            {s.service_type} · {formatDateTime(s.start_time)}
                            {s.location ? ` · ${s.location}` : ""}
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </Card>

              <Card title="This week's service roles">
                <Show when={r().this_week_roles.length > 0} fallback={<EmptyState message="No roles assigned for this week." />}>
                  <ul class="divide-y divide-slate-100">
                    <For each={r().this_week_roles}>
                      {(role) => (
                        <li class="flex items-center justify-between py-2 text-sm">
                          <span>
                            <span class="font-medium">{role.full_name}</span>
                            <span class="text-slate-500"> — {role.role_name}</span>
                          </span>
                          <A href={`/services/${role.service_id}`} class="text-slate-400 hover:text-indigo-600">
                            {role.service_title}
                          </A>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </Card>

              <Card title="Birthdays this month">
                <Show when={r().birthdays_this_month.length > 0} fallback={<EmptyState message="No birthdays this month." />}>
                  <ul class="divide-y divide-slate-100">
                    <For each={r().birthdays_this_month}>
                      {(b) => (
                        <li class="flex items-center justify-between py-2 text-sm">
                          <A href={`/members/${b.id}`} class="font-medium text-indigo-600 hover:underline">
                            {b.full_name}
                          </A>
                          <span class="text-slate-500">{formatDate(b.birth_date)}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </Card>

              <Card title="Recent attendance">
                <Show when={r().recent_attendance.length > 0} fallback={<EmptyState message="No attendance recorded yet." />}>
                  <ul class="divide-y divide-slate-100">
                    <For each={r().recent_attendance}>
                      {(a) => (
                        <li class="flex items-center justify-between py-2 text-sm">
                          <A href={`/attendance/${a.service_id}`} class="font-medium text-indigo-600 hover:underline">
                            {a.title}
                          </A>
                          <span class="text-slate-500">
                            {a.count} attended · {formatDateTime(a.start_time)}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </Card>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
