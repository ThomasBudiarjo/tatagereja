import type * as React from 'react';
import { canViewRegistry, recordPrimaryRole, type RegistryRecord } from '@tatagereja/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ScrollText } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { PrintButton } from '@/components/ui/print';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { getErrorMessage, isApiClientError } from '@/lib/api';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { recordQuery } from './api';
import { RECORD_TYPE_META, recordTitle, roleLabelKey } from './records-lib';
import { RecordNotFound } from './records-ui';

/** What the certificate says happened, per type. */
const STATEMENT_KEYS: Record<RegistryRecord['type'], MessageKey> = {
  baptism: 'records.certStatementBaptism',
  sidi: 'records.certStatementSidi',
  marriage: 'records.certStatementMarriage',
  child_dedication: 'records.certStatementDedication',
  transfer_in: 'records.certStatementTransferIn',
  transfer_out: 'records.certStatementTransferOut',
  death: 'records.certStatementDeath',
  custom: 'records.certStatementCustom',
};

const PAPER_TONES = {
  '--tone-ink': 'oklch(0.45 var(--tone-c) var(--tone-h))',
  '--tone-solid': 'oklch(0.56 var(--tone-c) var(--tone-h))',
  '--tone-soft': 'oklch(0.953 calc(var(--tone-c) * 0.28) var(--tone-h))',
} as React.CSSProperties;

/** A printable certificate (surat baptis, surat sidi, surat nikah gerejawi, atestasi, ...). */
export function CertificatePage() {
  const { recordId = '' } = useParams();
  const { churchId, base, access } = useChurch();
  const { t } = useI18n();
  const query = useQuery(recordQuery(churchId, recordId));
  useDocumentTitle(
    query.data
      ? `${t(RECORD_TYPE_META[query.data.record.type].certificateKey)} · ${query.data.record.number}`
      : t('records.certificate'),
  );

  if (query.isPending) {
    return (
      <Page>
        <Skeleton className="mx-auto aspect-[210/297] w-full max-w-[210mm] rounded-xl" />
      </Page>
    );
  }
  if (query.isError) {
    const gone = isApiClientError(query.error) && query.error.status === 404;
    return (
      <Page>
        <PageHeader
          title={t('records.certificate')}
          backTo={canViewRegistry(access) ? `${base}/records` : `${base}/records/mine`}
        />
        {gone ? (
          <RecordNotFound />
        ) : (
          <ErrorState
            error={query.error}
            message={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )}
      </Page>
    );
  }

  const { record, certificate } = query.data;
  return (
    <Page className="print:p-0">
      <style>{'@page { size: A4 portrait; margin: 10mm; }'}</style>
      <div data-print="hide" className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2.5 text-muted-foreground">
          <Link to={`${base}/records/${record.id}`}>
            <ArrowLeft />
            {recordTitle(record)}
          </Link>
        </Button>
        <PrintButton size="sm" label={t('records.printCertificate')} />
      </div>
      {record.status === 'voided' ? (
        <div data-print="hide">
          <Alert variant="error" title={t('records.voidedCertificate')} />
        </div>
      ) : null}
      <Certificate record={record} certificate={certificate} />
    </Page>
  );
}

function Certificate({
  record,
  certificate,
}: {
  record: RegistryRecord;
  certificate: {
    signatoryName: string | null;
    signatoryTitle: string | null;
    footer: string | null;
  };
}) {
  const { church } = useChurch();
  const { t, formatDate } = useI18n();
  const meta = RECORD_TYPE_META[record.type];
  const primary = recordPrimaryRole(record.type);
  const subjects = record.people.filter((person) => person.role === primary);
  const father = record.people.find((person) => person.role === 'father');
  const mother = record.people.find((person) => person.role === 'mother');
  const companions = record.people.filter((person) =>
    ['godparent', 'witness'].includes(person.role),
  );
  const details = record.details;
  const parents = [father?.name, mother?.name].filter(Boolean).join(` ${t('records.certAnd')} `);
  const city = church.city ?? church.address ?? '';

  return (
    <article
      data-tone={meta.tone}
      aria-label={t(meta.certificateKey)}
      // Paper is always light: keep the light tone inks in the dark theme too.
      style={PAPER_TONES}
      className="relative mx-auto w-full max-w-[210mm] overflow-hidden rounded-xl border bg-white p-3 text-neutral-900 shadow-soft print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-4"
    >
      <div className="rounded-lg border-[3px] border-double border-tone p-1.5">
        <div className="relative flex min-h-[250mm] flex-col items-center rounded-md border border-tone/50 px-5 py-8 text-center font-serif sm:px-12 sm:py-12 print:min-h-[270mm]">
          {record.status === 'voided' ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-[18vw] font-black tracking-widest text-red-600/15 uppercase select-none sm:text-8xl"
              style={{ transform: 'rotate(-24deg)' }}
            >
              {t('records.voidedStamp')}
            </span>
          ) : null}

          <header className="flex flex-col items-center gap-2">
            {church.logoUrl ? (
              <img src={church.logoUrl} alt="" className="size-16 object-contain sm:size-20" />
            ) : (
              <span className="flex size-14 items-center justify-center rounded-full border-2 border-tone text-tone-ink sm:size-16">
                <ScrollText className="size-7" aria-hidden />
              </span>
            )}
            <p className="text-lg font-bold tracking-wide uppercase sm:text-xl">{church.name}</p>
            {church.address || church.city ? (
              <p className="font-sans text-xs text-neutral-600">
                {[church.address, church.city].filter(Boolean).join(', ')}
              </p>
            ) : null}
          </header>

          <div aria-hidden className="my-6 flex w-full max-w-sm items-center gap-3 text-tone-ink">
            <span className="h-px flex-1 bg-current opacity-40" />
            <meta.icon className="size-5" />
            <span className="h-px flex-1 bg-current opacity-40" />
          </div>

          <h1 className="text-2xl font-bold tracking-[0.18em] text-tone-ink uppercase sm:text-3xl">
            {t(meta.certificateKey)}
          </h1>
          <p className="mt-2 font-sans text-sm text-neutral-600">
            {t('records.certNumber', { number: record.number })}
          </p>

          <p className="mt-8 text-base italic sm:text-lg">{t('records.certIntro')}</p>
          <div className="mt-3 flex flex-col items-center gap-1">
            {subjects.map((person, index) => (
              <div key={person.id} className="flex flex-col items-center">
                {index > 0 ? (
                  <span className="my-1 text-base italic">{t('records.certAnd')}</span>
                ) : null}
                <p className="text-2xl font-bold sm:text-[2rem]">{person.name}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex max-w-lg flex-col gap-1 text-base leading-relaxed">
            {details.birthPlace || details.birthDate ? (
              <p>
                {details.birthPlace && details.birthDate
                  ? t('records.certBorn', {
                      place: details.birthPlace,
                      date: formatDate(details.birthDate, 'dateLong'),
                    })
                  : details.birthPlace
                    ? t('records.certBornPlace', { place: details.birthPlace })
                    : t('records.certBornDate', {
                        date: formatDate(details.birthDate ?? '', 'dateLong'),
                      })}
              </p>
            ) : null}
            {parents && record.type !== 'marriage' ? (
              <p>{t('records.certChildOf', { parents })}</p>
            ) : null}
          </div>

          <p className="mt-6 max-w-lg text-lg leading-relaxed text-balance">
            {t(STATEMENT_KEYS[record.type], {
              church: details.otherChurchName ?? '—',
              milestone: record.subtype ?? '',
            })}
          </p>
          <p className="mt-2 max-w-lg text-base leading-relaxed">
            {t('records.certOn', { date: formatDate(record.date, 'dateLong') })}
            {record.place ? ` ${t('records.certAt', { place: record.place })}` : ''}
            {record.officiantName ? `, ${t('records.certBy', { name: record.officiantName })}` : ''}
            .
          </p>
          {record.type === 'death' && (details.funeralDate || details.burialPlace) ? (
            <p className="mt-2 max-w-lg text-base leading-relaxed">
              {t('records.certBuried', {
                date: details.funeralDate ? formatDate(details.funeralDate, 'dateLong') : '—',
                place: details.burialPlace ?? '—',
              })}
            </p>
          ) : null}
          {record.type === 'marriage' && details.civilRegistrationNumber ? (
            <p className="mt-2 font-sans text-sm text-neutral-600">
              {t('records.certCivil', { number: details.civilRegistrationNumber })}
            </p>
          ) : null}
          {(record.type === 'transfer_in' || record.type === 'transfer_out') &&
          details.letterNumber ? (
            <p className="mt-2 font-sans text-sm text-neutral-600">
              {t('records.certLetter', { number: details.letterNumber })}
            </p>
          ) : null}

          {details.verse ? (
            <blockquote className="mt-6 max-w-md border-y border-tone/40 px-4 py-3 text-base italic">
              {details.verse}
            </blockquote>
          ) : null}

          {companions.length > 0 ? (
            <div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-2 font-sans text-sm">
              {companions.map((person) => (
                <p key={person.id}>
                  <span className="text-neutral-600">
                    {t(roleLabelKey(record.type, person.role))}:{' '}
                  </span>
                  <span className="font-medium">{person.name}</span>
                </p>
              ))}
            </div>
          ) : null}

          <div className="mt-auto flex w-full justify-end pt-12">
            <div className="flex min-w-56 flex-col items-center text-base">
              <p>
                {city ? `${city}, ` : ''}
                {formatDate(new Date(), 'dateLong')}
              </p>
              {certificate.signatoryTitle ? (
                <p className="mt-1">{certificate.signatoryTitle}</p>
              ) : null}
              <span aria-hidden className="h-20" />
              <p className="min-w-56 border-t border-neutral-500 pt-1 font-bold">
                {certificate.signatoryName ?? ' '}
              </p>
            </div>
          </div>

          {certificate.footer ? (
            <p className="mt-8 font-sans text-xs text-neutral-500 italic">{certificate.footer}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
