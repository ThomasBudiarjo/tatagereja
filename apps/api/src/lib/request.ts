/** Best-effort client IP for rate limiting, honouring common proxy headers. */
export function clientIp(
  request: Request,
  server?: { requestIP?: (req: Request) => { address: string } | null },
): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
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
  server?: { requestIP?: (req: Request) => { address: string } | null },
): RequestMeta {
  const ip = clientIp(request, server);
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
