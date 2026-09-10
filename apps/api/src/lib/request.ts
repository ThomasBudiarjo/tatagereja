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
