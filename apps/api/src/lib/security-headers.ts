import { isHttpsRequest } from './request';

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * Policy for the single-page app. Scripts only come from this origin (and Turnstile): no inline
 * script, no `eval`, so injected markup cannot run code. Styles allow inline because UI
 * libraries set `style` attributes and inject <style> tags; images may come from any HTTPS
 * address because logos and photos are URLs; the app may talk to any server the person
 * chooses, so `connect-src` stays open.
 */
const SPA_CSP = [
  "default-src 'self'",
  `script-src 'self' ${TURNSTILE_ORIGIN}`,
  "script-src-attr 'none'",
  `frame-src ${TURNSTILE_ORIGIN}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: http:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** JSON responses never render, so they get a policy that allows nothing. */
const API_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox";

/**
 * Powerful features nothing in the app uses are switched off for the page and anything it
 * embeds; the camera stays available to the page itself for scanning QR codes.
 */
const PERMISSIONS_POLICY = [
  'camera=(self)',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'hid=()',
  'midi=()',
  'magnetometer=()',
  'gyroscope=()',
  'accelerometer=()',
  'display-capture=()',
  'browsing-topics=()',
].join(', ');

/** Two years, sub-domains included and `preload`: what hstspreload.org asks for. */
const HSTS = 'max-age=63072000; includeSubDomains; preload';

/**
 * Security headers added to every response. HSTS only when the request arrived over HTTPS;
 * API responses are not stored by browsers or proxies unless a route allows it.
 */
export function securityHeaders(request: Request): Record<string, string> {
  const pathname = new URL(request.url).pathname;
  const isApi = pathname === '/api' || pathname.startsWith('/api/');
  const https = isHttpsRequest(request);
  const headers: Record<string, string> = {
    'content-security-policy': isApi
      ? API_CSP
      : https
        ? `${SPA_CSP}; upgrade-insecure-requests`
        : SPA_CSP,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cross-origin-opener-policy': 'same-origin',
    // Other sites cannot embed the app's files or answers (Spectre-style reads); the app's
    // own API calls from another origin are CORS requests, which this does not affect.
    'cross-origin-resource-policy': 'same-origin',
    'origin-agent-cluster': '?1',
    'x-permitted-cross-domain-policies': 'none',
    'x-dns-prefetch-control': 'off',
    'permissions-policy': PERMISSIONS_POLICY,
  };
  // API answers carry member data; routes that may be cached (the iCal feed) say so themselves.
  if (isApi) headers['cache-control'] = 'no-store';
  if (https) headers['strict-transport-security'] = HSTS;
  return headers;
}
