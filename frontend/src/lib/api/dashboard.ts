import { createQuery } from '@tanstack/svelte-query';
import { apiClient } from './client';
import type { BirthdayEntry } from '$lib/types';

interface BirthdaysResponse {
  data: BirthdayEntry[];
  days: number;
  total: number;
}

export function dashboardBirthdaysQuery(days: () => number = () => 30) {
  return createQuery({
    queryKey: ['dashboard', 'birthdays', days()],
    queryFn: () =>
      apiClient.get<BirthdaysResponse>(`/dashboard/birthdays?days=${days()}`),
  });
}
