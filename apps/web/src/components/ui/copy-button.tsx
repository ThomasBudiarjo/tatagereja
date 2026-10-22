import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { Button, type ButtonProps } from './button';

/** Copies text to the clipboard; uses a hidden textarea where the Clipboard API is missing. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

/** A copy button whose icon turns into a check for a moment after copying. */
export function CopyButton({
  value,
  label,
  copiedLabel,
  variant = 'outline',
  size = 'sm',
  iconOnly = false,
  ...props
}: Omit<ButtonProps, 'onClick' | 'value'> & {
  value: string;
  label?: string;
  copiedLabel?: string;
  iconOnly?: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  const text = copied ? (copiedLabel ?? t('common.copied')) : (label ?? t('common.copy'));
  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? (size === 'sm' ? 'icon-sm' : 'icon') : size}
      aria-label={iconOnly ? text : undefined}
      onClick={async () => {
        if (await copyText(value)) setCopied(true);
        else toast.error(t('common.copyFailed'));
      }}
      {...props}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      {iconOnly ? null : text}
      <span className="sr-only" aria-live="polite">
        {copied ? t('common.copied') : ''}
      </span>
    </Button>
  );
}
