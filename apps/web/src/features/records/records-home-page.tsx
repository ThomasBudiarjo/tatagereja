import { canManageRecords, localize, REGISTRY_RECORD_TYPE_LABELS } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { BookOpenText, Ban, ScrollText } from 'lucide-react';
import { Link } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader, Section } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { DataList } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { overviewQuery } from './api';
import { RECORDS_TONE, RECORD_TYPE_META, recordTitle } from './records-lib';
import {
  NewRecordMenu,
  RecordNumber,
  RecordStatusBadge,
  RecordTypeBadge,
  RecordTypeIcon,
  RecordsNav,
} from './records-ui';

/** The module home: this year's register at a glance and the latest entries. */
export function RecordsHomePage() {
  const { churchId, base, access } = useChurch();
  const { t, locale, formatNumber, formatDate, formatRelative } = useI18n();
  const overview = useQuery(overviewQuery(churchId));
  const canManage = canManageRecords(access);
  const data = overview.data;
  const empty = data ? data.types.every((type) => type.total === 0) && data.voided === 0 : false;

  return (
    <Page size="wide">
      <PageHeader
        title={t('records.nav')}
        description={t('records.homeDescription')}
        icon={ScrollText}
        tone={RECORDS_TONE}
        actions={<NewRecordMenu />}
      />
      <RecordsNav />

      {overview.isPending ? (
        <>
          <SkeletonStats count={8} />
          <SkeletonList rows={5} />
        </>
      ) : overview.isError ? (
        <ErrorState
          error={overview.error}
          message={getErrorMessage(overview.error)}
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
        />
      ) : data && empty ? (
        <EmptyState
          icon={BookOpenText}
          tone={RECORDS_TONE}
          title={t('records.emptyTitle')}
          description={canManage ? t('records.emptyBodyManage') : t('records.emptyBody')}
          action={
            canManage ? <NewRecordMenu size="default" label={t('records.firstRecord')} /> : null
          }
        />
      ) : data ? (
        <>
          <Section
            title={t('records.yearSummary', { year: String(data.year) })}
            description={t('records.yearSummaryHint')}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {data.types.map((item) => {
                const meta = RECORD_TYPE_META[item.type];
                return (
                  <StatCard
                    key={item.type}
                    label={localize(REGISTRY_RECORD_TYPE_LABELS[item.type], locale)}
                    value={formatNumber(item.thisYear)}
                    hint={
                      item.lastNumber ? (
                        <span
                          className="font-mono text-xs tabular"
                          title={t('records.lastNumber', { number: item.lastNumber })}
                        >
                          {item.lastNumber}
                        </span>
                      ) : (
                        t('records.totalAllYears', { count: item.total })
                      )
                    }
                    icon={meta.icon}
                    tone={meta.tone}
                    to={`${base}/records/register?type=${item.type}&year=${data.year}`}
                  />
                );
              })}
            </div>
          </Section>

          <Section
            title={t('records.recentTitle')}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to={`${base}/records/register`}>{t('records.openRegister')}</Link>
              </Button>
            }
          >
            <DataList
              items={data.recent}
              getKey={(record) => record.id}
              href={(record) => `${base}/records/${record.id}`}
              leading={(record) => <RecordTypeIcon type={record.type} />}
              title={(record) => (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{recordTitle(record)}</span>
                  {record.status === 'voided' ? <RecordStatusBadge status="voided" /> : null}
                </span>
              )}
              subtitle={(record) =>
                [
                  formatDate(record.date, 'dateShort'),
                  t('records.enteredAgo', { when: formatRelative(record.createdAt) }),
                ]
                  .filter(Boolean)
                  .join(' · ')
              }
              trailing={(record) => (
                <span className="hidden flex-col items-end gap-1 sm:flex">
                  <RecordTypeBadge record={record} />
                  <RecordNumber number={record.number} />
                </span>
              )}
            />
            {data.voided > 0 ? (
              <Link
                to={`${base}/records/register?status=voided`}
                className="flex min-h-11 w-fit items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Ban className="size-3.5" />
                {t('records.voidedCount', { count: data.voided })}
              </Link>
            ) : null}
          </Section>
        </>
      ) : null}
    </Page>
  );
}
