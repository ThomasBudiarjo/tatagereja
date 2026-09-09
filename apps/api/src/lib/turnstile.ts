export type TurnstileVerifier = (token: string, remoteIp: string | null) => Promise<boolean>;

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function createTurnstileVerifier(
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): TurnstileVerifier {
  return async (token, remoteIp) => {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    try {
      const response = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body });
      if (!response.ok) return false;
      const result = (await response.json()) as { success?: boolean };
      return result.success === true;
    } catch {
      return false;
    }
  };
}
