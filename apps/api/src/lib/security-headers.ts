import { isHttpsRequest } from './request';

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * Policy for the single-page app. Scripts only come from this origin (and Turnstile);
 * styles allow inline because UI libraries inject <style> tags; images may come from any
 * HTTPS address because logos and photos are URLs; the app may talk to any server the
 * person chooses, so `connect-src` stays open.
 */
const SPA_CSP = [
  "default-src 'self'",
  `script-src 'self' ${TURNSTILE_ORIGIN}`,
  `frame-src ${TURNSTILE_ORIGIN}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: http:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** JSON responses never render, so they get a policy that allows nothing. */
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** Security headers added to every response. HSTS only when the request arrived over HTTPS. */
export function securityHeaders(request: Request): Record<string, string> {
  const pathname = new URL(request.url).pathname;
  const isApi = pathname === '/api' || pathname.startsWith('/api/');
  const headers: Record<string, string> = {
    'content-security-policy': isApi ? API_CSP : SPA_CSP,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cross-origin-opener-policy': 'same-origin',
    'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
  };
  if (isHttpsRequest(request)) {
    headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  }
  return headers;
}
