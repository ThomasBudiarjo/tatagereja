import { createResource, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { api } from "../lib/api";
import type { DashboardReport } from "../lib/types";
import { formatDateTime, formatDate } from "../lib/format";
import { PageHeader, Card, EmptyState, btnSecondary } from "../components/ui";

export default function ReportsPage() {
  const [report] = createResource(() => api.get<DashboardReport>("/reports/dashboard"));

  return (
    <div>
      <PageHeader title="Reports" subtitle="Laporan — key numbers and CSV exports">
        <a href="/api/reports/members.csv" class={btnSecondary} download="members.csv">
          ⬇ Members CSV
        </a>
        <a href="/api/reports/attendance.csv" class={btnSecondary} download="attendance.csv">
          ⬇ Attendance CSV
        </a>
      </PageHeader>

      <Show when={report()} fallback={<p class="text-slate-400">Loading…</p>}>
        {(r) => (
          <div class="space-y-6">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <div class="text-3xl font-bold text-indigo-600">{r().total_active_members}</div>
                <div class="text-sm text-slate-500">Total active members</div>
              </Card>
              <Card>
                <div class="text-3xl font-bold text-indigo-600">{r().total_families}</div>
                <div class="text-sm text-slate-500">Total families</div>
              </Card>
              <Card>
                <div class="text-3xl font-bold text-indigo-600">{r().upcoming_services.length}</div>
                <div class="text-sm text-slate-500">Upcoming services</div>
              </Card>
            </div>

            <Card title="Attendance per service">
              <Show when={r().recent_attendance.length > 0} fallback={<EmptyState message="No attendance recorded yet." />}>
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th class="py-2 pr-4">Service</th>
                      <th class="py-2 pr-4">When</th>
                      <th class="py-2 pr-4">Attended</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <For each={r().recent_attendance}>
                      {(a) => (
                        <tr>
                          <td class="py-2 pr-4">
                            <A href={`/attendance/${a.service_id}`} class="font-medium text-indigo-600 hover:underline">
                              {a.title}
                            </A>
                          </td>
                          <td class="py-2 pr-4 text-slate-600">{formatDateTime(a.start_time)}</td>
                          <td class="py-2 pr-4 text-slate-600">{a.count}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </Show>
            </Card>

            <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card title="This week's service schedule">
                <Show when={r().upcoming_services.length > 0} fallback={<EmptyState message="No upcoming services." />}>
                  <ul class="divide-y divide-slate-100">
                    <For each={r().upcoming_services}>
                      {(s) => (
                        <li class="py-2 text-sm">
                          <A href={`/services/${s.id}`} class="font-medium text-indigo-600 hover:underline">
                            {s.title}
                          </A>
                          <div class="text-slate-500">{formatDateTime(s.start_time)}</div>
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
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
