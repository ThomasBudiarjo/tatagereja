import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'auto' | 'light' | 'dark';
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type ScriptUrlPolicy = { createScriptURL: (url: string) => string };
type TrustedTypesFactory = {
  createPolicy: (name: string, rules: { createScriptURL: (url: string) => string }) => unknown;
};

/*
 * The server's Content Security Policy requires Trusted Types: `script.src` only takes a value
 * made by a policy. This one lets exactly the Turnstile script through, nothing else.
 */
let scriptPolicy: ScriptUrlPolicy | null | undefined;
function turnstileScriptUrl(): string {
  if (scriptPolicy === undefined) {
    const factory = (window as { trustedTypes?: TrustedTypesFactory }).trustedTypes;
    scriptPolicy = factory
      ? (factory.createPolicy('tatagereja-turnstile', {
          createScriptURL: (url) => {
            if (url !== SCRIPT_SRC) throw new TypeError('Only the Turnstile script may load');
            return url;
          },
        }) as ScriptUrlPolicy)
      : null;
  }
  return scriptPolicy ? scriptPolicy.createScriptURL(SCRIPT_SRC) : SCRIPT_SRC;
}

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Turnstile')));
      return;
    }
    const script = document.createElement('script');
    script.src = turnstileScriptUrl();
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile'));
    document.head.appendChild(script);
  });
}

/** Renders the Cloudflare Turnstile challenge and reports the verification token. */
export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    void loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId = window.turnstile.render(container.current, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={container} className="min-h-16" />;
}
