import { formatRecoveryCode } from '@tatagereja/shared';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Alert } from '@/components/ui/misc';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { downloadBlob } from '../api';

/** New recovery codes, shown once: copy, download as text or print. */
export function RecoveryCodesView({ codes }: { codes: string[] }) {
  const { t, formatDateTime } = useI18n();
  const { user } = useAuth();
  const formatted = codes.map(formatRecoveryCode);
  const text = [
    t('profile.recoveryFileTitle'),
    user?.email ?? '',
    formatDateTime(new Date()),
    '',
    ...formatted,
    '',
    t('profile.recoveryFileHint'),
  ].join('\n');

  const print = () => {
    const win = window.open('', '_blank', 'width=480,height=640');
    if (!win) return;
    win.document.title = t('profile.recoveryFileTitle');
    const pre = win.document.createElement('pre');
    pre.style.font = '16px/1.8 ui-monospace, monospace';
    pre.textContent = text;
    win.document.body.appendChild(pre);
    win.focus();
    win.print();
  };

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="warning" title={t('profile.recoveryOnceTitle')}>
        {t('profile.recoveryOnceBody')}
      </Alert>
      <ol
        className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-muted/40 p-3"
        aria-label={t('profile.recoveryCodes')}
      >
        {formatted.map((code) => (
          <li
            key={code}
            className="rounded-lg bg-card px-2 py-2 text-center font-mono text-sm font-semibold tracking-wider shadow-xs select-all"
          >
            {code}
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-3 gap-2">
        <CopyButton value={text} size="default" label={t('common.copy')} />
        <Button
          variant="outline"
          onClick={() =>
            downloadBlob(text, 'kode-pemulihan-tatagereja.txt', 'text/plain;charset=utf-8')
          }
        >
          <Download />
          <span className="hidden sm:inline">{t('common.download')}</span>
          <span className="sm:hidden">.txt</span>
        </Button>
        <Button variant="outline" onClick={print}>
          <Printer />
          {t('common.print')}
        </Button>
      </div>
    </div>
  );
}
