import { Download } from 'lucide-react';
import * as React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from './button';

/** The QR encoder downloads with the first code shown, not with every page that may show one. */
const QRCodeSVG = React.lazy(() =>
  import('qrcode.react').then((module) => ({ default: module.QRCodeSVG })),
);

/**
 * A QR code on a white card (scanners need contrast in dark mode too), with an optional
 * caption and a PNG download for printing or sharing.
 */
export function QrDisplay({
  value,
  size = 200,
  caption,
  downloadName,
  className,
}: {
  value: string;
  size?: number;
  caption?: React.ReactNode;
  /** File name without extension; shows the download button when given. */
  downloadName?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const ref = React.useRef<HTMLDivElement>(null);

  const download = () => {
    const svg = ref.current?.querySelector('svg');
    if (!svg) return;
    const scale = 4;
    const data = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const padding = 16 * scale;
      canvas.width = size * scale + padding * 2;
      canvas.height = size * scale + padding * 2;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, padding, padding, size * scale, size * scale);
      const link = document.createElement('a');
      link.download = `${downloadName ?? 'qr-code'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
  };

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div
        ref={ref}
        className="rounded-2xl border border-border/70 bg-white p-4 shadow-soft"
        role="img"
        aria-label={t('common.qrCode')}
      >
        <React.Suspense
          fallback={
            <div
              className="animate-pulse rounded-md bg-muted"
              style={{ width: size, height: size }}
            />
          }
        >
          <QRCodeSVG value={value} size={size} level="M" marginSize={0} />
        </React.Suspense>
      </div>
      {caption ? (
        <div className="max-w-xs text-center text-sm text-muted-foreground">{caption}</div>
      ) : null}
      {downloadName ? (
        <Button variant="outline" size="sm" onClick={download}>
          <Download />
          {t('common.downloadQr')}
        </Button>
      ) : null}
    </div>
  );
}
