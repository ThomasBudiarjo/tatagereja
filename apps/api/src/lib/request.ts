import type { Locale } from '@tatagereja/shared';

type ServerLike = { requestIP?: (req: Request) => { address: string } | null };

/**
 * Best-effort client IP for rate limiting and audit entries.
 *
 * `X-Forwarded-For` is only honoured when the server sits behind `trustedProxies` reverse
 * proxies (`TRUST_PROXY`). Each proxy appends the address it saw, so the client address is the
 * entry that many places from the right; anything further left was sent by the client and
 * could be forged to dodge per-IP limits. Without trusted proxies the socket address is used.
 */
export function clientIp(
  request: Request,
  server: ServerLike | undefined,
  trustedProxies: number,
): string {
  if (trustedProxies > 0) {
    const forwarded = (request.headers.get('x-forwarded-for') ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const hop = forwarded[Math.max(0, forwarded.length - trustedProxies)];
    if (hop) return hop;
    const real = request.headers.get('x-real-ip')?.trim();
    if (real) return real;
  }
  try {
    const address = server?.requestIP?.(request)?.address;
    if (address) return address;
  } catch {
    // ignore
  }
  return 'unknown';
}

export type RequestMeta = { ip: string | null; userAgent: string | null };

/** Client IP and user agent for audit entries and login history, bounded in length. */
export function requestMeta(
  request: Request,
  server: ServerLike | undefined,
  trustedProxies: number,
): RequestMeta {
  const ip = clientIp(request, server, trustedProxies);
  const userAgent = request.headers.get('user-agent');
  return {
    ip: ip === 'unknown' ? null : ip.slice(0, 64),
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
  };
}

/** Whether the request reached us over HTTPS, directly or through a TLS-terminating proxy. */
export function isHttpsRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]?.trim().toLowerCase() === 'https';
  return new URL(request.url).protocol === 'https:';
}

/**
 * The interface language the client asked for with `Accept-Language` (the web app sends its
 * chosen language). Indonesian, the primary audience, unless English comes first.
 */
export function requestLocale(request: Request): Locale {
  const first = (request.headers.get('accept-language') ?? '').split(',')[0]?.trim().toLowerCase();
  return first?.startsWith('en') ? 'en' : 'id';
}
