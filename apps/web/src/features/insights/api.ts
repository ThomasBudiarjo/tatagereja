import { reportSchema, type ReportKind, type ReportQuery } from '@tatagereja/shared';
import { queryOptions } from '@tanstack/react-query';
import { api, request } from '@/lib/api';
import { churchScope } from '@/lib/keys';

/*
 * Reports read data from every module; they are refetched when opened (a minute of staleness)
 * rather than invalidated by each module's writes.
 */

export type ReportParams = Pick<ReportQuery, 'from' | 'to' | 'interval' | 'locale'> & {
  groupId?: string;
};

export const insightsKeys = {
  all: (churchId: string) => [...churchScope(churchId), 'insights'] as const,
  report: (churchId: string, kind: ReportKind, params: ReportParams) =>
    [...insightsKeys.all(churchId), 'report', kind, params] as const,
};

const path = (churchId: string, kind: ReportKind) =>
  `/churches/${churchId}/insights/reports/${kind}`;

const clean = (params: ReportParams) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );

export const reportQuery = (churchId: string, kind: ReportKind, params: ReportParams) =>
  queryOptions({
    queryKey: insightsKeys.report(churchId, kind, params),
    queryFn: () => request(reportSchema, { url: path(churchId, kind), params: clean(params) }),
    staleTime: 60_000,
  });

/** Downloads a report as CSV through the authenticated client and saves it. */
export async function downloadReportCsv(churchId: string, kind: ReportKind, params: ReportParams) {
  const response = await api.get<Blob>(path(churchId, kind), {
    params: { ...clean(params), format: 'csv' },
    responseType: 'blob',
  });
  const href = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = href;
  link.download = `laporan-${kind.replace(/_/g, '-')}-${params.from}-${params.to}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
