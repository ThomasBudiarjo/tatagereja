import { isHttpsRequest } from './request';

/**
 * The origin the browser used to reach this server: the `Host` it sent (the first proxy's
 * `X-Forwarded-Host` behind trusted proxies) with the scheme it arrived over.
 */
export function requestOrigin(request: Request, trustedProxies: number): string | null {
  const forwarded =
    trustedProxies > 0 ? request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() : null;
  const host = forwarded || request.headers.get('host');
  if (!host) return null;
  return `${isHttpsRequest(request) ? 'https' : 'http'}://${host.toLowerCase()}`;
}

/**
 * Why a browser request must not use a cookie session, or null when it may: it came from
 * another site (`Sec-Fetch-Site`), or its `Origin` is neither this server nor `APP_URL` (the
 * development server proxies the API under its own origin). Requests without either header are
 * not from a modern browser page; for them the CSRF token alone decides.
 */
export function crossSiteReason(
  request: Request,
  options: { appUrl: string; trustProxy: number },
): string | null {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return `Sec-Fetch-Site ${site}`;
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const allowed = new Set<string>([new URL(options.appUrl).origin]);
  const own = requestOrigin(request, options.trustProxy);
  if (own) allowed.add(own);
  return allowed.has(origin.toLowerCase()) ? null : `Origin ${origin}`;
}
