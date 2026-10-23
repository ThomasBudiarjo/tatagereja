import { fullName } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { PrintButton, PrintHeader, PrintSheet } from '@/components/ui/print';
import { SkeletonText } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { serviceQuery } from './api';
import { liturgySchedule, preacherOf, useDuration, useLiturgyTypeLabel } from './worship-lib';

/** A printable order of service: times, items, leaders and who serves. */
export function RunSheetPage() {
  const { serviceId = '' } = useParams();
  const { churchId, base, church } = useChurch();
  const { t, formatDate, formatTime } = useI18n();
  const duration = useDuration();
  const typeLabel = useLiturgyTypeLabel();
  const query = useQuery(serviceQuery(churchId, serviceId));
  useDocumentTitle(
    query.data
      ? `${t('worship.runSheetTitle')} · ${query.data.service.title}`
      : t('worship.runSheetTitle'),
  );

  if (query.isPending) {
    return (
      <Page>
        <SkeletonText lines={10} />
      </Page>
    );
  }
  if (query.isError) {
    return (
      <Page>
        <ErrorState
          error={query.error}
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      </Page>
    );
  }

  const { service, liturgy, roster } = query.data;
  const rows = liturgySchedule(service.startsAt, liturgy);
  const teams = [...new Set(roster.map((item) => item.teamName))];
  const preacher = preacherOf(service);

  return (
    <Page className="print:p-0">
      <div data-print="hide" className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2.5 text-muted-foreground">
          <Link to={`${base}/worship/services/${service.id}`}>
            <ArrowLeft />
            {t('worship.backToService')}
          </Link>
        </Button>
        <PrintButton size="sm" label={t('worship.printRunSheet')} />
      </div>
      <PrintSheet className="flex flex-col gap-6 text-[15px]">
        <PrintHeader
          churchName={church.name}
          logoUrl={church.logoUrl}
          title={t('worship.runSheetTitle')}
          subtitle={service.title}
        />
        <header className="flex flex-col gap-1">
          {service.serviceTypeName ? (
            <p className="text-overline text-muted-foreground">{service.serviceTypeName}</p>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight">{service.title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(service.startsAt, 'dateLong')} · {formatTime(service.startsAt)}
            {service.location ? ` · ${service.location}` : ''}
          </p>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {service.theme ? (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t('worship.theme')}:</dt>
                <dd className="font-medium italic">{service.theme}</dd>
              </div>
            ) : null}
            {preacher ? (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t('worship.preacher')}:</dt>
                <dd className="font-medium">{preacher}</dd>
              </div>
            ) : null}
            {service.scriptureReadings.length > 0 ? (
              <div className="flex gap-2 sm:col-span-2">
                <dt className="text-muted-foreground">{t('worship.readings')}:</dt>
                <dd className="font-medium">{service.scriptureReadings.join('; ')}</dd>
              </div>
            ) : null}
          </dl>
        </header>

        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline justify-between border-b pb-1.5 text-base font-bold">
            {t('worship.tabLiturgy')}
            {service.totalMinutes > 0 ? (
              <span className="text-sm font-normal text-muted-foreground">
                {t('worship.totalDuration', { duration: duration(service.totalMinutes) })}
              </span>
            ) : null}
          </h2>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('worship.liturgyEmptyView')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="w-14 py-1.5 pr-2 font-medium">{t('worship.startTime')}</th>
                    <th className="py-1.5 pr-2 font-medium">{t('worship.itemTitle')}</th>
                    <th className="hidden py-1.5 pr-2 font-medium sm:table-cell">
                      {t('worship.leader')}
                    </th>
                    <th className="w-16 py-1.5 text-right font-medium">
                      {t('worship.itemDuration')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map(({ item, at }) => (
                    <tr key={item.id} className="break-inside-avoid align-top">
                      <td className="py-2 pr-2 tabular">{formatTime(at)}</td>
                      <td className="py-2 pr-2">
                        <p className="font-semibold">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            typeLabel(item.type),
                            item.songTitle && item.songTitle !== item.title ? item.songTitle : null,
                            item.songKey ? `${t('worship.key')} ${item.songKey}` : null,
                            item.notes,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        <p className="text-xs sm:hidden">
                          {item.person ? fullName(item.person) : item.personName}
                        </p>
                      </td>
                      <td className="hidden py-2 pr-2 sm:table-cell">
                        {item.person ? fullName(item.person) : (item.personName ?? '')}
                      </td>
                      <td className="py-2 text-right tabular">
                        {item.durationMinutes ? item.durationMinutes : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="flex break-inside-avoid flex-col gap-2">
          <h2 className="border-b pb-1.5 text-base font-bold">{t('worship.runSheetRoster')}</h2>
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('worship.noRosterView')}</p>
          ) : (
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {teams.map((team) => (
                <div key={team} className="break-inside-avoid">
                  <h3 className="mb-1 text-sm font-bold">{team}</h3>
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {roster
                      .filter((item) => item.teamName === team && item.status !== 'declined')
                      .map((item) => (
                        <li key={item.id} className="flex justify-between gap-3">
                          <span className="text-muted-foreground">{item.positionName}</span>
                          <span className="text-right font-medium">{fullName(item.person)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </PrintSheet>
    </Page>
  );
}
