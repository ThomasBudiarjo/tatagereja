import { useQueries, useQuery } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useSearchParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/misc';
import { PrintButton, PrintSheet } from '@/components/ui/print';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { assetQuery, assetsQuery } from './api';
import { INVENTORY_TONE } from './facilities-lib';

/** Labels printed on one sheet at most. */
const LABELS_MAX = 60;
const ID_PATTERN = /^[0-9a-f-]{36}$/i;

/**
 * Printable QR labels, three across on A4. Each code opens the asset page, so whoever scans a
 * sticker on a projector or a chair lands on its record (after signing in). `?ids=` picks the
 * assets (the inventory list passes its page); without it the first assets by code are printed.
 */
export function AssetLabelsPage() {
  const { churchId, base, church } = useChurch();
  const { t } = useI18n();
  const [params] = useSearchParams();
  const ids = [
    ...new Set(
      (params.get('ids') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => ID_PATTERN.test(id)),
    ),
  ].slice(0, LABELS_MAX);
  const queries = useQueries({ queries: ids.map((id) => assetQuery(churchId, id)) });
  const everything = useQuery({
    ...assetsQuery(churchId, { sort: 'code', limit: LABELS_MAX }),
    enabled: ids.length === 0,
  });
  const assets =
    ids.length > 0
      ? queries.flatMap((query) => (query.data ? [query.data.asset] : []))
      : (everything.data?.items ?? []);
  const failed = ids.length > 0 ? queries.find((query) => query.isError) : everything;
  const loading = ids.length > 0 ? queries.some((query) => query.isPending) : everything.isPending;
  const placeholders = ids.length > 0 ? ids : Array.from({ length: 6 }, (_, index) => `${index}`);
  const origin = window.location.origin;

  return (
    <Page size="wide">
      <div data-print="hide" className="flex flex-col gap-5">
        <PageHeader
          title={t('facilities.labelsTitle')}
          description={t('facilities.labelsDescription')}
          icon={QrCode}
          tone={INVENTORY_TONE}
          breadcrumbs={[
            { label: t('facilities.nav'), to: `${base}/facilities` },
            { label: t('facilities.inventoryTitle'), to: `${base}/facilities/inventory` },
            { label: t('facilities.labelsTitle') },
          ]}
          actions={assets.length > 0 ? <PrintButton size="sm" /> : null}
        />
        {failed?.isError ? <Alert variant="warning">{getErrorMessage(failed.error)}</Alert> : null}
      </div>

      {!loading && assets.length === 0 ? (
        <EmptyState
          icon={QrCode}
          tone={INVENTORY_TONE}
          title={t('facilities.noLabels')}
          description={t('facilities.noLabelsBody')}
        />
      ) : (
        <PrintSheet className="p-4 sm:p-6">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
            {loading && assets.length === 0
              ? placeholders.map((id) => (
                  <li key={id}>
                    <Skeleton className="h-44 rounded-xl" />
                  </li>
                ))
              : assets.map((asset) => (
                  <li
                    key={asset.id}
                    className="flex break-inside-avoid flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-white p-3 text-center text-black print:rounded-none print:border-black/40"
                  >
                    <p className="w-full truncate text-[10px] font-semibold tracking-wide uppercase">
                      {church.name}
                    </p>
                    <QRCodeSVG
                      value={`${origin}${base}/facilities/inventory/${asset.id}`}
                      size={104}
                      level="M"
                      marginSize={0}
                      aria-label={t('facilities.qrFor', { code: asset.code })}
                    />
                    <p className="font-mono text-base leading-none font-bold">{asset.code}</p>
                    <p className="line-clamp-2 w-full text-xs leading-tight">{asset.name}</p>
                    <p className="text-[9px] text-black/60">{t('facilities.labelFooter')}</p>
                  </li>
                ))}
          </ul>
        </PrintSheet>
      )}
    </Page>
  );
}
