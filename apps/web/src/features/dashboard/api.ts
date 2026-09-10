import { dashboardSchema } from '@tatagereja/shared';
import { queryOptions } from '@tanstack/react-query';
import { request } from '@/lib/api';
import { keys } from '@/lib/keys';

export const dashboardQuery = (churchId: string) =>
  queryOptions({
    queryKey: keys.dashboard(churchId),
    queryFn: () => request(dashboardSchema, { url: `/churches/${churchId}/dashboard` }),
  });
